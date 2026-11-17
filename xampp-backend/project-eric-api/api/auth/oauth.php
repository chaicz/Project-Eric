<?php
/**
 * Authentication API - OAuth 2.0 providers
 *
 * GET /api/auth/oauth/providers
 *
 * Reports which social sign-in providers are configured. The browser
 * uses this list to show or hide the provider buttons, so a deployment
 * without credentials does not offer a button that cannot work.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';
require_once __DIR__ . '/../../includes/OAuthProvider.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

sendResponse([
    'providers' => array_keys(oauthConfiguredProviders()),
], 'OAuth providers loaded');
