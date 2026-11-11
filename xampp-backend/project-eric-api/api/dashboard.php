<?php
/**
 * Dashboard API - Aggregated security overview for the signed-in user.
 *
 * GET /api/dashboard
 * Header: Authorization: Bearer <token>
 *
 * Returns the exact shapes the React dashboard renders:
 *   stats               -> getSecurityStats() in src/utils/securityData.js
 *   projects            -> mockProjects
 *   recentVulnerabilities -> mockVulnerabilities
 *
 * Everything is derived from the MySQL tables created by database/setup.sql
 * so the dashboard reflects real persisted data rather than fixtures.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

    // ------------------------------------------------------------------
    // Ownership
    //
    // Every row on this page belongs to the signed-in account and to
    // nobody else. The queries filter on `user_id = ?` and nothing else:
    // a project row with `user_id IS NULL` is an unowned row, and showing
    // it here would hand one account another account's findings.
    //
    // A brand-new account therefore starts on an empty dashboard, which
    // is the correct reading of "no projects yet" — the alternative was
    // silently filling a new user's page with the demo account's data.
    // ------------------------------------------------------------------

    // ---- Projects -------------------------------------------------------
    $projects = $db->fetchAll(
        "SELECT id, name, language, framework, threat_level, vulnerability_count,
                critical_count, files, last_modified
         FROM projects
         WHERE user_id = ?
         ORDER BY last_modified DESC",
        [$userId]
    );

    $projectPayload = array_map(static function ($p) {
        return [
            'id'                => (string) $p['id'],
            'name'              => $p['name'],
            'language'          => $p['language'],
            'framework'         => $p['framework'],
            'lastModified'      => toUtcIso($p['last_modified']),
            'threatLevel'       => $p['threat_level'],
            'vulnerabilityCount'=> (int) $p['vulnerability_count'],
            'criticalCount'     => (int) $p['critical_count'],
            'files'             => (int) $p['files'],
        ];
    }, $projects);

    // ---- Vulnerabilities ------------------------------------------------
    $vulnerabilities = $db->fetchAll(
        "SELECT v.id, v.cwe_id, v.owasp_id, v.title, v.severity, v.category,
                v.description, v.location, v.status, v.remediation, v.cvss,
                v.discovered_at
         FROM vulnerabilities v
         LEFT JOIN projects p ON p.id = v.project_id
         WHERE p.user_id = ?
         ORDER BY v.discovered_at DESC",
        [$userId]
    );

    $vulnPayload = array_map(static function ($v) {
        return [
            'id'          => 'VULN-' . str_pad((string) $v['id'], 3, '0', STR_PAD_LEFT),
            'cweId'       => $v['cwe_id'],
            'owaspId'     => $v['owasp_id'],
            'title'       => $v['title'],
            'severity'    => $v['severity'],
            'category'    => $v['category'],
            'description' => $v['description'],
            'location'    => $v['location'],
            'status'      => $v['status'],
            'remediation' => $v['remediation'],
            'cvss'        => (float) $v['cvss'],
            'discoveredAt'=> $v['discovered_at'],
        ];
    }, $vulnerabilities);

    // ---- Severity breakdown --------------------------------------------
    $severityCounts = ['critical' => 0, 'high' => 0, 'medium' => 0, 'low' => 0];
    foreach ($vulnPayload as $v) {
        $key = strtolower($v['severity']);
        if (isset($severityCounts[$key])) {
            $severityCounts[$key]++;
        }
    }
    $totalVulnerabilities = count($vulnPayload);

    // ---- Scans ----------------------------------------------------------
    // Scans are counted through their project so the totals match the
    // project and vulnerability lists above. Counting every scan in the
    // table would report another user's activity on this dashboard.
    $scanTotals = $db->fetchOne(
        "SELECT COUNT(*) AS scans_completed,
                COALESCE(SUM(s.code_lines_analyzed), 0) AS code_lines,
                MAX(s.completed_at) AS last_scan
         FROM scans s
         INNER JOIN projects p ON p.id = s.project_id
         WHERE s.status = 'completed'
           AND p.user_id = ?",
        [$userId]
    );

    // ---- Recent scan trend (older half vs newer half) -------------------
    $scans = $db->fetchAll(
        "SELECT s.vulnerabilities_found FROM scans s
         INNER JOIN projects p ON p.id = s.project_id
         WHERE s.status = 'completed'
           AND p.user_id = ?
         ORDER BY s.completed_at ASC",
        [$userId]
    );
    $trend = 'stable';
    $scanCount = count($scans);
    if ($scanCount >= 2) {
        $half = (int) floor($scanCount / 2);
        $older = array_slice($scans, 0, $half);
        $newer = array_slice($scans, $half);
        $olderAvg = array_sum(array_column($older, 'vulnerabilities_found')) / max(1, count($older));
        $newerAvg = array_sum(array_column($newer, 'vulnerabilities_found')) / max(1, count($newer));
        if ($newerAvg < $olderAvg) {
            $trend = 'improving';
        } elseif ($newerAvg > $olderAvg) {
            $trend = 'worsening';
        }
    }

    // ---- Secure score ----------------------------------------------------
    // Weighted penalty so a single critical finding hurts more than several
    // low-severity ones. Mirrors the in-app scanner's 100 - (issues * 4) idea
    // but weights by severity.
    $secureScore = (int) max(
        0,
        min(
            100,
            100 - (
                $severityCounts['critical'] * 8 +
                $severityCounts['high'] * 5 +
                $severityCounts['medium'] * 3 +
                $severityCounts['low'] * 1
            )
        )
    );

    // ---- Category breakdown ---------------------------------------------
    // How many findings each OWASP category holds. The dashboard shows
    // this per category, so the client does not have to guess a number.
    $categoryCounts = array_fill_keys([
        'A01', 'A02', 'A03', 'A04', 'A05',
        'A06', 'A07', 'A08', 'A09', 'A10',
    ], 0);
    $resolvedCount = 0;
    foreach ($vulnPayload as $v) {
        $owaspId = strtoupper((string) ($v['owaspId'] ?? ''));
        if (isset($categoryCounts[$owaspId])) {
            $categoryCounts[$owaspId]++;
        }
        $status = strtolower((string) ($v['status'] ?? ''));
        if ($status === 'remediated' || $status === 'false_positive') {
            $resolvedCount++;
        }
    }

    // ---- Findings fixed in the last seven days ---------------------------
    // The hero banner reports how many findings the user resolved this
    // week, so the number has to come from the stored rows.
    $resolvedThisWeek = (int) ($db->fetchOne(
        "SELECT COUNT(*) AS c
         FROM vulnerabilities v
         INNER JOIN projects p ON p.id = v.project_id
         WHERE v.status IN ('remediated', 'false_positive')
           AND p.user_id = ?
           AND v.discovered_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
        [$userId]
    )['c'] ?? 0);

    // ---- Daily activity for the last seven days ---------------------------
    // The dashboard's trend chart and the sparklines under its stat cards
    // are built from these buckets, so the numbers match the totals above.
    $activity = [];
    for ($i = 6; $i >= 0; $i--) {
        $day = new DateTimeImmutable("-{$i} days");
        $activity[] = [
            'key'       => $day->format('Y-m-d'),
            'day'       => $day->format('D'),
            'detected'  => 0,
            'resolved'  => 0,
            'lines'     => 0,
            'scans'     => 0,
        ];
    }
    $activityByKey = array_column($activity, null, 'key');

    $dailyScans = $db->fetchAll(
        "SELECT DATE(s.completed_at) AS day,
                COUNT(*) AS scans,
                COALESCE(SUM(s.vulnerabilities_found), 0) AS detected,
                COALESCE(SUM(s.code_lines_analyzed), 0) AS code_lines
         FROM scans s
         INNER JOIN projects p ON p.id = s.project_id
         WHERE s.status = 'completed'
           AND p.user_id = ?
           AND s.completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(s.completed_at)",
        [$userId]
    );
    foreach ($dailyScans as $row) {
        $key = (string) $row['day'];
        if (!isset($activityByKey[$key])) continue;
        $activityByKey[$key]['detected'] = (int) $row['detected'];
        $activityByKey[$key]['lines'] = (int) $row['code_lines'];
        $activityByKey[$key]['scans'] = (int) $row['scans'];
    }

    $dailyResolved = $db->fetchAll(
        "SELECT DATE(v.discovered_at) AS day, COUNT(*) AS resolved
         FROM vulnerabilities v
         INNER JOIN projects p ON p.id = v.project_id
         WHERE v.status IN ('remediated', 'false_positive')
           AND p.user_id = ?
           AND v.discovered_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(v.discovered_at)",
        [$userId]
    );
    foreach ($dailyResolved as $row) {
        $key = (string) $row['day'];
        if (!isset($activityByKey[$key])) continue;
        $activityByKey[$key]['resolved'] = (int) $row['resolved'];
    }

    sendResponse([
        'stats' => [
            'secureScore'           => $secureScore,
            'totalVulnerabilities'  => $totalVulnerabilities,
            'criticalVulnerabilities'=> $severityCounts['critical'],
            'highVulnerabilities'   => $severityCounts['high'],
            'mediumVulnerabilities' => $severityCounts['medium'],
            'lowVulnerabilities'    => $severityCounts['low'],
            'resolvedVulnerabilities'=> $resolvedCount,
            'resolvedThisWeek'      => $resolvedThisWeek,
            'scansCompleted'        => (int) ($scanTotals['scans_completed'] ?? 0),
            'lastScanDate'          => $scanTotals['last_scan'] ?? null,
            'trend'                 => $trend,
            'codeLinesAnalyzed'     => (int) ($scanTotals['code_lines'] ?? 0),
        ],
        'categoryCounts' => $categoryCounts,
        'activity' => array_values($activityByKey),
        'projects' => $projectPayload,
        'recentVulnerabilities' => array_slice($vulnPayload, 0, 10),
        'totalVulnerabilities' => $totalVulnerabilities,
    ], 'Dashboard data retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching dashboard data', 500);
}
