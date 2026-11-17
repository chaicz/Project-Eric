<?php
/**
 * Authentication API - Sign in with the shared preview account
 *
 * POST /api/auth/oauth/preview-login
 *
 * The Google button is a local preview action: it does not open
 * Google's website and does not use OAuth. This endpoint makes the
 * shared preview account behave like a normal database-backed user by
 * returning the same user object and JWT that the password login
 * returns.
 *
 * The preview account is created on first use and owns its own team.
 * It never creates a new account on every click, so its dashboard,
 * projects, scans, and settings stay in one place.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

const PREVIEW_USER_EMAIL = 'preview@project-eric.local';

try {
    $db = Database::getInstance();

    $user = $db->fetchOne(
        "SELECT id, email, password_hash, first_name, last_name, name, role, avatar,
                avatar_url, experience, languages, security_focus, onboarding_complete,
                provider, is_active, oauth_provider, oauth_id
         FROM users WHERE email = ?",
        [PREVIEW_USER_EMAIL]
    );

    if (!$user) {
        // A random password keeps the account unreachable through the
        // normal password form. The preview button does not need it.
        $passwordHash = password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);

        $userId = $db->insert('users', [
            'email' => PREVIEW_USER_EMAIL,
            'password_hash' => $passwordHash,
            'first_name' => 'Preview',
            'last_name' => 'User',
            'name' => 'Preview User',
            'role' => 'user',
            'experience' => 'mid',
            'languages' => json_encode(['JavaScript', 'Python']),
            'security_focus' => json_encode(['A01', 'A03']),
            'onboarding_complete' => 1,
            'provider' => 'google',
            'email_verified' => 1,
            'is_active' => 1,
        ]);

        $teamId = $db->insert('teams', [
            'name' => "Preview's Team",
            'description' => 'Preview workspace',
            'owner_id' => $userId,
        ]);

        $db->insert('team_members', [
            'team_id' => $teamId,
            'user_id' => $userId,
            'role' => 'owner',
        ]);

        $user = $db->fetchOne(
            "SELECT id, email, password_hash, first_name, last_name, name, role, avatar,
                    avatar_url, experience, languages, security_focus, onboarding_complete,
                    provider, is_active, oauth_provider, oauth_id
             FROM users WHERE id = ?",
            [$userId]
        );
    }

    if (!$user || empty($user['is_active'])) {
        sendError('The preview account is unavailable. Please try again.', 503);
    }

    // Every normal account owns a team. Add one if the preview account
    // was created before this endpoint existed.
    $team = $db->fetchOne(
        'SELECT id FROM teams WHERE owner_id = ? LIMIT 1',
        [(int) $user['id']]
    );

    if (!$team) {
        $teamId = $db->insert('teams', [
            'name' => "Preview's Team",
            'description' => 'Preview workspace',
            'owner_id' => (int) $user['id'],
        ]);

        $db->insert('team_members', [
            'team_id' => $teamId,
            'user_id' => (int) $user['id'],
            'role' => 'owner',
        ]);
    } else {
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

    $db->update(
        'users',
        ['last_login' => date('Y-m-d H:i:s')],
        'id = :id',
        ['id' => (int) $user['id']]
    );

    $jwt = new JWTAuth();
    $token = $jwt->generateToken($user['id'], $user['email'], $user['role']);

    recordAuditLog(
        $db,
        (int) $user['id'],
        'PREVIEW_LOGIN',
        'auth',
        'google'
    );

    sendResponse([
        'token' => $token,
        'user' => buildUserPayload($user),
        'isNewUser' => false,
        'isPreview' => true,
    ], 'Preview sign-in successful');
} catch (Throwable $e) {
    error_log('Preview login failed: ' . $e->getMessage());
    sendError('The preview sign-in could not be completed. Please try again.', 500);
}
