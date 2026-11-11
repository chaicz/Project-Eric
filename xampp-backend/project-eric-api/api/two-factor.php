<?php
/**
 * Two-Factor Authentication API - the account's own second factor.
 *
 * GET    /api/two-factor
 * POST   /api/two-factor/setup    -> returns the secret and the URI to scan
 * POST   /api/two-factor/enable   { code }
 * POST   /api/two-factor/disable  { password }
 *
 * Header: Authorization: Bearer <token>
 *
 * Turning the second factor on is a two-step handshake: `setup` hands
 * out a secret that is *not* yet active, and `enable` activates it once
 * the account has proved it can produce a code from that secret. If the
 * user never completes the second step, the account stays unprotected.
 *
 * The secret is stored encrypted with the application's key, and the
 * recovery codes are stored hashed, the same way a password is. A
 * leaked database therefore cannot be used to sign in.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';
require_once __DIR__ . '/../includes/TOTP.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if (!in_array($method, ['GET', 'POST'], true)) {
    sendError('Method not allowed', 405);
}

/**
 * Encrypt a value with the application's key.
 *
 * The secret has to be recoverable — the server needs it to check the
 * codes the user sends — so it cannot be hashed the way a password is.
 * AES-256-GCM keeps it confidential at rest, and the authentication
 * tag means a tampered ciphertext fails to decrypt rather than
 * silently producing a wrong secret.
 */
function encryptSecret(string $plain): string {
    $key = hash('sha256', JWT_SECRET, true);
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);

    if ($cipher === false) {
        return '';
    }

    return base64_encode($iv . $tag . $cipher);
}

/**
 * Decrypt a value produced by `encryptSecret`.
 */
function decryptSecret(string $encoded): string {
    $raw = base64_decode($encoded, true);
    if ($raw === false || strlen($raw) < 29) {
        return '';
    }

    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $cipher = substr($raw, 28);

    $plain = openssl_decrypt($cipher, 'aes-256-gcm', hash('sha256', JWT_SECRET, true), OPENSSL_RAW_DATA, $iv, $tag);

    return $plain === false ? '' : $plain;
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();
    $body = getRequestBody();

    $row = $db->fetchOne(
        'SELECT two_factor_secret, two_factor_enabled, two_factor_recovery_codes, two_factor_enabled_at
         FROM users WHERE id = ?',
        [$userId]
    );

    if ($method === 'GET') {
        sendResponse([
            'enabled'       => (bool) ($row['two_factor_enabled'] ?? false),
            'enabledAt'     => toUtcIso($row['two_factor_enabled_at'] ?? null),
            'recoveryCodes' => $row && $row['two_factor_recovery_codes']
                ? count(json_decode((string) $row['two_factor_recovery_codes'], true) ?: [])
                : 0,
        ], 'Two-factor status retrieved successfully');
    }

    // ---- POST: the three actions ---------------------------------------
    $action = (string) ($body['action'] ?? '');

    if ($action === 'setup') {
        // A secret that is already active is not replaced: doing so
        // would lock the user out of the account they are still using.
        if ($row && $row['two_factor_enabled']) {
            sendError('Two-factor authentication is already enabled on this account', 409);
        }

        $secret = TOTP::generateSecret();
        $account = (string) ($payload['email'] ?? 'account');
        $uri = TOTP::provisioningUri($secret, $account);

        // The secret is stored right away, but `two_factor_enabled`
        // stays false until the account proves it can generate a code.
        $db->update(
            'users',
            ['two_factor_secret' => encryptSecret($secret)],
            'id = :id',
            ['id' => $userId]
        );

        sendResponse([
            'secret' => $secret,
            'uri'    => $uri,
            'digits' => TOTP::DIGITS,
            'period' => TOTP::PERIOD,
        ], 'A setup secret was created');
    }

    if ($action === 'enable') {
        if (!$row || !$row['two_factor_secret']) {
            sendError('Start the setup first', 400);
        }
        if ($row['two_factor_enabled']) {
            sendError('Two-factor authentication is already enabled on this account', 409);
        }

        $secret = decryptSecret((string) $row['two_factor_secret']);
        $code = (string) ($body['code'] ?? '');

        if (!TOTP::verify($secret, $code)) {
            recordAuditLog($db, $userId, 'TWO_FACTOR_ENABLE_FAILED', 'security', (string) $userId, []);
            sendError('That code is not correct. Check your authenticator app and try again.', 400);
        }

        // The recovery codes are the way back in if the phone is lost.
        $recovery = TOTP::generateRecoveryCodes();

        $db->update(
            'users',
            [
                'two_factor_enabled'         => 1,
                'two_factor_enabled_at'      => date('Y-m-d H:i:s'),
                'two_factor_recovery_codes'  => json_encode($recovery['hashes']),
            ],
            'id = :id',
            ['id' => $userId]
        );

        recordAuditLog($db, $userId, 'TWO_FACTOR_ENABLED', 'security', (string) $userId, []);

        sendResponse([
            'enabled'       => true,
            'recoveryCodes' => $recovery['plain'],
        ], 'Two-factor authentication is now enabled', 201);
    }

    if ($action === 'disable') {
        if (!$row || !$row['two_factor_enabled']) {
            sendError('Two-factor authentication is not enabled on this account', 400);
        }

        // Turning it off needs the password, so a borrowed session
        // cannot quietly remove the second factor.
        $user = $db->fetchOne('SELECT password_hash FROM users WHERE id = ?', [$userId]);
        $password = (string) ($body['password'] ?? '');

        if (!$user || !password_verify($password, $user['password_hash'])) {
            sendError('Your password is not correct', 403);
        }

        $db->update(
            'users',
            [
                'two_factor_enabled'        => 0,
                'two_factor_secret'         => null,
                'two_factor_recovery_codes' => null,
                'two_factor_enabled_at'     => null,
            ],
            'id = :id',
            ['id' => $userId]
        );

        recordAuditLog($db, $userId, 'TWO_FACTOR_DISABLED', 'security', (string) $userId, []);

        sendResponse(['enabled' => false], 'Two-factor authentication is now disabled');
    }

    sendError('Unknown action', 400);

} catch (Exception $e) {
    sendError('An error occurred while handling two-factor authentication', 500);
}
