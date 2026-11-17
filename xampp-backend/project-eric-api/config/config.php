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

// ---------------------------------------------------------------------------
// Timezone
//
// Every timestamp in this API is UTC.
//
// The problem this solves: `php.ini` ships with `date.timezone=Europe/Berlin`
// on a Windows XAMPP install, while MySQL's `CURRENT_TIMESTAMP` follows the
// *operating system's* clock (UTC+8 on this machine). The two disagreed by
// seven hours, so one scan was written into two columns of the same row with
// timestamps seven hours apart, and the dashboard rendered a scan that had
// just finished as "7h ago".
//
// Pinning PHP to UTC and telling MySQL to do the same makes the two agree,
// and the browser's `new Date(...)` then reads the UTC string correctly.
//
// MySQL needs the instruction per connection — `time_zone` is a session
// variable, so a new connection starts from the server default again. That
// is done in `Database::__construct`.
// ---------------------------------------------------------------------------
date_default_timezone_set('UTC');

// ---------------------------------------------------------------------------
// CORS Headers
//
// The allowed origins are listed here instead of using `*`. A wildcard
// origin cannot be combined with `Access-Control-Allow-Credentials`,
// and the browser rejects that combination outright — the response is
// blocked before the page can read it.
//
// Credentials are needed for the social sign-in: the API puts the
// session in a short-lived, HttpOnly cookie and the browser has to
// send that cookie back when it exchanges the one-time handoff code.
// ---------------------------------------------------------------------------

/**
 * The origins that may call the API with credentials.
 *
 * The frontend runs on the Vite dev server during development. Add the
 * production origin here when the app is deployed.
 */
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($requestOrigin !== '' && in_array($requestOrigin, ALLOWED_ORIGINS, true)) {
    // Echo the exact origin. A wildcard is not allowed here, because a
    // credentialed request needs a specific origin.
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
} else {
    // A request without an Origin header (a same-origin call, or a
    // server-side one) gets no CORS headers at all — it does not need
    // them, and sending a wildcard would be wrong.
    header('Access-Control-Allow-Origin: *');
}

// PATCH has to be listed here. The browser sends a preflight for every
// non-simple request, and a preflight that answers with a method list
// without PATCH is rejected outright — which is why "mark as read" on a
// notification and "change a member's role" failed with a CORS error
// even though the API itself handled PATCH perfectly well.
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
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

// ---------------------------------------------------------------------------
// IDE workspace
//
// Every Project Eric account gets its own folder underneath this root,
// named `users\<user id>`. The dashboard opens the code-server workbench
// on that folder, so two accounts on the same machine never see each
// other's files.
//
// Must stay in sync with PROJECT_ERIC_CODE_WORKSPACE in
// scripts/dev-server-plugin.js and $Workspace in scripts/start-ide.ps1.
// ---------------------------------------------------------------------------
define('IDE_WORKSPACE_ROOT', rtrim(
    getenv('PROJECT_ERIC_CODE_WORKSPACE') ?: 'C:\\Users\\Public\\project-eric-ide',
    '/\\'
));

// Where the code-server workbench itself listens.
define('CODE_SERVER_URL', getenv('PROJECT_ERIC_CODE_SERVER_URL') ?: 'http://127.0.0.1:8080');

// Per-account workbenches each get their own port. The formula must
// stay in sync with `portForUser()` in scripts/dev-server-plugin.js and
// `Get-EricPort()` in scripts/start-ide.ps1.
define('CODE_SERVER_USER_PORT_BASE', 8090);
define('CODE_SERVER_USER_PORT_RANGE', 200);
