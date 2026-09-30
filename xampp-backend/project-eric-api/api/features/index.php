<?php
/**
 * Features API - Get all features for landing page
 * 
 * GET /api/features
 * Returns public features list
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

try {
    $db = Database::getInstance();
    
    $features = $db->fetchAll(
        "SELECT id, title, description, icon, category 
         FROM features 
         WHERE is_active = 1 
         ORDER BY sort_order ASC"
    );

    // Group by category
    $grouped = [];
    foreach ($features as $feature) {
        $category = $feature['category'] ?? 'other';
        if (!isset($grouped[$category])) {
            $grouped[$category] = [];
        }
        $grouped[$category][] = $feature;
    }

    sendResponse([
        'features' => $features,
        'grouped' => $grouped,
        'total' => count($features)
    ], 'Features retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching features', 500);
}
