<?php
/**
 * API keys API - The signed-in account's own keys.
 *
 * GET    /api/api-keys
 * POST   /api/api-keys   { name, permissions? }
 * DELETE /api/api-keys   { id }
 *
 * Header: Authorization: Bearer <token>
 *
 * A key belongs to exactly one account. The key material is returned once,
 * when the key is created; afterwards only its prefix and last-used stamp
 * are exposed, the way a real key service behaves.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if (!in_array($method, ['GET', 'POST', 'DELETE'], true)) {
    sendError('Method not allowed', 405);
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();

    if ($method === 'GET') {
        $rows = $db->fetchAll(
            "SELECT id, name, api_key, last_used, expires_at, is_active, permissions, created_at
             FROM api_keys
             WHERE user_id = ?
             ORDER BY created_at DESC, id DESC",
            [$userId]
        );

        $keys = array_map(static function ($k) {
            $material = (string) $k['api_key'];
            // Show the prefix and the last four characters only.
            $masked = strlen($material) > 10
                ? substr($material, 0, 6) . str_repeat('*', max(0, strlen($material) - 10)) . substr($material, -4)
                : $material;

            return [
                'id'          => (int) $k['id'],
                'name'        => $k['name'],
                'key'         => $masked,
                'prefix'      => substr($material, 0, 6),
                'createdAt'   => toUtcIso($k['created_at']),
                'lastUsed'    => toUtcIso($k['last_used']),
                'expiresAt'   => toUtcIso($k['expires_at']),
                'isActive'    => (bool) $k['is_active'],
                'status'      => $k['is_active'] ? 'active' : 'revoked',
                'permissions' => $k['permissions'] ? json_decode($k['permissions'], true) : [],
            ];
        }, $rows);

        sendResponse(['apiKeys' => $keys], 'API keys retrieved successfully');
    }

    if ($method === 'POST') {
        $body = getRequestBody();
        $name = trim((string) ($body['name'] ?? ''));

        if ($name === '') {
            sendError('A name is required', 400);
        }
        if (mb_strlen($name) > 255) {
            sendError('The name is too long', 400);
        }

        $permissions = $body['permissions'] ?? ['scan', 'read'];
        if (!is_array($permissions)) {
            $permissions = ['scan', 'read'];
        }

        $material = 'ai_sk_' . bin2hex(random_bytes(18));

        $keyId = $db->insert('api_keys', [
            'user_id'     => $userId,
            'name'        => $name,
            'key_hash'    => hash('sha256', $material),
            'api_key'     => $material,
            'permissions' => json_encode(array_values($permissions)),
            'is_active'   => 1,
        ]);

        recordAuditLog($db, $userId, 'API_KEY_CREATED', 'api_key', (string) $keyId, ['name' => $name]);
        createNotification($db, $userId, 'success', 'API key created', "The key \"{$name}\" is ready to use.");

        sendResponse([
            'id'        => (int) $keyId,
            'name'      => $name,
            'key'       => $material,
            'prefix'    => substr($material, 0, 6),
            'createdAt' => toUtcIso(date('Y-m-d H:i:s')),
            'status'    => 'active',
        ], 'API key created', 201);
    }

    if ($method === 'DELETE') {
        $body = getRequestBody();
        $id = (int) ($body['id'] ?? 0);

        if ($id <= 0) {
            sendError('A key id is required', 400);
        }

        $key = $db->fetchOne(
            "SELECT id, name FROM api_keys WHERE id = ? AND user_id = ?",
            [$id, $userId]
        );
        if (!$key) {
            sendError('API key not found', 404);
        }

        $db->delete('api_keys', 'id = :id AND user_id = :uid', ['id' => $id, 'uid' => $userId]);
        recordAuditLog($db, $userId, 'API_KEY_DELETED', 'api_key', (string) $id, ['name' => $key['name']]);

        sendResponse(['deleted' => true], 'API key deleted');
    }

    sendError('Unknown action', 400);

} catch (Exception $e) {
    sendError('An error occurred while handling API keys', 500);
}
