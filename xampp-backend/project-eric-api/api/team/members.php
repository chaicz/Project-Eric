<?php
/**
 * Team members API - The signed-in account's own team.
 *
 * GET    /api/team/members
 * POST   /api/team/members   { email, role }
 * PATCH  /api/team/members   { id, role }            (change a member's role)
 * DELETE /api/team/members   { id, type: 'member'|'invitation' }
 *
 * Header: Authorization: Bearer <token>
 *
 * The team is the one the account was given when it registered. Its
 * members come from `team_members` and its pending invitations from
 * `team_invitations`; both are scoped to the caller's team, so one
 * account never sees another account's roster.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if (!in_array($method, ['GET', 'POST', 'PATCH', 'DELETE'], true)) {
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

    // ---- The caller's team ----------------------------------------------
    // The owner column is the link: the account owns at most one team and
    // that team is the one this endpoint reads and writes.
    $team = $db->fetchOne(
        "SELECT id, name, description, owner_id
         FROM teams
         WHERE owner_id = ?
         ORDER BY id ASC
         LIMIT 1",
        [$userId]
    );

    if (!$team) {
        // Older accounts may predate the automatic team. Create one so the
        // page is never left without a roster to render.
        $firstName = '';
        $me = $db->fetchOne("SELECT first_name FROM users WHERE id = ?", [$userId]);
        if ($me) {
            $firstName = (string) $me['first_name'];
        }
        $teamId = $db->insert('teams', [
            'name'        => $firstName . "'s Team",
            'description' => 'Personal workspace',
            'owner_id'    => $userId,
        ]);
        $db->insert('team_members', [
            'team_id' => $teamId,
            'user_id' => $userId,
            'role'    => 'owner',
        ]);
        $team = [
            'id'          => $teamId,
            'name'        => $firstName . "'s Team",
            'description' => 'Personal workspace',
            'owner_id'    => $userId,
        ];
    }

    $teamId = (int) $team['id'];

    // ---- Read ------------------------------------------------------------
    if ($method === 'GET') {
        $memberRows = $db->fetchAll(
            "SELECT tm.id, tm.role, tm.joined_at,
                    u.id AS user_id, u.email, u.first_name, u.last_name, u.name,
                    u.avatar, u.avatar_url, u.role AS account_role
             FROM team_members tm
             JOIN users u ON u.id = tm.user_id
             WHERE tm.team_id = ?
             ORDER BY FIELD(tm.role, 'owner', 'admin', 'developer', 'analyst', 'member', 'viewer'), u.first_name",
            [$teamId]
        );

        $members = array_map(static function ($m) {
            $displayName = trim((string) ($m['name'] ?? ''));
            if ($displayName === '') {
                $displayName = trim(($m['first_name'] ?? '') . ' ' . ($m['last_name'] ?? ''));
            }
            if ($displayName === '') {
                $displayName = (string) $m['email'];
            }
            $initials = strtoupper(substr($displayName, 0, 1));
            if (preg_match('/\s(\S)/u', $displayName, $m2)) {
                $initials .= strtoupper($m2[1]);
            } else {
                $initials = strtoupper(substr($displayName, 0, 2));
            }

            return [
                'id'        => (int) $m['id'],
                'userId'    => (int) $m['user_id'],
                'name'      => $displayName,
                'email'     => $m['email'],
                'role'      => $m['role'],
                'status'    => 'offline',
                'avatar'    => $m['avatar'] ?: $m['avatar_url'],
                'initials'  => $initials,
                'joinedAt'  => toUtcIso($m['joined_at']),
                'lastActive'=> null,
            ];
        }, $memberRows);

        $invitationRows = $db->fetchAll(
            "SELECT id, email, role, status, created_at
             FROM team_invitations
             WHERE team_id = ? AND status = 'pending'
             ORDER BY created_at DESC",
            [$teamId]
        );

        $invitations = array_map(static function ($i) {
            return [
                'id'     => (int) $i['id'],
                'email'  => $i['email'],
                'role'   => $i['role'],
                'status' => $i['status'],
                'sentAt' => toUtcIso($i['created_at']),
            ];
        }, $invitationRows);

        sendResponse([
            'team' => [
                'id'          => $teamId,
                'name'        => $team['name'],
                'description' => $team['description'],
            ],
            'members'     => $members,
            'invitations' => $invitations,
        ], 'Team members retrieved successfully');
    }

    // ---- Mutations -------------------------------------------------------
    $body = getRequestBody();
    $action = $body['action'] ?? '';

    if ($method === 'POST') {
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $role  = (string) ($body['role'] ?? 'viewer');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendError('A valid email address is required', 400);
        }
        if (!in_array($role, ['admin', 'developer', 'analyst', 'viewer'], true)) {
            $role = 'viewer';
        }

        // The owner cannot invite themselves, and an existing member is
        // not re-invited.
        $already = $db->fetchOne(
            "SELECT u.id FROM users u
             JOIN team_members tm ON tm.user_id = u.id
             WHERE tm.team_id = ? AND u.email = ?",
            [$teamId, $email]
        );
        if ($already) {
            sendError('That person is already on this team', 409);
        }

        $pending = $db->fetchOne(
            "SELECT id FROM team_invitations
             WHERE team_id = ? AND email = ? AND status = 'pending'",
            [$teamId, $email]
        );
        if ($pending) {
            sendError('An invitation is already pending for that address', 409);
        }

        $invitationId = $db->insert('team_invitations', [
            'team_id'    => $teamId,
            'email'      => $email,
            'role'       => $role,
            'status'     => 'pending',
            'invited_by' => $userId,
        ]);

        recordAuditLog($db, $userId, 'TEAM_MEMBER_INVITED', 'team', (string) $teamId, [
            'email' => $email,
            'role'  => $role,
        ]);
        createNotification($db, $userId, 'info', 'Invitation sent', "{$email} was invited as {$role}.");

        sendResponse(['id' => (int) $invitationId, 'email' => $email, 'role' => $role], 'Invitation sent', 201);
    }

    if ($method === 'PATCH') {
        $id   = (int) ($body['id'] ?? 0);
        $role = (string) ($body['role'] ?? '');

        if ($id <= 0) {
            sendError('A member id is required', 400);
        }
        if (!in_array($role, ['admin', 'developer', 'analyst', 'viewer'], true)) {
            sendError('Unknown role', 400);
        }

        $member = $db->fetchOne(
            "SELECT tm.id, tm.role, tm.user_id FROM team_members tm
             WHERE tm.id = ? AND tm.team_id = ?",
            [$id, $teamId]
        );
        if (!$member) {
            sendError('Team member not found', 404);
        }
        if ($member['role'] === 'owner') {
            sendError("The team owner's role cannot be changed", 400);
        }

        $db->update('team_members', ['role' => $role], 'id = :id', ['id' => $id]);
        recordAuditLog($db, $userId, 'TEAM_MEMBER_ROLE_CHANGED', 'team_member', (string) $id, ['role' => $role]);

        sendResponse(['id' => $id, 'role' => $role], 'Team member updated');
    }

    if ($method === 'DELETE') {
        $id   = (int) ($body['id'] ?? 0);
        $type = (string) ($body['type'] ?? 'member');

        if ($id <= 0) {
            sendError('An id is required', 400);
        }

        if ($type === 'invitation') {
            $db->delete(
                'team_invitations',
                'id = :id AND team_id = :tid',
                ['id' => $id, 'tid' => $teamId]
            );
            recordAuditLog($db, $userId, 'TEAM_INVITATION_REVOKED', 'team_invitation', (string) $id);
            sendResponse(['deleted' => true], 'Invitation revoked');
        }

        $member = $db->fetchOne(
            "SELECT tm.id, tm.role FROM team_members tm
             WHERE tm.id = ? AND tm.team_id = ?",
            [$id, $teamId]
        );
        if (!$member) {
            sendError('Team member not found', 404);
        }
        if ($member['role'] === 'owner') {
            sendError('The team owner cannot be removed', 400);
        }

        $db->delete('team_members', 'id = :id', ['id' => $id]);
        recordAuditLog($db, $userId, 'TEAM_MEMBER_REMOVED', 'team_member', (string) $id);
        sendResponse(['deleted' => true], 'Team member removed');
    }

    sendError('Unknown action', 400);

} catch (Exception $e) {
    sendError('An error occurred while handling the team', 500);
}
