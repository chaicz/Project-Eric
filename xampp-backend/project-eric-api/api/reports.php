<?php
/**
 * Reports API — temporary PDF security reports.
 *
 * POST   /api/reports
 * Header: Authorization: Bearer <token>
 * Body: {
 *   filename:     "orders.php",
 *   title:        "OWASP Top 10 (2026) Security Report",
 *   language:     "PHP",
 *   score:        62,
 *   totalIssues:  8,
 *   contentBase64:"JVBERi0xLjQK..."
 * }
 * → { id, token, downloadUrl, expiresAt, expiresInHours }
 *
 * GET    /api/reports
 * Header: Authorization: Bearer <token>
 * → the account's own report exports, newest first.
 *
 * GET    /api/reports/download?token=<64 hex chars>
 * → streams the PDF. No JWT: the link is a bearer secret, the way a
 *   signed-URL is. It works when it is opened in a plain browser tab or
 *   a PDF viewer, which a JWT header could never do.
 *
 * DELETE /api/reports
 * Header: Authorization: Bearer <token>
 * Body: { id }
 * → removes the row and the file immediately.
 *
 * ---------------------------------------------------------------------------
 * Why the expiry matters
 * ---------------------------------------------------------------------------
 * The PDF embeds the scanned source code. Storing that copy forever
 * would be a data-protection problem, so every report is stamped with an
 * `expires_at` 24 hours after it was created and the row *and* the file
 * on disk are deleted as soon as that moment passes.
 *
 * The deletion is lazy but reliable: every request to this endpoint —
 * including the download itself — first sweeps out whatever has expired.
 * That way a report can never be served after its expiry, and the disk
 * is cleaned whenever the app is used. The `expires_at` column is also
 * checked on every download, which returns 410 Gone for a link that has
 * passed its time.
 *
 * The files live in `uploads/reports/`, which has its own `.htaccess`
 * that denies direct web access — the only way to reach a file is
 * through the token endpoint.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// How long a stored report survives. The user asked for the output file
// to be gone after one day so their source code is not kept around.
define('REPORT_TTL_HOURS', 24);

// A generated PDF is a few hundred kilobytes at most; 10 MB is a very
// generous ceiling that still stops someone from parking a huge file on
// the server.
define('REPORT_MAX_BYTES', 10 * 1024 * 1024);

/**
 * The folder the generated PDFs live in.
 *
 * @return string absolute path, without a trailing slash
 */
function reportUploadDir(): string {
    return __DIR__ . '/../uploads/reports';
}

/**
 * Delete every report whose expiry has passed.
 *
 * Both halves matter: the row disappears from the database, and the PDF
 * disappears from disk. Leaving the file behind would keep the user's
 * source code on the server long after the link stopped working.
 *
 * Files with no matching row are removed as well. That happens when an
 * account is deleted (the database cascades the row away) or when
 * something went wrong while storing a report. Such a file would
 * otherwise sit on the server forever, with no row left to expire it.
 *
 * @param Database $db
 * @return int the number of reports that were removed
 */
function purgeExpiredReports(Database $db): int {
    try {
        $expired = $db->fetchAll(
            "SELECT id, stored_name FROM report_exports WHERE expires_at < UTC_TIMESTAMP()"
        );
    } catch (Exception $e) {
        error_log('purgeExpiredReports failed: ' . $e->getMessage());
        return 0;
    }

    $removed = 0;

    if ($expired) {
        $dir = reportUploadDir();

        foreach ($expired as $row) {
            $storedName = (string) ($row['stored_name'] ?? '');
            // Guard against a traversal in the stored name.
            if ($storedName !== '' && basename($storedName) === $storedName) {
                $file = $dir . '/' . $storedName;
                if (is_file($file)) {
                    @unlink($file);
                }
            }
            try {
                $db->delete('report_exports', 'id = ?', [(int) $row['id']]);
            } catch (Exception $e) {
                error_log('purgeExpiredReports delete failed: ' . $e->getMessage());
            }
            $removed++;
        }
    }

    // ---- Remove files that no longer have a row -------------------------
    //
    // A stored PDF is only kept for as long as its row says it may
    // exist. A file without a row is an orphan and is removed.
    $dir = reportUploadDir();
    if (is_dir($dir)) {
        try {
            $known = $db->fetchAll("SELECT stored_name FROM report_exports");
            $knownNames = [];
            foreach ($known as $row) {
                $name = (string) ($row['stored_name'] ?? '');
                if ($name !== '') {
                    $knownNames[$name] = true;
                }
            }

            foreach ((array) glob($dir . '/*.pdf') as $file) {
                if (!is_file($file)) {
                    continue;
                }
                $name = basename($file);
                if (!isset($knownNames[$name])) {
                    @unlink($file);
                    $removed++;
                }
            }
        } catch (Exception $e) {
            error_log('purgeExpiredReports orphan sweep failed: ' . $e->getMessage());
        }
    }

    return $removed;
}

