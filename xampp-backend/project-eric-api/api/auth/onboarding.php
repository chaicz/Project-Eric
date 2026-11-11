<?php
/**
 * Onboarding API - Records that the signed-in account finished onboarding.
 *
 * POST /api/auth/onboarding
 * Header: Authorization: Bearer <token>
 * Body: { experience?, languages?, securityFocus? }
 *
 * The onboarding tour used to set a flag in the browser only. The next
 * `/auth/validate` call replaced the cached user object with the server's
 * copy, the flag came back false, and a page refresh threw the user back
 * into the tour they had already finished.
 *
 * The flag lives in `users.onboarding_complete` now, so the server and the
 * browser always agree about it, and the answers the tour collected are
 * stored next to it.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();

    $body = getRequestBody();

    // The tour only ever sends what the user actually answered. Anything
    // absent is left alone rather than blanked out.
    $update = ['onboarding_complete' => 1];

    if (array_key_exists('experience', $body) && $body['experience'] !== null) {
        $update['experience'] = substr((string) $body['experience'], 0, 50);
    }

    // The API speaks camelCase; the table uses snake_case. `securityFocus`
    // has no `securityFocus` column, so the UPDATE failed with a 500 and
    // the onboarding flag was never written.
    foreach (['languages' => 'languages', 'securityFocus' => 'security_focus'] as $bodyKey => $column) {
        if (!array_key_exists($bodyKey, $body) || $body[$bodyKey] === null) {
            continue;
        }
        $value = $body[$bodyKey];
        // Accept both a JSON array and a comma-separated string.
        if (is_string($value)) {
            $value = array_values(array_filter(array_map('trim', explode(',', $value))));
        }
        if (!is_array($value)) {
            continue;
        }
        $update[$column] = json_encode(array_values($value));
    }

    $db->update('users', $update, 'id = :uid', ['uid' => $userId]);

    $user = $db->fetchOne(
        "SELECT id, email, first_name, last_name, name, role, avatar, avatar_url,
                experience, languages, security_focus, onboarding_complete, provider
         FROM users WHERE id = ?",
        [$userId]
    );

    if (!$user) {
        sendError('User not found', 404);
    }

    sendResponse([
        'user' => buildUserPayload($user),
    ], 'Onboarding saved successfully');

} catch (Exception $e) {
    sendError('An error occurred while saving the onboarding', 500);
}
