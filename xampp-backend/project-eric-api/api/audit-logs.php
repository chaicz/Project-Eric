<?php
/**
 * Audit logs API - The signed-in account's own activity trail.
 *
 * GET /api/audit-logs
 * Header: Authorization: Bearer <token>
 *
 * Every row is written with the account that caused it, so a new account
 * sees its own registration and its own scans - and nothing that belongs
 * to somebody else.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

    $rows = $db->fetchAll(
        "SELECT id, action, resource_type, resource_id, details, details_text, ip_address, created_at
         FROM audit_logs
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 200",
        [$userId]
    );

    $logs = array_map(static function ($l) {
        // New rows store structured JSON in `details`; the seeded demo
        // rows store plain text in `details_text`. Prefer the JSON and
        // fall back to the text so neither shape renders as blank.
        $details = $l['details'] ? json_decode($l['details'], true) : null;
        if ($details === null && isset($l['details_text']) && $l['details_text'] !== null && $l['details_text'] !== '') {
            $details = $l['details_text'];
        }
        return [
            'id'           => (int) $l['id'],
            'action'       => $l['action'],
            'resourceType' => $l['resource_type'],
            'resourceId'   => $l['resource_id'],
            'details'      => $details,
            'ipAddress'    => $l['ip_address'],
            'createdAt'    => toUtcIso($l['created_at']),
        ];
    }, $rows);

    sendResponse(['logs' => $logs], 'Audit logs retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching the audit logs', 500);
}
