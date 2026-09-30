<?php
/**
 * JWT Authentication Handler
 */

require_once __DIR__ . '/../config/config.php';

class JWTAuth {
    private $secret;
    private $expiry;

    public function __construct() {
        $this->secret = JWT_SECRET;
        $this->expiry = JWT_EXPIRY;
    }

    /**
     * Generate JWT Token
     */
    public function generateToken($userId, $email, $role = 'user') {
        $header = $this->base64UrlEncode(json_encode([
            'typ' => 'JWT',
            'alg' => 'HS256'
        ]));

        $payload = $this->base64UrlEncode(json_encode([
            'iss' => 'project-eric-api',
            'sub' => $userId,
            'email' => $email,
            'role' => $role,
            'iat' => time(),
            'exp' => time() + $this->expiry
        ]));

        $signature = $this->base64UrlEncode(
            hash_hmac('sha256', "{$header}.{$payload}", $this->secret, true)
        );

        return "{$header}.{$payload}.{$signature}";
    }

    /**
     * Verify and Decode JWT Token
     */
    public function verifyToken($token) {
        $parts = explode('.', $token);
        
        if (count($parts) !== 3) {
            return false;
        }

        [$header, $payload, $signature] = $parts;

        // Verify signature
        $expectedSignature = $this->base64UrlEncode(
            hash_hmac('sha256', "{$header}.{$payload}", $this->secret, true)
        );

        if ($signature !== $expectedSignature) {
            return false;
        }

        // Decode payload
        $payload = json_decode($this->base64UrlDecode($payload), true);

        // Check expiration
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return false;
        }

        return $payload;
    }

    /**
     * Extract token from Authorization header
     */
    public function extractTokenFromHeader() {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            return $matches[1];
        }

        return null;
    }

    /**
     * Authenticate request
     */
    public function authenticate() {
        $token = $this->extractTokenFromHeader();

        if (!$token) {
            return null;
        }

        return $this->verifyToken($token);
    }

    private function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode($data) {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
    }
}
