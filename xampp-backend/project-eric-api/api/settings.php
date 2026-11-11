<?php
/**
 * Settings API - The signed-in account's own preferences.
 *
 * GET /api/settings
 * PUT /api/settings   { notifications?: {...}, appearance?: {...} }
 *
 * Header: Authorization: Bearer <token>
 *
 * The Settings page used to keep every preference in `localStorage` and
 * told the user that "everything syncs to your account automatically".
 * It did not: the choices lived in the browser, vanished on another
 * machine, and the Notifications page read a *different* local key from
 * the Settings page, so the two screens disagreed about the same
 * setting.
 *
 * This endpoint makes the account the owner of its preferences. The
 * browser still caches them for a fast first paint, but the server copy
 * is the one that wins.
 *
 * The settings are stored as one JSON document per account, which keeps
 * the table stable: adding a preference does not need a migration.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if (!in_array($method, ['GET', 'PUT'], true)) {
    sendError('Method not allowed', 405);
}

/**
 * The preferences a brand-new account starts with.
 *
 * Kept here so the API is the single source of truth for the defaults;
 * the client mirrors them for the offline first paint.
 */
function defaultSettings(): array {
    return [
        'notifications' => [
            'email'              => true,
            'push'               => true,
            'vulnerabilityAlerts' => true,
            'weeklyReport'       => false,
            'scanCompletion'     => true,
        ],
        'appearance' => [
            'theme'  => 'light',
            'accent' => '#3B82F6',
        ],
    ];
}

/**
 * Coerce a stored JSON document into a complete, well-typed settings
 * object. A missing or broken value falls back to the default for that
 * one key rather than discarding the whole document.
 */
function normalizeSettings($raw): array {
    $defaults = defaultSettings();
    if (!is_array($raw)) {
        return $defaults;
    }

    $out = $defaults;

    if (isset($raw['notifications']) && is_array($raw['notifications'])) {
        foreach (array_keys($defaults['notifications']) as $key) {
            if (array_key_exists($key, $raw['notifications'])) {
                $out['notifications'][$key] = (bool) $raw['notifications'][$key];
            }
        }
    }

    if (isset($raw['appearance']) && is_array($raw['appearance'])) {
        $theme = (string) ($raw['appearance']['theme'] ?? '');
        if (in_array($theme, ['light', 'dark', 'system'], true)) {
            $out['appearance']['theme'] = $theme;
        }
        $accent = (string) ($raw['appearance']['accent'] ?? '');
        // The accent is written into a CSS custom property, so only a
        // real hex colour is accepted.
        if (preg_match('/^#[0-9A-Fa-f]{6}$/', $accent)) {
            $out['appearance']['accent'] = $accent;
        }
    }

    return $out;
}

try {
    $jwt = new JWTAuth();
    $payload = $jwt->authenticate();

    if (!$payload) {
        sendError('Invalid or expired token', 401);
    }

    $userId = (int) $payload['sub'];
    $db = Database::getInstance();

    if ($method === 'GET') {
        $row = $db->fetchOne(
            'SELECT settings FROM user_settings WHERE user_id = ?',
            [$userId]
        );

        $stored = $row ? json_decode((string) $row['settings'], true) : null;
        $settings = normalizeSettings($stored);

        sendResponse(['settings' => $settings], 'Settings retrieved successfully');
    }

    // ---- PUT: merge the incoming preferences into the stored ones ------
    $body = getRequestBody();

    $row = $db->fetchOne(
        'SELECT settings FROM user_settings WHERE user_id = ?',
        [$userId]
    );
    $current = normalizeSettings($row ? json_decode((string) $row['settings'], true) : null);

    $changed = [];

    if (array_key_exists('notifications', $body) && is_array($body['notifications'])) {
        foreach ($current['notifications'] as $key => $value) {
            if (array_key_exists($key, $body['notifications'])) {
                $next = (bool) $body['notifications'][$key];
                if ($next !== $value) {
                    $changed[] = "notifications.{$key}";
                }
                $current['notifications'][$key] = $next;
            }
        }
    }

    if (array_key_exists('appearance', $body) && is_array($body['appearance'])) {
        $theme = (string) ($body['appearance']['theme'] ?? '');
        if (in_array($theme, ['light', 'dark', 'system'], true)) {
            if ($theme !== $current['appearance']['theme']) {
                $changed[] = 'appearance.theme';
            }
            $current['appearance']['theme'] = $theme;
        }
        $accent = (string) ($body['appearance']['accent'] ?? '');
        if (preg_match('/^#[0-9A-Fa-f]{6}$/', $accent)) {
            if ($accent !== $current['appearance']['accent']) {
                $changed[] = 'appearance.accent';
            }
            $current['appearance']['accent'] = $accent;
        }
    }

    $encoded = json_encode($current);

    if ($row) {
        $db->update(
            'user_settings',
            ['settings' => $encoded],
            'user_id = :uid',
            ['uid' => $userId]
        );
    } else {
        $db->insert('user_settings', [
            'user_id'  => $userId,
            'settings' => $encoded,
        ]);
    }

    if ($changed) {
        recordAuditLog($db, $userId, 'SETTINGS_CHANGED', 'settings', (string) $userId, $changed);
    }

    sendResponse(['settings' => $current], 'Settings saved successfully');

} catch (Exception $e) {
    sendError('An error occurred while handling settings', 500);
}
