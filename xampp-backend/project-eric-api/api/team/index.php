<?php
/**
 * Team API - Get team members for landing page
 * 
 * GET /api/team
 * Returns public team members list
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

try {
    $db = Database::getInstance();
    
    $members = $db->fetchAll(
        "SELECT id, name, role, bio, avatar_url, skills, github_url, linkedin_url 
         FROM team_info 
         WHERE is_featured = 1 
         ORDER BY sort_order ASC"
    );

    // Decode JSON skills
    foreach ($members as &$member) {
        $member['skills'] = json_decode($member['skills'] ?? '[]', true);
    }

    sendResponse([
        'team' => $members,
        'total' => count($members)
    ], 'Team members retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching team members', 500);
}
