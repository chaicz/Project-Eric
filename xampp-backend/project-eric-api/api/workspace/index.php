<?php
/**
 * Workspace API - Links the signed-in account to its code-server workbench.
 *
 * GET /api/workspace
 * Header: Authorization: Bearer <token>
 *
 * Every Project Eric account gets its own folder underneath the IDE
 * root, so two people working on the same machine never see each
 * other's files. This endpoint:
 *
 *   - resolves the caller's workspace (creating the row on first call)
 *   - records that the workbench was opened (`last_opened_at`)
 *   - returns the profile fields the IDE header shows
 *
 * The mapping lives in the `user_workspaces` table, so the dashboard,
 * the API and the code-server launcher all agree on which folder belongs
 * to whom.
 *
 * Response:
 *   {
 *     user:       { id, email, name, role, avatar },
 *     workspace:  { name, path, codeServerUrl, lastOpenedAt }
 *   }
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

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

    $user = $db->fetchOne(
        "SELECT id, email, first_name, last_name, name, role, avatar, avatar_url
         FROM users WHERE id = ?",
        [$userId]
    );

    if (!$user) {
        sendError('User not found', 404);
    }

    // ---- Resolve (or create) the workspace row --------------------------
    $workspace = $db->fetchOne(
        "SELECT id, workspace_name, workspace_path, code_server_url, last_opened_at
         FROM user_workspaces WHERE user_id = ?",
        [$userId]
    );

    // The port this account's workbench runs on. The formula matches
    // `portForUser()` in scripts/dev-server-plugin.js.
    $port = CODE_SERVER_USER_PORT_BASE + ($userId % CODE_SERVER_USER_PORT_RANGE);
    $codeServerUrl = 'http://127.0.0.1:' . $port;

    if (!$workspace) {
        // The folder name is derived from the numeric user id, so it is
        // stable, predictable and safe as a path segment.
        $name = 'user-' . $userId;
        $path = IDE_WORKSPACE_ROOT . DIRECTORY_SEPARATOR . 'users' . DIRECTORY_SEPARATOR . $name;

        $db->insert('user_workspaces', [
            'user_id'         => $userId,
            'workspace_name'  => $name,
            'workspace_path'  => $path,
            'code_server_url' => $codeServerUrl,
        ]);

        $workspace = $db->fetchOne(
            "SELECT id, workspace_name, workspace_path, code_server_url, last_opened_at
             FROM user_workspaces WHERE user_id = ?",
            [$userId]
        );
    } else {
        // Keep the stored URL in step with the port formula, in case the
        // formula ever changes or the row was seeded by hand.
        if ($workspace['code_server_url'] !== $codeServerUrl) {
            $db->update(
                'user_workspaces',
                ['code_server_url' => $codeServerUrl],
                'user_id = :uid',
                ['uid' => $userId]
            );
            $workspace['code_server_url'] = $codeServerUrl;
        }
    }

    // Remember that this account just used the workbench.
    $db->update(
        'user_workspaces',
        ['last_opened_at' => date('Y-m-d H:i:s')],
        'user_id = :uid',
        ['uid' => $userId]
    );

    sendResponse([
        'user' => [
            'id'     => (int) $user['id'],
            'email'  => $user['email'],
            'name'   => buildUserPayload($user)['name'],
            'role'   => $user['role'],
            'avatar' => $user['avatar'] ?: $user['avatar_url'],
        ],
        'workspace' => [
            'name'          => $workspace['workspace_name'],
            'path'          => $workspace['workspace_path'],
            'codeServerUrl' => $workspace['code_server_url'] ?: $codeServerUrl,
            'lastOpenedAt'  => toUtcIso($workspace['last_opened_at']),
        ],
    ], 'Workspace retrieved successfully');

} catch (Exception $e) {
    sendError('An error occurred while fetching the workspace', 500);
}
