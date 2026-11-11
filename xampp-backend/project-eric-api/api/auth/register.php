<?php
/**
 * Authentication API - Register/Signup Endpoint
 * 
 * POST /api/auth/register
 * Body: { "email": "...", "password": "...", "firstName": "...", "lastName": "..." }
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$email = sanitizeInput($body['email'] ?? '');
$password = $body['password'] ?? '';
$firstName = sanitizeInput($body['firstName'] ?? '');
$lastName = sanitizeInput($body['lastName'] ?? '');

// Validation
if (empty($email) || empty($password) || empty($firstName) || empty($lastName)) {
    sendError('All fields are required', 400);
}

if (!validateEmail($email)) {
    sendError('Invalid email format', 400);
}

if (strlen($password) < 8) {
    sendError('Password must be at least 8 characters', 400);
}

// Check password strength
if (!preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || !preg_match('/[0-9]/', $password)) {
    sendError('Password must contain uppercase, lowercase, and numbers', 400);
}

try {
    $db = Database::getInstance();
    
    // Check if email already exists
    $existingUser = $db->fetchOne("SELECT id FROM users WHERE email = ?", [$email]);
    
    if ($existingUser) {
        sendError('An account with this email already exists', 409);
    }

    // Hash password
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    // Generate verification token
    $verificationToken = generateToken(32);

    // Insert new user
    $userId = $db->insert('users', [
        'email' => $email,
        'password_hash' => $passwordHash,
        'first_name' => $firstName,
        'last_name' => $lastName,
        'verification_token' => $verificationToken,
        'role' => 'user'
    ]);

    // Create default team for user
    $teamId = $db->insert('teams', [
        'name' => "{$firstName}'s Team",
        'description' => 'Personal workspace',
        'owner_id' => $userId
    ]);

    // Add user as team owner
    $db->insert('team_members', [
        'team_id' => $teamId,
        'user_id' => $userId,
        'role' => 'owner'
    ]);

    // Generate JWT token
    $jwt = new JWTAuth();
    $token = $jwt->generateToken($userId, $email, 'user');

    // Log registration
    $db->insert('audit_logs', [
        'user_id' => $userId,
        'action' => 'register',
        'resource_type' => 'auth',
        'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
    ]);

    sendResponse([
        'token' => $token,
        'user' => buildUserPayload($db->fetchOne(
            "SELECT id, email, first_name, last_name, name, role, avatar, avatar_url,
                    experience, languages, security_focus, onboarding_complete, provider
             FROM users WHERE id = ?",
            [$userId]
        ) ?: [
            'id' => $userId,
            'email' => $email,
            'first_name' => $firstName,
            'last_name' => $lastName,
        ]),
        'verificationRequired' => true
    ], 'Registration successful');

} catch (Exception $e) {
    sendError('An error occurred during registration', 500);
}
