<?php
/**
 * Authentication API - Validate Token
 * 
 * GET /api/auth/validate
 * Header: Authorization: Bearer <token>
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $db = Database::getInstance();
    
    $user = $db->fetchOne(
        "SELECT id, email, first_name, last_name, role, avatar_url, is_active 
         FROM users WHERE id = ?",
        [$payload['sub']]
    );

    if (!$user || !$user['is_active']) {
        sendError('User not found or inactive', 401);
    }

    sendResponse([
        'valid' => true,
        'user' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'firstName' => $user['first_name'],
            'lastName' => $user['last_name'],
            'role' => $user['role'],
            'avatarUrl' => $user['avatar_url']
        ]
    ], 'Token is valid');

} catch (Exception $e) {
    sendError('An error occurred during validation', 500);
}
