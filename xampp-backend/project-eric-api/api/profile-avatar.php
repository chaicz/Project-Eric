<?php
/**
 * Avatar API - The signed-in account's profile picture.
 *
 * POST /api/profile/avatar
 * Body: { "avatar": "data:image/png;base64,...." }
 * Header: Authorization: Bearer <token>
 *
 * The picture is stored as a file under `uploads/avatars/` and the
 * public path is kept on the `users` row, so the header avatar and the
 * profile page always show the same image.
 *
 * The data URL is validated before it is written: only PNG, JPEG and
 * WEBP are accepted, and the decoded file has to be a real image of a
 * bounded size. A row is only updated after the file landed on disk.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

// 2 MB of decoded image data is plenty for an avatar.
define('AVATAR_MAX_BYTES', 2 * 1024 * 1024);

$allowedTypes = [
    'image/png'  => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
];

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();

    $body = getRequestBody();
    $dataUrl = trim((string) ($body['avatar'] ?? ''));

    if ($dataUrl === '') {
        sendError('An avatar is required', 400);
    }

    // "data:<mime>;base64,<payload>"
    if (!preg_match('/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/is', $dataUrl, $matches)) {
        sendError('The avatar must be a base64 data URL', 400);
    }

    $mime = strtolower($matches[1]);
    if (!isset($allowedTypes[$mime])) {
        sendError('The avatar must be a PNG, JPEG or WEBP image', 400);
    }

    $binary = base64_decode($matches[2], true);
    if ($binary === false || $binary === '') {
        sendError('The avatar could not be decoded', 400);
    }

    if (strlen($binary) > AVATAR_MAX_BYTES) {
        sendError('The avatar is too large (max 2 MB)', 400);
    }

    // Check that the bytes really are an image of the type the client
    // claimed - the MIME type in the data URL is not evidence.
    $size = @getimagesizefromstring($binary);
    if ($size === false) {
        sendError('The uploaded file is not a readable image', 400);
    }

    $detected = strtolower((string) ($size['mime'] ?? ''));
    if (!isset($allowedTypes[$detected])) {
        sendError('The avatar must be a PNG, JPEG or WEBP image', 400);
    }

    $extension = $allowedTypes[$detected];

    // ---- Write the file ------------------------------------------------
    $uploadDir = __DIR__ . '/../uploads/avatars';
    if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        sendError('The avatar folder could not be created', 500);
    }

    $filename = 'user_' . $userId . '_' . time() . '.' . $extension;
    $absolutePath = $uploadDir . '/' . $filename;

    if (@file_put_contents($absolutePath, $binary) === false) {
        sendError('The avatar could not be saved', 500);
    }

    // ---- Point the account at the new file ------------------------------
    // The database keeps the path relative to the API root, so the row
    // stays valid when the app is reached through another hostname.
    $publicPath = '/uploads/avatars/' . $filename;

    $previous = $db->fetchOne(
        "SELECT avatar, avatar_url FROM users WHERE id = ?",
        [$userId]
    );

    $db->update(
        'users',
        ['avatar_url' => $publicPath, 'avatar' => $publicPath],
        'id = :uid',
        ['uid' => $userId]
    );

    recordAuditLog($db, $userId, 'AVATAR_UPDATED', 'user', (string) $userId);

    // Drop the file the account used before, so the folder does not fill
    // up with images nobody can reach any more.
    if ($previous) {
        $oldPath = (string) ($previous['avatar_url'] ?: $previous['avatar']);
        if (strpos($oldPath, '/uploads/avatars/') !== false) {
            $oldName = basename($oldPath);
            $oldFile = $uploadDir . '/' . $oldName;
            if ($oldName !== $filename && is_file($oldFile)) {
                @unlink($oldFile);
            }
        }
    }

    sendResponse([
        'avatar'    => $publicPath,
        'avatarUrl' => $publicPath,
        // The updated account, so the header avatar can be replaced
        // without reloading the page.
        'user'      => buildUserPayload($db->fetchOne(
            "SELECT id, email, first_name, last_name, name, role, avatar, avatar_url,
                    experience, languages, security_focus, onboarding_complete, provider
             FROM users WHERE id = ?",
            [$userId]
        )),
    ], 'Avatar updated');
} catch (Exception $e) {
    sendError('An error occurred while saving the avatar', 500);
}
