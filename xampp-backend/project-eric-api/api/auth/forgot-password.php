<?php
/**
 * Authentication API - Forgot Password
 * 
 * POST /api/auth/forgot-password
 * Body: { "email": "user@example.com" }
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$email = sanitizeInput($body['email'] ?? '');

if (empty($email)) {
    sendError('Email is required', 400);
}

if (!validateEmail($email)) {
    sendError('Invalid email format', 400);
}

try {
    $db = Database::getInstance();
    
    $user = $db->fetchOne("SELECT id FROM users WHERE email = ?", [$email]);

    // Always return success to prevent email enumeration
    if (!$user) {
        sendResponse(['sent' => true], 'If an account exists, a reset link has been sent');
    }

    // Generate reset token
    $resetToken = generateToken(32);
    $expiresAt = date('Y-m-d H:i:s', strtotime('+1 hour'));

    $db->update('users', 
        ['reset_token' => $resetToken, 'reset_token_expires' => $expiresAt],
        'id = :id', 
        ['id' => $user['id']]
    );

    // Log the request
    $db->insert('audit_logs', [
        'user_id' => $user['id'],
        'action' => 'forgot_password_request',
        'resource_type' => 'auth',
        'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ]);

    // In production, send email here
    // For now, return the token (remove this in production!)
    sendResponse([
        'sent' => true,
        'message' => 'If an account exists, a reset link has been sent',
        'dev_token' => $resetToken // REMOVE IN PRODUCTION
    ], 'Reset link sent');

} catch (Exception $e) {
    sendError('An error occurred', 500);
}
