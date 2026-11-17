<?php
/**
 * API Response Helper Functions
 */

function sendResponse($data, $message = 'Success', $code = 200) {
    http_response_code($code);
    echo json_encode([
        'success' => true,
        'message' => $message,
        'data' => $data,
        'timestamp' => time()
    ]);
    exit();
}

function sendError($message, $code = 400) {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error' => $message,
        'timestamp' => time()
    ]);
    exit();
}

function validateEmail($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL);
}

function sanitizeInput($input) {
    return htmlspecialchars(strip_tags(trim($input)));
}

function getRequestBody() {
    $body = file_get_contents('php://input');
    return json_decode($body, true) ?? [];
}

/**
 * Render a stored timestamp as an unambiguous UTC ISO-8601 string.
 *
 * MySQL hands back `YYYY-MM-DD HH:MM:SS` with no timezone marker. The
 * browser's `new Date(...)` then reads that as *local* time, which on a
 * machine that is not on UTC lands the timestamp hours away from the
 * moment it actually describes — a scan that finished a minute ago showed
 * up as "7h ago".
 *
 * The API stores everything in UTC (see config/config.php), so the value
 * is tagged with `Z` and every consumer reads the same instant.
 *
 * @param string|null $value a timestamp column
 * @return string|null ISO-8601 UTC, or null when there is no timestamp
 */
function toUtcIso($value) {
    if ($value === null || $value === '') {
        return null;
    }
    $ts = strtotime($value . ' UTC');
    if ($ts === false) {
        return (string) $value;
    }
    return gmdate('Y-m-d\TH:i:s\Z', $ts);
}

function generateToken($length = 32) {
    return bin2hex(random_bytes($length));
}

/**
 * Build the canonical user payload returned by every auth endpoint.
 *
 * The dashboard's `AppContext` stores a user object with this exact shape,
 * so the API returns it verbatim instead of the raw DB columns. Keeping
 * the mapping in one place stops the auth endpoints (login, register,
 * validate) from drifting apart.
 *
 * @param array $row A row from the `users` table.
 * @return array
 */
function buildUserPayload(array $row) {
    $firstName = $row['first_name'] ?? '';
    $lastName = $row['last_name'] ?? '';
    $displayName = trim($row['name'] ?? '');

    if ($displayName === '') {
        $displayName = trim("{$firstName} {$lastName}");
    }
    if ($displayName === '') {
        $displayName = $row['email'] ?? 'User';
    }

    // `languages` and `security_focus` are JSON columns. Decode them so
    // the client receives arrays instead of JSON strings.
    $decode = static function ($value) {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    };

    return [
        'id'                => $row['id'] ?? null,
        'email'             => $row['email'] ?? '',
        'name'              => $displayName,
        'firstName'         => $firstName,
        'lastName'          => $lastName,
        'role'              => $row['role'] ?? 'user',
        'avatar'            => $row['avatar'] ?? $row['avatar_url'] ?? null,
        'experience'        => $row['experience'] ?? 'mid',
        'languages'         => $decode($row['languages'] ?? null),
        'securityFocus'     => $decode($row['security_focus'] ?? null),
        'onboardingComplete'=> (bool) ($row['onboarding_complete'] ?? false),
        'provider'          => $row['provider'] ?? 'email',
    ];
}

/**
 * Record a notification for one account.
 *
 * Every notification belongs to exactly one user, so a new account never
 * sees another account's alerts. The bell in the header and the
 * Notifications page both read this table.
 *
 * @param Database $db
 * @param int      $userId
 * @param string   $type    error | warning | success | info
 * @param string   $title
 * @param string   $message
 * @param array|null $data
 * @return int|false the new row id
 */
function createNotification($db, $userId, $type, $title, $message, $data = null) {
    try {
        $db->insert('notifications', [
            'user_id' => (int) $userId,
            'type'    => substr((string) $type, 0, 50),
            'title'   => substr((string) $title, 0, 255),
            'message' => (string) $message,
            'is_read' => 0,
            'data'    => $data === null ? null : json_encode($data),
        ]);
        return (int) $db->getConnection()->lastInsertId();
    } catch (Exception $e) {
        // A notification is a courtesy — it must never break the action
        // that produced it.
        error_log('createNotification failed: ' . $e->getMessage());
        return false;
    }
}

/**
 * Record an audit-log entry for one account.
 *
 * @param Database $db
 * @param int      $userId
 * @param string   $action
 * @param string|null $resourceType
 * @param string|null $resourceId
 * @param array|null $details
 */
function recordAuditLog($db, $userId, $action, $resourceType = null, $resourceId = null, $details = null) {
    try {
        $db->insert('audit_logs', [
            'user_id'       => (int) $userId,
            'action'        => substr((string) $action, 0, 100),
            'resource_type' => $resourceType === null ? null : substr((string) $resourceType, 0, 100),
            'resource_id'   => $resourceId === null ? null : substr((string) $resourceId, 0, 100),
            'details'       => $details === null ? null : json_encode($details),
            'ip_address'    => $_SERVER['REMOTE_ADDR'] ?? null,
            'user_agent'    => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        ]);
    } catch (Exception $e) {
        error_log('recordAuditLog failed: ' . $e->getMessage());
    }
}
