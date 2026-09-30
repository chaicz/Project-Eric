<?php
/**
 * Authentication API - OAuth Login
 * 
 * POST /api/auth/oauth
 * Body: { "provider": "github|google", "token": "...", "userData": {...} }
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$provider = sanitizeInput($body['provider'] ?? '');
$oauthId = sanitizeInput($body['oauthId'] ?? '');
$email = sanitizeInput($body['email'] ?? '');
$firstName = sanitizeInput($body['firstName'] ?? '');
$lastName = sanitizeInput($body['lastName'] ?? '');

if (empty($provider) || empty($oauthId) || empty($email)) {
    sendError('Provider, OAuth ID, and email are required', 400);
}

$validProviders = ['github', 'google', 'twitter'];
if (!in_array($provider, $validProviders)) {
    sendError('Invalid OAuth provider', 400);
}

try {
    $db = Database::getInstance();
    
    // Check if user exists with this OAuth ID
    $user = $db->fetchOne(
        "SELECT id, email, first_name, last_name, role, is_active 
         FROM users WHERE oauth_provider = ? AND oauth_id = ?",
        [$provider, $oauthId]
    );

    // If not found, try to find by email
    if (!$user) {
        $user = $db->fetchOne(
            "SELECT id, email, first_name, last_name, role, is_active, oauth_provider 
             FROM users WHERE email = ?",
            [$email]
        );

        if ($user) {
            // Link OAuth to existing account
            if (empty($user['oauth_provider'])) {
                $db->update('users', 
                    ['oauth_provider' => $provider, 'oauth_id' => $oauthId],
                    'id = :id', 
                    ['id' => $user['id']]
                );
            }
        }
    }

    if ($user) {
        if (!$user['is_active']) {
            sendError('Account is disabled. Please contact support.', 401);
        }

        // Update last login
        $db->update('users', ['last_login' => date('Y-m-d H:i:s')], 'id = :id', ['id' => $user['id']]);
        
        $jwt = new JWTAuth();
        $token = $jwt->generateToken($user['id'], $user['email'], $user['role']);

        sendResponse([
            'token' => $token,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'firstName' => $user['first_name'],
                'lastName' => $user['last_name'],
                'role' => $user['role']
            ],
            'isNewUser' => false
        ], 'OAuth login successful');
    } else {
        // Create new user
        $passwordHash = password_hash(generateToken(32), PASSWORD_DEFAULT); // Random password for OAuth users
        
        $userId = $db->insert('users', [
            'email' => $email,
            'password_hash' => $passwordHash,
            'first_name' => $firstName ?: substr($email, 0, strpos($email, '@')),
            'last_name' => $lastName ?: '',
            'oauth_provider' => $provider,
            'oauth_id' => $oauthId,
            'email_verified' => true,
            'role' => 'user'
        ]);

        // Create default team
        $teamId = $db->insert('teams', [
            'name' => "{$firstName}'s Team",
            'description' => 'Personal workspace',
            'owner_id' => $userId
        ]);

        $db->insert('team_members', [
            'team_id' => $teamId,
            'user_id' => $userId,
            'role' => 'owner'
        ]);

        $jwt = new JWTAuth();
        $token = $jwt->generateToken($userId, $email, 'user');

        sendResponse([
            'token' => $token,
            'user' => [
                'id' => $userId,
                'email' => $email,
                'firstName' => $firstName ?: substr($email, 0, strpos($email, '@')),
                'lastName' => $lastName ?: '',
                'role' => 'user'
            ],
            'isNewUser' => true
        ], 'OAuth registration successful', 201);
    }

} catch (Exception $e) {
    sendError('An error occurred during OAuth authentication', 500);
}
