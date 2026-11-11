<?php
/**
 * Threats API - Threat intelligence feed.
 *
 * GET /api/threats
 * Header: Authorization: Bearer <token>
 *
 * Threat intelligence is global (not user-scoped), but the endpoint still
 * requires a token so the dashboard never renders unauthenticated data.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

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

    $db = Database::getInstance();

    $threats = $db->fetchAll(
        "SELECT id, title, severity, source, description, indicators,
                affected_components, mitigation, timestamp
         FROM threats
         ORDER BY timestamp DESC"
    );

    $decode = static function ($value) {
        if (is_array($value)) return $value;
        if (!is_string($value) || $value === '') return [];
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    };

    $rows = array_map(static function ($t) use ($decode) {
        return [
            'id'                 => 'THREAT-' . str_pad((string) $t['id'], 3, '0', STR_PAD_LEFT),
            'title'              => $t['title'],
            'severity'           => $t['severity'],
            'source'             => $t['source'],
            'description'        => $t['description'],
            'indicators'         => $decode($t['indicators']),
            'affectedComponents' => $decode($t['affected_components']),
            'mitigation'         => $t['mitigation'],
            'timestamp'          => toUtcIso($t['timestamp']),
        ];
    }, $threats);

    sendResponse([
        'threats' => $rows,
        'total' => count($rows),
    ], 'Threats retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching threats', 500);
}
