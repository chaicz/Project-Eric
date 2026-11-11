<?php
/**
 * Profile API - The signed-in account's own profile.
 *
 * GET /api/profile
 * PUT /api/profile   { name?, username?, bio?, company?, experience?, languages?, securityFocus? }
 *
 * Header: Authorization: Bearer <token>
 *
 * The profile is stored on the `users` row, so the name shown in the
 * header, the name on the profile page and the name in the API are always
 * the same one. The statistics that come with it are counted from the
 * account's own projects, scans and findings.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if (!in_array($method, ['GET', 'PUT', 'POST'], true)) {
    sendError('Method not allowed', 405);
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();

    $user = $db->fetchOne(
        "SELECT id, email, first_name, last_name, name, role, avatar, avatar_url,
                username, bio, company, experience, languages, security_focus,
                onboarding_complete, provider, created_at
         FROM users WHERE id = ?",
        [$userId]
    );

    if (!$user) {
        sendError('User not found', 404);
    }

    if ($method !== 'GET') {
        $body = getRequestBody();
        $update = [];

        if (array_key_exists('name', $body) && trim((string) $body['name']) !== '') {
            $full = trim((string) $body['name']);
            $parts = preg_split('/\s+/', $full);
            $first = array_shift($parts);
            $last = implode(' ', $parts);
            $update['first_name'] = $first;
            $update['last_name']  = $last;
            $update['name']       = $full;
        }

        if (array_key_exists('username', $body)) {
            $update['username'] = substr(trim((string) $body['username']), 0, 100);
        }
        if (array_key_exists('bio', $body)) {
            $update['bio'] = substr(trim((string) $body['bio']), 0, 1000);
        }
        if (array_key_exists('company', $body)) {
            $update['company'] = substr(trim((string) $body['company']), 0, 255);
        }
        if (array_key_exists('experience', $body) && $body['experience'] !== null) {
            $update['experience'] = substr((string) $body['experience'], 0, 50);
        }

        // The API speaks camelCase; the table uses snake_case.
        // `securityFocus` has no `securityFocus` column, so an UPDATE that
        // carried it failed with a 500 and none of the profile fields were
        // saved.
        foreach (['languages' => 'languages', 'securityFocus' => 'security_focus'] as $bodyKey => $column) {
            if (!array_key_exists($bodyKey, $body) || $body[$bodyKey] === null) {
                continue;
            }
            $value = $body[$bodyKey];
            if (is_string($value)) {
                $value = array_values(array_filter(array_map('trim', explode(',', $value))));
            }
            if (!is_array($value)) {
                continue;
            }
            $update[$column] = json_encode(array_values($value));
        }

        if ($update) {
            $db->update('users', $update, 'id = :uid', ['uid' => $userId]);
            recordAuditLog($db, $userId, 'PROFILE_UPDATED', 'user', (string) $userId, array_keys($update));

            $user = $db->fetchOne(
                "SELECT id, email, first_name, last_name, name, role, avatar, avatar_url,
                        username, bio, company, experience, languages, security_focus,
                        onboarding_complete, provider, created_at
                 FROM users WHERE id = ?",
                [$userId]
            );
        }
    }

    // ---- Statistics, counted from this account's own rows ---------------
    $projectCount = (int) ($db->fetchOne(
        "SELECT COUNT(*) AS c FROM projects WHERE user_id = ?",
        [$userId]
    )['c'] ?? 0);

    $scanCount = (int) ($db->fetchOne(
        "SELECT COUNT(*) AS c FROM scans s
         JOIN projects p ON p.id = s.project_id
         WHERE p.user_id = ?",
        [$userId]
    )['c'] ?? 0);

    $findingCount = (int) ($db->fetchOne(
        "SELECT COUNT(*) AS c FROM vulnerabilities v
         JOIN projects p ON p.id = v.project_id
         WHERE p.user_id = ?",
        [$userId]
    )['c'] ?? 0);

    $resolvedCount = (int) ($db->fetchOne(
        "SELECT COUNT(*) AS c FROM vulnerabilities v
         JOIN projects p ON p.id = v.project_id
         WHERE p.user_id = ? AND v.status = 'remediated'",
        [$userId]
    )['c'] ?? 0);

    $criticalCount = (int) ($db->fetchOne(
        "SELECT COUNT(*) AS c FROM vulnerabilities v
         JOIN projects p ON p.id = v.project_id
         WHERE p.user_id = ? AND v.severity = 'critical'",
        [$userId]
    )['c'] ?? 0);

    $linesAnalyzed = (int) ($db->fetchOne(
        "SELECT COALESCE(SUM(s.code_lines_analyzed), 0) AS c FROM scans s
         JOIN projects p ON p.id = s.project_id
         WHERE p.user_id = ?",
        [$userId]
    )['c'] ?? 0);

    $lastScan = $db->fetchOne(
        "SELECT s.completed_at, p.name FROM scans s
         JOIN projects p ON p.id = s.project_id
         WHERE p.user_id = ?
         ORDER BY s.completed_at DESC, s.id DESC
         LIMIT 1",
        [$userId]
    );

    $lastLogin = $db->fetchOne(
        "SELECT last_login FROM users WHERE id = ?",
        [$userId]
    );

    // ---- Recent activity, from this account's own scans -----------------
    $activityRows = $db->fetchAll(
        "SELECT s.completed_at, s.vulnerabilities_found, p.name
         FROM scans s
         INNER JOIN projects p ON p.id = s.project_id
         WHERE p.user_id = ? AND s.status = 'completed'
         ORDER BY s.completed_at DESC, s.id DESC
         LIMIT 8",
        [$userId]
    );

    $activity = array_map(static function ($a) {
        return [
            'type'    => 'scan',
            'project' => $a['name'],
            'time'    => $a['completed_at'],
            'status'  => 'completed',
            'findings'=> (int) $a['vulnerabilities_found'],
        ];
    }, $activityRows);

    // ---- The account's own team -----------------------------------------
    $team = $db->fetchOne(
        "SELECT id, name FROM teams WHERE owner_id = ? ORDER BY id ASC LIMIT 1",
        [$userId]
    );

    $teams = [];
    if ($team) {
        $memberCount = (int) ($db->fetchOne(
            "SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?",
            [$team['id']]
        )['c'] ?? 0);
        $teams[] = [
            'name'    => $team['name'],
            'members' => $memberCount,
            'role'    => 'Owner',
        ];
    }

    sendResponse([
        'user' => [
            'id'                 => (int) $user['id'],
            'email'              => $user['email'],
            'name'               => buildUserPayload($user)['name'],
            'firstName'          => $user['first_name'],
            'lastName'           => $user['last_name'],
            'username'           => $user['username'] ?? '',
            'bio'                => $user['bio'] ?? '',
            'company'            => $user['company'] ?? '',
            'role'               => $user['role'],
            'avatar'             => $user['avatar'] ?: $user['avatar_url'],
            'experience'         => $user['experience'] ?? 'mid',
            'languages'          => $user['languages'] ? json_decode($user['languages'], true) : [],
            'securityFocus'      => $user['security_focus'] ? json_decode($user['security_focus'], true) : [],
            'onboardingComplete' => (bool) $user['onboarding_complete'],
            'provider'           => $user['provider'],
            'createdAt'          => toUtcIso($user['created_at']),
            'lastLogin'          => toUtcIso($lastLogin['last_login'] ?? null),
        ],
        'stats' => [
            'projects'       => $projectCount,
            'scans'          => $scanCount,
            'findings'       => $findingCount,
            'findingsFixed'  => $resolvedCount,
            'criticalFindings' => $criticalCount,
            'linesAnalyzed'  => $linesAnalyzed,
            'lastScanAt'     => $lastScan['completed_at'] ?? null,
            'lastScanProject'=> $lastScan['name'] ?? null,
        ],
        'activity' => $activity,
        'teams'    => $teams,
    ], 'Profile retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while handling the profile', 500);
}
