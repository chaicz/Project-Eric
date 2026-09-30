<?php
/**
 * Authentication API - Login Endpoint
 * 
 * POST /api/auth/login
 * Body: { "email": "user@example.com", "password": "password123" }
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$email = sanitizeInput($body['email'] ?? '');
$password = $body['password'] ?? '';

if (empty($email) || empty($password)) {
    sendError('Email and password are required', 400);
}

if (!validateEmail($email)) {
    sendError('Invalid email format', 400);
}

try {
    $db = Database::getInstance();
    
    // Find user by email
    $user = $db->fetchOne(
        "SELECT id, email, password_hash, first_name, last_name, role, is_active 
         FROM users WHERE email = ?",
        [$email]
    );

    if (!$user) {
        sendError('Invalid email or password', 401);
    }

    if (!$user['is_active']) {
        sendError('Account is disabled. Please contact support.', 401);
    }

    // Verify password
    if (!password_verify($password, $user['password_hash'])) {
        sendError('Invalid email or password', 401);
    }

    // Update last login
    $db->update('users', ['last_login' => date('Y-m-d H:i:s')], 'id = :id', ['id' => $user['id']]);

    // Generate JWT token
    $jwt = new JWTAuth();
    $token = $jwt->generateToken($user['id'], $user['email'], $user['role']);

    // Log the login
    $db->insert('audit_logs', [
        'user_id' => $user['id'],
        'action' => 'login',
        'resource_type' => 'auth',
        'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
    ]);

    sendResponse([
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'firstName' => $user['first_name'],
            'lastName' => $user['last_name'],
            'role' => $user['role']
        ]
    ], 'Login successful');

} catch (Exception $e) {
    sendError('An error occurred during login', 500);
}
