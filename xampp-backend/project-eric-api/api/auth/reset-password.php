<?php
/**
 * Authentication API - Reset Password
 * 
 * POST /api/auth/reset-password
 * Body: { "token": "...", "newPassword": "..." }
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$token = sanitizeInput($body['token'] ?? '');
$newPassword = $body['newPassword'] ?? '';

if (empty($token) || empty($newPassword)) {
    sendError('Token and new password are required', 400);
}

if (strlen($newPassword) < 8) {
    sendError('Password must be at least 8 characters', 400);
}

try {
    $db = Database::getInstance();
    
    $user = $db->fetchOne(
        "SELECT id, email FROM users 
         WHERE reset_token = ? AND reset_token_expires > NOW()",
        [$token]
    );

    if (!$user) {
        sendError('Invalid or expired reset token', 400);
    }

    // Hash new password
    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);

    // Update password and clear reset token
    $db->update('users', 
        ['password_hash' => $passwordHash, 'reset_token' => null, 'reset_token_expires' => null],
        'id = :id', 
        ['id' => $user['id']]
    );

    // Log the reset
    $db->insert('audit_logs', [
        'user_id' => $user['id'],
        'action' => 'password_reset',
        'resource_type' => 'auth',
        'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ]);

    sendResponse(['reset' => true], 'Password has been reset successfully');

} catch (Exception $e) {
    sendError('An error occurred', 500);
}
