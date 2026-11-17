<?php
/**
 * API Info Endpoint
 * 
 * GET /api/
 * Returns API information and available endpoints
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

sendResponse([
    'name' => 'Project Eric API',
    'version' => API_VERSION,
    'description' => 'Security-focused development platform API',
    'endpoints' => [
        'public' => [
            'GET /api/landing' => 'Get all landing page data',
            'GET /api/features' => 'Get all features',
            'GET /api/team' => 'Get team members',
            'GET /api/info' => 'API information',
        ],
        'auth' => [
            'POST /api/auth/login' => 'User login',
            'POST /api/auth/register' => 'User registration',
            'GET /api/auth/validate' => 'Validate JWT token',
            'POST /api/auth/forgot-password' => 'Request password reset',
            'POST /api/auth/reset-password' => 'Reset password with token',
        ],
    ],
    'documentation' => '/docs',
    'support' => 'team@project-eric.com'
], 'Welcome to Project Eric API');
