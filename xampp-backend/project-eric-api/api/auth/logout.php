<?php
/**
 * Authentication API - Logout
 * 
 * POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if ($payload) {
        $db = Database::getInstance();
        
        // Log the logout
        $db->insert('audit_logs', [
            'user_id' => $payload['sub'],
            'action' => 'logout',
            'resource_type' => 'auth',
            'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
        ]);
    }

    // In a stateless JWT setup, logout is handled client-side
    // For added security, you could maintain a token blacklist
    
    sendResponse(['loggedOut' => true], 'Logged out successfully');

} catch (Exception $e) {
    sendError('An error occurred', 500);
}
