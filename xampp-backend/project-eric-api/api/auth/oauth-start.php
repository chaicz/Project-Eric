<?php
/**
 * Authentication API - Start an OAuth sign-in
 *
 * GET /api/auth/oauth/{provider}/start
 * GET /api/auth/oauth/{provider}/start?preview=1
 *
 * Sends the browser to the provider's authorization page. The provider
 * calls the callback endpoint when the person approves the request.
 *
 * The `preview` flag runs the real provider handshake but stops before
 * anything is written to the database: no account is created, no
 * provider link is stored, no team is made and no audit row is left
 * behind. It exists so the Google sign-in can be tried out without
 * changing the data.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';
require_once __DIR__ . '/../../includes/OAuthProvider.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

$provider = sanitizeInput($_GET['provider'] ?? '');
$config = oauthProviderConfig($provider);

if ($config === null) {
    sendError(
        $provider === 'google' || $provider === 'github'
            ? ucfirst($provider) . ' login is not configured on this server.'
            : 'Unsupported OAuth provider.',
        503
    );
}

// The preview flag is carried through the provider round trip in the
// state cookie, not in the redirect URL, so the provider never sees it
// and it cannot be added to the callback by hand.
$preview = isset($_GET['preview']) && $_GET['preview'] !== '0' && $_GET['preview'] !== '';

header('Location: ' . oauthAuthorizationUrl($config, $provider, $preview), true, 302);
exit();
