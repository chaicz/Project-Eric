<?php
/**
 * Vulnerabilities API - List vulnerabilities for the signed-in user's projects.
 *
 * GET /api/vulnerabilities
 * Header: Authorization: Bearer <token>
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

    $vulnerabilities = $db->fetchAll(
        "SELECT v.id, v.project_id, v.cwe_id, v.owasp_id, v.title, v.severity,
                v.category, v.description, v.location, v.status, v.remediation,
                v.cvss, v.discovered_at, p.name AS project_name
         FROM vulnerabilities v
         LEFT JOIN projects p ON p.id = v.project_id
         WHERE p.user_id = ?
         ORDER BY v.discovered_at DESC",
        [(int) $payload['sub']]
    );

    $rows = array_map(static function ($v) {
        return [
            'id'          => 'VULN-' . str_pad((string) $v['id'], 3, '0', STR_PAD_LEFT),
            'projectId'   => $v['project_id'] !== null ? (string) $v['project_id'] : null,
            'projectName' => $v['project_name'],
            'cweId'       => $v['cwe_id'],
            'owaspId'     => $v['owasp_id'],
            'title'       => $v['title'],
            'severity'    => $v['severity'],
            'category'    => $v['category'],
            'description' => $v['description'],
            'location'    => $v['location'],
            'status'      => $v['status'],
            'remediation' => $v['remediation'],
            'cvss'        => (float) $v['cvss'],
            'discoveredAt'=> toUtcIso($v['discovered_at']),
        ];
    }, $vulnerabilities);

    sendResponse([
        'vulnerabilities' => $rows,
        'total' => count($rows),
    ], 'Vulnerabilities retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching vulnerabilities', 500);
}
