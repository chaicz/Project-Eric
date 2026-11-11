<?php
/**
 * Authentication API - Change Password
 *
 * POST /api/auth/change-password
 * Body: { "currentPassword": "...", "newPassword": "..." }
 * Header: Authorization: Bearer <token>
 *
 * The account proves it owns the password before a new one is set, so a
 * stolen token alone cannot lock the owner out. The new password is
 * hashed with the same algorithm the register endpoint uses, and the
 * change is written to the audit log.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$currentPassword = (string) ($body['currentPassword'] ?? '');
$newPassword     = (string) ($body['newPassword'] ?? '');

if ($currentPassword === '' || $newPassword === '') {
    sendError('The current and the new password are both required', 400);
}

if (strlen($newPassword) < 8) {
    sendError('The new password must be at least 8 characters', 400);
}

if (mb_strlen($newPassword) > 255) {
    sendError('The new password is too long', 400);
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();

    $user = $db->fetchOne(
        "SELECT id, email, password_hash FROM users WHERE id = ?",
        [$userId]
    );

    if (!$user) {
        sendError('User not found', 404);
    }

    // The current password has to match, otherwise anyone holding a
    // stolen token could take the account over.
    if (!password_verify($currentPassword, $user['password_hash'])) {
        recordAuditLog($db, $userId, 'PASSWORD_CHANGE_FAILED', 'user', (string) $userId);
        sendError('The current password is not correct', 403);
    }

    // Changing to the same password is allowed but pointless - say so
    // rather than pretending something happened.
    if (password_verify($newPassword, $user['password_hash'])) {
        sendError('The new password must be different from the current one', 400);
    }

    $db->update(
        'users',
        ['password_hash' => password_hash($newPassword, PASSWORD_DEFAULT)],
        'id = :uid',
        ['uid' => $userId]
    );

    recordAuditLog($db, $userId, 'PASSWORD_CHANGED', 'user', (string) $userId);
    createNotification(
        $db,
        $userId,
        'success',
        'Password changed',
        'Your account password was changed.'
    );

    sendResponse(['changed' => true], 'Password changed successfully');

} catch (Exception $e) {
    sendError('An error occurred while changing the password', 500);
}
