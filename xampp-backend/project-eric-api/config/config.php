<?php
/**
 * Project Eric API - Configuration File
 * 
 * Place this folder in: C:\xampp\htdocs\project-eric-api\
 * 
 * Setup Instructions:
 * 1. Create a MySQL database named 'project_eric'
 * 2. Import the database/schema.sql file
 * 3. Update database credentials below if needed
 * 4. Access API at: http://localhost/project-eric-api/api/
 */

// Error reporting for development
error_reporting(E_ALL);
ini_set('display_errors', 1);

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database Configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'project_eric');
define('DB_USER', 'root');
define('DB_PASS', ''); // Default XAMPP has no password
define('DB_CHARSET', 'utf8mb4');

// JWT Configuration
define('JWT_SECRET', 'your-super-secret-key-change-in-production');
define('JWT_EXPIRY', 86400 * 7); // 7 days

// API Version
define('API_VERSION', '1.0.0');

// Base URL for the API
$base_url = 'http://' . $_SERVER['HTTP_HOST'] . '/project-eric-api';

// Site URL (frontend)
define('SITE_URL', 'http://localhost:5173'); // Vite default dev server
