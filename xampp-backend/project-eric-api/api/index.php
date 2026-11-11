<?php
/**
 * API Entry Point - Router
 * 
 * This file routes all API requests to their respective endpoints.
 * URL format: /api/<module>/<endpoint>
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

// Get the request URI and remove the base path
$requestUri = $_SERVER['REQUEST_URI'];
$basePath = '/project-eric-api/api/';
$path = parse_url($requestUri, PHP_URL_PATH);
$route = str_replace($basePath, '', $path);
$route = trim($route, '/');

// Parse route
$parts = explode('/', $route);
$module = $parts[0] ?? '';
$endpoint = $parts[1] ?? 'index';
$action = $parts[2] ?? '';

// Route mapping
$routes = [
    // Auth routes
    'auth/login' => 'auth/login.php',
    'auth/register' => 'auth/register.php',
    'auth/oauth' => 'auth/oauth.php',
    'auth/validate' => 'auth/validate.php',
    'auth/logout' => 'auth/logout.php',
    'auth/forgot-password' => 'auth/forgot-password.php',
    'auth/reset-password' => 'auth/reset-password.php',
    'auth/change-password' => 'auth/change-password.php',
    'auth/onboarding' => 'auth/onboarding.php',

    // Public routes
    'features' => 'features/index.php',
    'team' => 'team/index.php',
    'landing' => 'landing.php',

    // Authenticated data routes
    'dashboard' => 'dashboard.php',
    'projects' => 'projects/index.php',
    'vulnerabilities' => 'vulnerabilities/index.php',
    'threats' => 'threats/index.php',
    'scans' => 'scans/index.php',
    'workspace' => 'workspace/index.php',
    'notifications' => 'notifications.php',
    'api-keys' => 'api-keys.php',
    'audit-logs' => 'audit-logs.php',
    'integrations' => 'integrations.php',
    'settings' => 'settings.php',
    'two-factor' => 'two-factor.php',
    'profile' => 'profile.php',
    'profile/avatar' => 'profile-avatar.php',
    'team/members' => 'team/members.php',
    // Temporary PDF reports. `reports/download` is handled by the same
    // file — it detects the download by the `?token=` query so the link
    // can be opened in a plain browser tab without a JWT header.
    'reports' => 'reports.php',
    'reports/download' => 'reports.php',

    // API Info
    '' => 'info.php',
    'info' => 'info.php',
];

// Find matching route
if (isset($routes[$route])) {
    require_once __DIR__ . '/' . $routes[$route];
} else {
    // Try to find module-level route
    $moduleFile = __DIR__ . '/' . $module . '/' . ($endpoint ?: 'index.php');
    if (file_exists($moduleFile)) {
        require_once $moduleFile;
    } else {
        sendError('Endpoint not found', 404);
    }
}
