<?php
/**
 * Integrations API - The signed-in account's own connections.
 *
 * GET    /api/integrations
 * POST   /api/integrations   { provider, settings? }
 * DELETE /api/integrations   { provider }
 *
 * Header: Authorization: Bearer <token>
 *
 * An integration row belongs to one account, so a new account starts with
 * nothing connected instead of inheriting the demo account's GitHub and
 * Slack links.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if (!in_array($method, ['GET', 'POST', 'DELETE'], true)) {
    sendError('Method not allowed', 405);
}

/**
 * The providers this build knows how to talk to.
 */
function supportedProviders() {
    return ['github', 'gitlab', 'slack', 'jira', 'pagerduty', 'datadog'];
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
            "SELECT id, provider, settings, is_active, created_at, updated_at
             FROM integrations
             WHERE user_id = ?",
            [$userId]
        );

        $integrations = array_map(static function ($i) {
            return [
                'id'        => (int) $i['id'],
                'provider'  => $i['provider'],
                'settings'  => $i['settings'] ? json_decode($i['settings'], true) : [],
                'connected' => (bool) $i['is_active'],
                'status'    => $i['is_active'] ? 'active' : 'disconnected',
                'lastSync'  => toUtcIso($i['updated_at']),
                'createdAt' => toUtcIso($i['created_at']),
            ];
        }, $rows);

        sendResponse(['integrations' => $integrations], 'Integrations retrieved successfully');
    }

    if ($method === 'POST') {
        $body = getRequestBody();
        $provider = strtolower(trim((string) ($body['provider'] ?? '')));

        if (!in_array($provider, supportedProviders(), true)) {
            sendError('Unknown provider', 400);
        }

        $settings = $body['settings'] ?? [];
        if (!is_array($settings)) {
            $settings = [];
        }

        $existing = $db->fetchOne(
            "SELECT id FROM integrations WHERE user_id = ? AND provider = ?",
            [$userId, $provider]
        );

        if ($existing) {
            $db->update(
                'integrations',
                [
                    'settings'  => json_encode($settings),
                    'is_active' => 1,
                ],
                'id = :id AND user_id = :uid',
                ['id' => $existing['id'], 'uid' => $userId]
            );
            $integrationId = (int) $existing['id'];
        } else {
            $integrationId = $db->insert('integrations', [
                'user_id'   => $userId,
                'provider'  => $provider,
                'settings'  => json_encode($settings),
                'is_active' => 1,
            ]);
        }

        recordAuditLog($db, $userId, 'INTEGRATION_CONNECTED', 'integration', $provider);
        createNotification($db, $userId, 'success', ucfirst($provider) . ' connected', "The {$provider} integration is now active.");

        sendResponse([
            'id'        => $integrationId,
            'provider'  => $provider,
            'connected' => true,
            'status'    => 'active',
        ], 'Integration connected', 201);
    }

    if ($method === 'DELETE') {
        $body = getRequestBody();
        $provider = strtolower(trim((string) ($body['provider'] ?? '')));

        if ($provider === '') {
            sendError('A provider is required', 400);
        }

        $db->delete(
            'integrations',
            'user_id = :uid AND provider = :provider',
            ['uid' => $userId, 'provider' => $provider]
        );

        recordAuditLog($db, $userId, 'INTEGRATION_DISCONNECTED', 'integration', $provider);

        sendResponse(['deleted' => true], 'Integration disconnected');
    }

    sendError('Unknown action', 400);

} catch (Exception $e) {
    sendError('An error occurred while handling integrations', 500);
}
