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
    
    // Public routes
    'features' => 'features/index.php',
    'team' => 'team/index.php',
    'landing' => 'landing.php',
    
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