/**
 * Turn one database row into the payload the client works with.
 *
 * @param array $row
 * @return array
 */
function reportPayload(array $row): array {
    $expiresAt = toUtcIso($row['expires_at'] ?? null);
    $remaining = 0;
    if ($expiresAt) {
        $remaining = max(0, (int) ceil((strtotime($expiresAt) - time()) / 3600));
    }

    return [
        'id'             => (string) $row['id'],
        'token'          => (string) $row['token'],
        'fileName'       => (string) $row['file_name'],
        'title'          => (string) $row['title'],
        'language'       => $row['language'] ?: null,
        'score'          => $row['score'] === null ? null : (int) $row['score'],
        'totalIssues'    => (int) ($row['total_issues'] ?? 0),
        'sizeBytes'      => (int) ($row['size_bytes'] ?? 0),
        'downloadUrl'    => reportDownloadUrl((string) $row['token']),
        'expiresAt'      => $expiresAt,
        'expiresInHours' => $remaining,
        'createdAt'      => toUtcIso($row['created_at'] ?? null),
    ];
}

/**
 * The absolute URL a report can be downloaded from.
 *
 * The link is absolute so the user can copy it out of the app and open
 * it in any browser tab or PDF viewer — a relative path would only work
 * inside the dashboard.
 *
 * @param string $token
 * @return string
 */
function reportDownloadUrl(string $token): string {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    // The directory the API is served from, e.g. /project-eric-api/api.
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api')), '/');
    return $scheme . '://' . $host . $base . '/reports/download?token=' . rawurlencode($token);
}

// ---------------------------------------------------------------------------
// The download route.
//
// `index.php` maps `reports` onto this file. The download is the same
// endpoint with a `?token=` query and no JWT, so it is detected here
// before the JWT check runs.
// ---------------------------------------------------------------------------

$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$isDownload = (bool) preg_match('#/reports/download(\?|$)#', $requestUri);

if ($isDownload) {
    $token = trim((string) ($_GET['token'] ?? ''));

    if ($token === '' || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        sendError('A valid report token is required', 400);
    }

    $db = Database::getInstance();

    // Sweep the expired reports first, so a link that has just run out
    // stops working even if nobody has used the app since.
    purgeExpiredReports($db);

    $row = $db->fetchOne(
        "SELECT id, stored_name, file_name, expires_at FROM report_exports WHERE token = ?",
        [$token]
    );

    if (!$row) {
        sendError('This report link does not exist or has already been deleted', 404);
    }

    // Belt and braces: the row can still be here if it expired between
    // the sweep above and this read.
    if (strtotime((string) $row['expires_at'] . ' UTC') <= time()) {
        sendError('This report has expired and has been deleted', 410);
    }

    $storedName = (string) $row['stored_name'];
    if (basename($storedName) !== $storedName) {
        sendError('This report link does not exist', 404);
    }

    $file = reportUploadDir() . '/' . $storedName;
    if (!is_file($file)) {
        // The file is gone but the row is not — clean the row up so the
        // list does not show a report that can never be opened.
        $db->delete('report_exports', 'id = ?', [(int) $row['id']]);
        sendError('This report has already been deleted', 404);
    }

    // The response is a file, not JSON.
    header('Content-Type: application/pdf');
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', (string) $row['file_name']) . '.pdf"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    readfile($file);
    exit;
}

