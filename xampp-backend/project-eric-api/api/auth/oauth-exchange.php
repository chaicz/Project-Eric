<?php
/**
 * Authentication API - Exchange an OAuth handoff for a session
 *
 * POST /api/auth/oauth/exchange
 * Body: { "code": "..." }
 *
 * The callback endpoint leaves the JWT in a short-lived HttpOnly cookie
 * and sends the browser here with a one-time code. This endpoint reads
 * the cookie, checks that the code matches, and returns the normal
 * Project Eric sign-in response.
 *
 * A preview sign-in has no JWT and no database row. The callback leaves
 * the verified identity in a separate preview cookie instead, and this
 * endpoint hands that back as a browser-only session.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$code = sanitizeInput($body['code'] ?? '');
$cookie = $_COOKIE['project_eric_oauth_handoff'] ?? '';

setcookie('project_eric_oauth_handoff', '', [
    'expires' => time() - 3600,
    'path' => '/',
    'samesite' => 'Lax',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'httponly' => true,
]);

// ---- Preview session ----------------------------------------------------
//
// The preview sign-in never wrote an account, so there is no handoff
// code and no token. The verified identity is read from the preview
// cookie instead and handed to the browser as a local session.
if ($code === '' || $cookie === '') {
    $previewCookie = $_COOKIE['project_eric_oauth_preview'] ?? '';

    if ($previewCookie !== '') {
        setcookie('project_eric_oauth_preview', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'samesite' => 'Lax',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true,
        ]);

        $previewPayload = json_decode($previewCookie, true);
        if (is_array($previewPayload) && !empty($previewPayload['user'])) {
            if ((int) ($previewPayload['expiresAt'] ?? 0) < time()) {
                sendError('The preview session expired. Please try again.', 401);
            }

            sendResponse([
                'token' => null,
                'user' => $previewPayload['user'],
                'isNewUser' => false,
                'isPreview' => true,
                'provider' => $previewPayload['provider'] ?? 'google',
            ], 'Preview sign-in successful');
        }
    }

    sendError('The sign-in session expired. Please try again.', 401);
}

$payload = json_decode($cookie, true);
if (!is_array($payload) || empty($payload['token']) || empty($payload['user'])) {
    sendError('The sign-in session expired. Please try again.', 401);
}

if ((int) ($payload['expiresAt'] ?? 0) < time()) {
    sendError('The sign-in session expired. Please try again.', 401);
}

$expectedCode = hash('sha256', (string) ($payload['token'] ?? '') . '|' . (string) ($payload['user']['id'] ?? ''));
if (!hash_equals($expectedCode, $code)) {
    sendError('The sign-in session could not be verified. Please try again.', 401);
}

sendResponse([
    'token' => $payload['token'],
    'user' => $payload['user'],
    'isNewUser' => !empty($payload['isNewUser']),
], 'OAuth login successful');
