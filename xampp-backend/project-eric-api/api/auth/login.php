<?php
/**
 * Authentication API - Login Endpoint
 *
 * POST /api/auth/login
 * Body: { "email": "user@example.com", "password": "password123" }
 *
 * When the account has a second factor turned on, the password alone
 * is not enough. The response then carries a short-lived *challenge*
 * instead of a session token, and the client exchanges the challenge
 * plus the six digit code for the real token:
 *
 *   POST /api/auth/login { email, password, challenge, code }
 *
 * A challenge token is deliberately weaker than a session token: it
 * only opens the two-factor step, and it expires in five minutes.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';
require_once __DIR__ . '/../../includes/TOTP.php';

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

/**
 * Decrypt a value produced by the two-factor endpoint's `encryptSecret`.
 *
 * The two endpoints share the key, so the helper lives here rather
 * than in a class that both would have to load.
 */
function decryptTwoFactorSecret(string $encoded): string {
    $raw = base64_decode($encoded, true);
    if ($raw === false || strlen($raw) < 29) {
        return '';
    }

    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $cipher = substr($raw, 28);

    $plain = openssl_decrypt(
        $cipher,
        'aes-256-gcm',
        hash('sha256', JWT_SECRET, true),
        OPENSSL_RAW_DATA,
        $iv,
        $tag
    );

    return $plain === false ? '' : $plain;
}

/**
 * Issue a challenge token: enough to open the two-factor step and
 * nothing more.
 */
function generateChallengeToken(int $userId, string $email): string {
    $header = rtrim(strtr(base64_encode(json_encode([
        'typ' => 'JWT',
        'alg' => 'HS256',
    ])), '+/', '-_'), '=');

    $payload = rtrim(strtr(base64_encode(json_encode([
        'iss' => 'project-eric-api',
        'sub' => $userId,
        'email' => $email,
        'scope' => 'two-factor',
        'iat' => time(),
        'exp' => time() + 300,
    ])), '+/', '-_'), '=');

    $signature = rtrim(strtr(
        base64_encode(hash_hmac('sha256', "{$header}.{$payload}", JWT_SECRET, true)),
        '+/',
        '-_'
    ), '=');

    return "{$header}.{$payload}.{$signature}";
}

try {
    $db = Database::getInstance();

    // Find user by email
    $user = $db->fetchOne(
        "SELECT id, email, password_hash, first_name, last_name, name, role, avatar,
                avatar_url, experience, languages, security_focus, onboarding_complete,
                provider, is_active, two_factor_secret, two_factor_enabled,
                two_factor_recovery_codes
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

    $jwt = new JWTAuth();
    $userId = (int) $user['id'];
    $twoFactorEnabled = !empty($user['two_factor_enabled']) && !empty($user['two_factor_secret']);

    // ---- The second step, when the account has a second factor ---------
    if ($twoFactorEnabled) {
        $challenge = (string) ($body['challenge'] ?? '');
        $code = (string) ($body['code'] ?? '');

        if ($challenge === '') {
            // First step: hand back a challenge and ask for the code.
            sendResponse([
                'requiresTwoFactor' => true,
                'challenge'         => generateChallengeToken($userId, (string) $user['email']),
                'message'           => 'Enter the six digit code from your authenticator app.',
            ], 'A two-factor code is required', 200);
        }

        // The challenge has to belong to this account and still be valid.
        $challengePayload = $jwt->verifyToken($challenge);
        if (
            !$challengePayload
            || ($challengePayload['scope'] ?? '') !== 'two-factor'
            || (int) ($challengePayload['sub'] ?? 0) !== $userId
        ) {
            sendError('The sign-in attempt expired. Please try again.', 401);
        }

        $secret = decryptTwoFactorSecret((string) $user['two_factor_secret']);
        $accepted = TOTP::verify($secret, $code);

        // A recovery code is the way in when the phone is gone. It is
        // spent as soon as it works.
        $usedRecovery = false;
        if (!$accepted) {
            $recoveryCodes = json_decode((string) ($user['two_factor_recovery_codes'] ?? '[]'), true) ?: [];
            foreach ($recoveryCodes as $index => $hash) {
                if (password_verify($code, $hash)) {
                    $accepted = true;
                    $usedRecovery = true;
                    unset($recoveryCodes[$index]);
                    $db->update(
                        'users',
                        ['two_factor_recovery_codes' => json_encode(array_values($recoveryCodes))],
                        'id = :id',
                        ['id' => $userId]
                    );
                    break;
                }
            }
        }

        if (!$accepted) {
            recordAuditLog($db, $userId, 'TWO_FACTOR_FAILED', 'auth', 'two-factor', [
                'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            ]);
            sendError('That code is not correct.', 401);
        }

        if ($usedRecovery) {
            recordAuditLog($db, $userId, 'TWO_FACTOR_RECOVERY_USED', 'auth', 'two-factor', []);
        }
    }

    // Update last login
    $db->update('users', ['last_login' => date('Y-m-d H:i:s')], 'id = :id', ['id' => $userId]);

    // Generate JWT token
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
        'user' => buildUserPayload($user)
    ], 'Login successful');

} catch (Exception $e) {
    sendError('An error occurred during login', 500);
}
