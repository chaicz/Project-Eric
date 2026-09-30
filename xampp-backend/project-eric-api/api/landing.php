<?php
/**
 * Landing Page API - Get all public data for landing page
 * 
 * GET /api/landing
 * Returns features, team, stats, and other public info
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

try {
    $db = Database::getInstance();
    
    // Get features
    $features = $db->fetchAll(
        "SELECT id, title, description, icon, category 
         FROM features 
         WHERE is_active = 1 
         ORDER BY sort_order ASC"
    );

    // Get team members
    $team = $db->fetchAll(
        "SELECT id, name, role, bio, avatar_url, skills, github_url, linkedin_url 
         FROM team_info 
         WHERE is_featured = 1 
         ORDER BY sort_order ASC"
    );

    foreach ($team as &$member) {
        $member['skills'] = json_decode($member['skills'] ?? '[]', true);
    }

    // Get user count
    $stats = $db->fetchOne("SELECT COUNT(*) as count FROM users");
    $projectStats = $db->fetchOne("SELECT COUNT(*) as count FROM projects");
    $scanStats = $db->fetchOne("SELECT COUNT(*) as count FROM scan_results WHERE status = 'completed'");

    sendResponse([
        'features' => $features,
        'team' => $team,
        'stats' => [
            'users' => $stats['count'] ?? 0,
            'projects' => $projectStats['count'] ?? 0,
            'scans' => $scanStats['count'] ?? 0
        ],
        'version' => '1.0.0'
    ], 'Landing page data retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching landing page data', 500);
}
