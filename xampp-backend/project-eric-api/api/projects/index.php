<?php
/**
 * Projects API - List the signed-in user's projects.
 *
 * GET /api/projects
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

    $projects = $db->fetchAll(
        "SELECT id, name, description, language, framework, repository_url,
                threat_level, vulnerability_count, critical_count, files, is_public,
                created_at, last_modified
         FROM projects
         WHERE user_id = ?
         ORDER BY last_modified DESC",
        [(int) $payload['sub']]
    );

    $rows = array_map(static function ($p) {
        return [
            'id'                 => (string) $p['id'],
            'name'               => $p['name'],
            'description'        => $p['description'],
            'language'           => $p['language'],
            'framework'          => $p['framework'],
            'repositoryUrl'      => $p['repository_url'],
            'threatLevel'        => $p['threat_level'],
            'vulnerabilityCount' => (int) $p['vulnerability_count'],
            'criticalCount'      => (int) $p['critical_count'],
            'files'              => (int) $p['files'],
            'isPublic'           => (bool) $p['is_public'],
            'createdAt'          => toUtcIso($p['created_at']),
            'lastModified'       => toUtcIso($p['last_modified']),
        ];
    }, $projects);

    sendResponse([
        'projects' => $rows,
        'total' => count($rows),
    ], 'Projects retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching projects', 500);
}