// ---------------------------------------------------------------------------
// The authenticated routes.
// ---------------------------------------------------------------------------

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();

    // Every request to this endpoint sweeps out the expired reports
    // first. This is what keeps the 24-hour promise: nothing survives
    // longer than a day, and the disk is cleaned whenever the app is
    // used.
    purgeExpiredReports($db);

    // ---- GET: the account's own reports ---------------------------------
    if ($method === 'GET') {
        $rows = $db->fetchAll(
            "SELECT id, token, file_name, title, language, score, total_issues,
                    size_bytes, expires_at, created_at
             FROM report_exports
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 50",
            [$userId]
        );

        $reports = array_map('reportPayload', $rows);

        sendResponse([
            'reports' => $reports,
            'total'   => count($reports),
            'ttlHours'=> REPORT_TTL_HOURS,
        ], 'Report exports retrieved successfully');
    }

    // ---- POST: store a freshly generated report --------------------------
    if ($method === 'POST') {
        $body = getRequestBody();

        $fileName = trim((string) ($body['filename'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        $language = trim((string) ($body['language'] ?? ''));
        $score = isset($body['score']) ? (int) $body['score'] : null;
        $totalIssues = isset($body['totalIssues']) ? (int) $body['totalIssues'] : 0;
        $contentBase64 = trim((string) ($body['contentBase64'] ?? ''));

        if ($contentBase64 === '') {
            sendError('The report content is required', 400);
        }

        $binary = base64_decode($contentBase64, true);
        if ($binary === false || $binary === '') {
            sendError('The report content could not be decoded', 400);
        }

        if (strlen($binary) > REPORT_MAX_BYTES) {
            sendError('The report is too large (max 10 MB)', 400);
        }

        // The MIME type in the request is not evidence — check the magic
        // bytes. Only a real PDF is accepted.
        if (substr($binary, 0, 5) !== '%PDF-') {
            sendError('The report must be a PDF file', 400);
        }

        if ($fileName === '') {
            $fileName = 'security-report';
        }
        if ($title === '') {
            $title = 'OWASP Top 10 (2026) Security Report';
        }

        // ---- Write the file ---------------------------------------------
        $dir = reportUploadDir();
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            sendError('The report folder could not be created', 500);
        }

        // The on-disk name is random, so the file cannot be guessed from
        // the original name and one user's report can never overwrite
        // another's.
        $storedName = 'report_' . bin2hex(random_bytes(16)) . '_' . $userId . '.pdf';
        $absolutePath = $dir . '/' . $storedName;

        if (@file_put_contents($absolutePath, $binary) === false) {
            sendError('The report could not be saved', 500);
        }

        // ---- Store the row ----------------------------------------------
        $token = bin2hex(random_bytes(32));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + REPORT_TTL_HOURS * 3600);

        try {
            $id = $db->insert('report_exports', [
                'user_id'      => $userId,
                'token'        => $token,
                'file_name'    => mb_substr($fileName, 0, 255),
                'stored_name'  => $storedName,
                'title'        => mb_substr($title, 0, 255),
                'language'     => $language !== '' ? mb_substr($language, 0, 100) : null,
                'score'        => $score,
                'total_issues' => $totalIssues,
                'size_bytes'   => strlen($binary),
                'expires_at'   => $expiresAt,
            ]);
        } catch (Exception $e) {
            @unlink($absolutePath);
            error_log('reports insert failed: ' . $e->getMessage());
            sendError('The report could not be saved', 500);
        }

        recordAuditLog($db, $userId, 'REPORT_EXPORTED', 'report', (string) $id, [
            'fileName'    => $fileName,
            'expiresAt'   => $expiresAt,
            'sizeBytes'   => strlen($binary),
        ]);

        $row = $db->fetchOne(
            "SELECT id, token, file_name, title, language, score, total_issues,
                    size_bytes, expires_at, created_at
             FROM report_exports WHERE id = ?",
            [(int) $id]
        );

        sendResponse([
            'report' => reportPayload($row),
            // Flattened as well, so the client does not have to reach
            // into a nested object for the link it shows the user.
            'id'             => (string) $id,
            'token'          => $token,
            'downloadUrl'    => reportDownloadUrl($token),
            'expiresAt'      => toUtcIso($expiresAt),
            'expiresInHours' => REPORT_TTL_HOURS,
        ], 'Report stored successfully', 201);
    }

    // ---- DELETE: remove a report right now -------------------------------
    if ($method === 'DELETE') {
        $body = getRequestBody();
        $id = (int) ($body['id'] ?? 0);

        if ($id <= 0) {
            sendError('A report id is required', 400);
        }

        $row = $db->fetchOne(
            "SELECT id, stored_name FROM report_exports WHERE id = ? AND user_id = ?",
            [$id, $userId]
        );

        if (!$row) {
            sendError('Report not found', 404);
        }

        $storedName = (string) $row['stored_name'];
        if ($storedName !== '' && basename($storedName) === $storedName) {
            $file = reportUploadDir() . '/' . $storedName;
            if (is_file($file)) {
                @unlink($file);
            }
        }

        $db->delete('report_exports', 'id = ? AND user_id = ?', [$id, $userId]);

        recordAuditLog($db, $userId, 'REPORT_DELETED', 'report', (string) $id);

        sendResponse(['id' => (string) $id], 'Report deleted successfully');
    }

    sendError('Method not allowed', 405);
} catch (Exception $e) {
    error_log('reports error: ' . $e->getMessage());
    sendError('An error occurred while handling the report', 500);
}
