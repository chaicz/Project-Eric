<?php
/**
 * Authentication API - Quick sign-in for a provider account
 *
 * POST /api/auth/oauth/quick-login
 * Body: { "provider": "google" | "github" }
 *
 * This signs the person in as the account that already exists in the
 * database for that provider. It is the fast path for a demo or a
 * shared machine: no provider account, no redirect, no password — the
 * account in the `users` table is used as it is.
 *
 * The provider account is looked up by `oauth_provider`, so the sign-in
 * can only ever land on an account that was set up for that provider.
 *
 * The response is the same shape as the password sign-in, so the
 * client treats both the same way.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$body = getRequestBody();
$provider = strtolower(trim((string) ($body['provider'] ?? '')));

if (!in_array($provider, ['google', 'github'], true)) {
    sendError('Unsupported sign-in provider.', 400);
}

try {
    $db = Database::getInstance();

    // The provider link is what ties the account to the provider. It is
    // unique, so exactly one account can answer for a provider.
    $user = $db->fetchOne(
        "SELECT id, email, password_hash, first_name, last_name, name, role, avatar,
                avatar_url, experience, languages, security_focus, onboarding_complete,
                provider, is_active, oauth_provider, oauth_id
         FROM users WHERE oauth_provider = ? AND is_active = 1
         ORDER BY id ASC LIMIT 1",
        [$provider]
    );

    if (!$user) {
        sendError(
            ucfirst($provider) . ' sign-in is not set up on this server.',
            404
        );
    }

    // Every account gets a team to work in. The provider account may
    // predate that rule, so the team is created when it is missing.
    $team = $db->fetchOne(
        'SELECT id FROM teams WHERE owner_id = ? LIMIT 1',
        [(int) $user['id']]
    );

    if (!$team) {
        $firstName = trim((string) ($user['first_name'] ?? ''));
        $teamId = $db->insert('teams', [
            'name' => ($firstName !== '' ? $firstName : (string) $user['email']) . "'s Team",
            'description' => 'Personal workspace',
            'owner_id' => (int) $user['id'],
        ]);

        $db->insert('team_members', [
            'team_id' => $teamId,
            'user_id' => (int) $user['id'],
            'role' => 'owner',
        ]);
    } else {
        // The account may be in a team it does not own — for instance
        // when it was added as a member. Make sure it is listed.
        $membership = $db->fetchOne(
            'SELECT id FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1',
            [(int) $team['id'], (int) $user['id']]
        );

        if (!$membership) {
            $db->insert('team_members', [
                'team_id' => (int) $team['id'],
                'user_id' => (int) $user['id'],
                'role' => 'owner',
            ]);
        }
    }

    $db->update('users', ['last_login' => date('Y-m-d H:i:s')], 'id = :id', ['id' => $user['id']]);

    $jwt = new JWTAuth();
    $token = $jwt->generateToken($user['id'], $user['email'], $user['role']);

    recordAuditLog(
        $db,
        (int) $user['id'],
        'OAUTH_QUICK_LOGIN',
        'auth',
        $provider
    );

    sendResponse([
        'token' => $token,
        'user' => buildUserPayload($user),
        'isNewUser' => false,
    ], ucfirst($provider) . ' sign-in successful');
} catch (Throwable $e) {
    error_log('Quick OAuth login failed: ' . $e->getMessage());
    sendError('The sign-in could not be completed. Please try again.', 500);
}
