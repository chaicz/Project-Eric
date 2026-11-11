<?php
/**
 * Scans API - Persist an OWASP scan and its findings, and read the
 * stored scan history back.
 *
 * POST /api/scans
 * Header: Authorization: Bearer <token>
 * Body: {
 *   projectName: "Scanned snippet",
 *   language: "JavaScript",
 *   framework: "OWASP Scanner",
 *   scanType: "full",
 *   mode: "code" | "sql",
 *   score: 72,
 *   summary: "Medium Risk",
 *   lineCount: 120,
 *   findings: [
 *     { id: "A01", name: "...", status: "fail", count: 2,
 *       severity: "high", description: "...", cwe: "CWE-285",
 *       remediation: "...", evidence: [{ line: 12, snippet: "..." }] }
 *   ]
 * }
 *
 * GET /api/scans
 * Header: Authorization: Bearer <token>
 * Returns the recent completed scans of the projects the user can see,
 * newest first, so the dashboard's activity feed and trend chart are
 * built from stored scans rather than fixtures.
 *
 * Writes to `projects`, `scan_results`, `scans` and `vulnerabilities`, so
 * the dashboard, analysis and reports pages all read the same persisted
 * state instead of browser-local fixtures.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST' && $method !== 'GET') {
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

    // ---- GET: the stored scan history ----------------------------------
    if ($method === 'GET') {
        $rows = $db->fetchAll(
            "SELECT s.id, s.project_id, s.scan_type, s.vulnerabilities_found,
                    s.code_lines_analyzed, s.completed_at,
                    p.name AS project_name
             FROM scans s
             INNER JOIN projects p ON p.id = s.project_id
             WHERE s.status = 'completed'
               AND p.user_id = ?
             ORDER BY s.completed_at DESC
             LIMIT 60",
            [$userId]
        );

        $scans = array_map(static function ($s) {
            return [
                'id'                  => (string) $s['id'],
                'projectId'           => (string) $s['project_id'],
                'projectName'         => $s['project_name'],
                'scanType'            => $s['scan_type'],
                'vulnerabilitiesFound'=> (int) $s['vulnerabilities_found'],
                'codeLinesAnalyzed'   => (int) $s['code_lines_analyzed'],
                'completedAt'         => toUtcIso($s['completed_at']),
            ];
        }, $rows);

        sendResponse([
            'scans' => $scans,
            'total' => count($scans),
        ], 'Scan history retrieved successfully');
    }

    // ---- POST: persist a scan -------------------------------------------
    $body = getRequestBody();

    $projectName = trim((string) ($body['projectName'] ?? ''));
    if ($projectName === '') {
        $projectName = 'Scanned snippet';
    }
    $language = trim((string) ($body['language'] ?? '')) ?: 'Unknown';
    $framework = trim((string) ($body['framework'] ?? '')) ?: 'OWASP Scanner';
    $scanType = trim((string) ($body['scanType'] ?? 'full'));
    $mode = trim((string) ($body['mode'] ?? 'code'));
    $score = isset($body['score']) ? (int) $body['score'] : null;
    $summaryText = trim((string) ($body['summary'] ?? ''));
    $lineCount = isset($body['lineCount']) ? (int) $body['lineCount'] : 0;
    $findings = isset($body['findings']) && is_array($body['findings']) ? $body['findings'] : [];

    // ---- Project: one row per user + project name ----------------------
    $project = $db->fetchOne(
        "SELECT id FROM projects WHERE user_id = ? AND name = ? LIMIT 1",
        [$userId, $projectName]
    );

    if ($project) {
        $projectId = (int) $project['id'];
        // A re-scan replaces the previous findings for this project so the
        // vulnerability counters reflect the current state, not every scan
        // ever run.
        //
        // The name is refreshed too: the lookup is case-insensitive, so a
        // project first stored as "Scan · javascript" matches a later
        // "Scan · JavaScript" and would otherwise keep the stale casing.
        $db->delete('vulnerabilities', 'project_id = ?', [$projectId]);
        $db->update(
            'projects',
            [
                'name'         => $projectName,
                'language'     => $language,
                'framework'    => $framework,
                'last_modified'=> date('Y-m-d H:i:s'),
            ],
            'id = :id',
            ['id' => $projectId]
        );
    } else {
        $projectId = (int) $db->insert('projects', [
            'user_id'            => $userId,
            'name'               => $projectName,
            'description'        => "Created by the OWASP Scanner ({$mode} mode)",
            'language'           => $language,
            'framework'          => $framework,
            'threat_level'       => 'low',
            'vulnerability_count'=> 0,
            'critical_count'     => 0,
            'files'              => 1,
        ]);
    }

    // ---- Findings -------------------------------------------------------
    $severityOf = static function ($finding) {
        $severity = strtolower((string) ($finding['severity'] ?? 'medium'));
        if (!in_array($severity, ['low', 'medium', 'high', 'critical'], true)) {
            $severity = 'medium';
        }
        return $severity;
    };

    // The OWASP id a detector reports ('A03') and the category name the
    // dashboard and the analysis page filter by ('Injection') are two
    // different things. The `category` column always holds the name, the
    // same way the seeded rows do, so a filter never misses a stored
    // finding.
    $categoryNames = [
        'A01' => 'Broken Access Control',
        'A02' => 'Cryptographic Failures',
        'A03' => 'Injection',
        'A04' => 'Insecure Design',
        'A05' => 'Security Misconfiguration',
        'A06' => 'Vulnerable Components',
        'A07' => 'Authentication Failures',
        'A08' => 'Data Integrity Failures',
        'A09' => 'Logging Failures',
        'A10' => 'SSRF',
    ];

    $cvssOf = static function ($severity) {
        switch ($severity) {
            case 'critical': return 9.5;
            case 'high':     return 7.5;
            case 'medium':   return 5.0;
            case 'low':      return 3.0;
            default:         return 0.0;
        }
    };

    $persisted = 0;
    $critical = 0;
    $high = 0;
    $medium = 0;
    $low = 0;

    foreach ($findings as $finding) {
        if (!is_array($finding)) continue;

        $status = (string) ($finding['status'] ?? 'fail');
        // Only real findings are persisted — a passing category is not a
        // vulnerability.
        if ($status === 'pass') continue;

        $severity = $severityOf($finding);
        $count = max(1, (int) ($finding['count'] ?? 1));

        $evidence = $finding['evidence'] ?? [];
        $location = 'Scanner · ' . $mode . ' · ' . $language;
        if (is_array($evidence) && count($evidence) > 0) {
            $first = $evidence[0];
            $line = $first['line'] ?? null;
            // The snippet itself is deliberately not stored: the scanner
            // promises that the user's source code never leaves the browser.
            // Only the line number is kept so the finding can be located.
            $location = $line !== null
                ? $mode . '/' . $language . ' line ' . $line
                : $mode . '/' . $language;
        }

        $owaspId = (string) ($finding['id'] ?? 'A00');

        $db->insert('vulnerabilities', [
            'project_id'  => $projectId,
            'cwe_id'      => (string) ($finding['cwe'] ?? 'CWE-unknown'),
            'owasp_id'    => $owaspId,
            'title'       => (string) ($finding['name'] ?? 'Finding'),
            'severity'    => $severity,
            'category'    => $categoryNames[$owaspId] ?? $owaspId,
            'description' => (string) ($finding['description'] ?? ''),
            'location'    => $location,
            'status'      => 'open',
            'remediation' => (string) ($finding['remediation'] ?? ''),
            'cvss'        => $cvssOf($severity),
            'discovered_at' => date('Y-m-d H:i:s'),
        ]);

        $persisted++;
        if ($severity === 'critical')      $critical++;
        elseif ($severity === 'high')     $high++;
        elseif ($severity === 'medium')   $medium++;
        else                               $low++;
    }

    // ---- Scan records ---------------------------------------------------
    $totalIssues = array_sum(array_map(
        static function ($f) {
            return is_array($f) ? max(0, (int) ($f['count'] ?? 0)) : 0;
        },
        $findings
    ));

    $summary = [
        'score'       => $score,
        'label'       => $summaryText,
        'mode'        => $mode,
        'language'    => $language,
        'totalIssues' => $totalIssues,
        'severity'    => [
            'critical' => $critical,
            'high'     => $high,
            'medium'   => $medium,
            'low'      => $low,
        ],
    ];

    $db->insert('scan_results', [
        'project_id'           => $projectId,
        'user_id'              => $userId,
        'scan_type'            => in_array($scanType, ['full', 'quick', 'custom', 'incremental'], true) ? $scanType : 'full',
        'status'               => 'completed',
        'findings'             => json_encode($findings),
        'summary'              => json_encode($summary),
        'vulnerabilities_found'=> $persisted,
        'code_lines_analyzed'  => $lineCount,
        'started_at'           => date('Y-m-d H:i:s'),
        'completed_at'         => date('Y-m-d H:i:s'),
    ]);

    $db->insert('scans', [
        'project_id'           => $projectId,
        'scan_type'            => $scanType,
        'status'               => 'completed',
        'vulnerabilities_found'=> $persisted,
        'code_lines_analyzed'  => $lineCount,
        'started_at'           => date('Y-m-d H:i:s'),
        'completed_at'         => date('Y-m-d H:i:s'),
    ]);

    // ---- Project counters ------------------------------------------------
    $threatLevel = 'low';
    if ($critical > 0)      $threatLevel = 'critical';
    elseif ($high > 0)      $threatLevel = 'high';
    elseif ($medium > 0)    $threatLevel = 'medium';

    $db->update(
        'projects',
        [
            'vulnerability_count' => $persisted,
            'critical_count'     => $critical,
            'threat_level'        => $threatLevel,
            'last_modified'       => date('Y-m-d H:i:s'),
        ],
        'id = :id',
        ['id' => $projectId]
    );

    // ---- Audit trail ------------------------------------------------------
    $db->insert('audit_logs', [
        'user_id'       => $userId,
        'action'        => 'SCAN_COMPLETED',
        'resource_type' => 'scan',
        'details'       => json_encode([
            'project'    => $projectName,
            'findings'   => $persisted,
            'score'      => $score,
            'mode'       => $mode,
            'language'   => $language,
        ]),
        'ip_address'    => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent'    => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
    ]);

    // ---- Notification -----------------------------------------------------
    // The header bell and the Notifications page both read the
    // `notifications` table, so a finished scan shows up there for the
    // account that ran it and for nobody else.
    createNotification(
        $db,
        $userId,
        $critical > 0 ? 'error' : ($high > 0 ? 'warning' : 'success'),
        'Scan completed',
        "{$projectName} scored " . ($score === null ? 'n/a' : $score . '/100')
            . " - {$persisted} categor" . ($persisted === 1 ? 'y' : 'ies') . " need attention.",
        [
            'projectId'   => $projectId,
            'projectName' => $projectName,
            'score'       => $score,
            'findings'    => $persisted,
        ]
    );

    sendResponse([
        'projectId'      => $projectId,
        'projectName'    => $projectName,
        'vulnerabilitiesFound' => $persisted,
        'totalIssues'    => $totalIssues,
        'severity'       => $summary['severity'],
        'score'          => $score,
    ], 'Scan persisted successfully', 201);

} catch (Exception $e) {
    sendError('An error occurred while saving the scan', 500);
}
