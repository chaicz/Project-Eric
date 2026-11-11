<?php
/**
 * Notifications API - The signed-in account's alerts.
 *
 * GET    /api/notifications
 * PATCH  /api/notifications            { action: 'mark_read', id }
 * PATCH  /api/notifications            { action: 'mark_all_read' }
 * DELETE /api/notifications            { action: 'delete', id }
 * DELETE /api/notifications            { action: 'delete_all_read' }
 * POST   /api/notifications            { action: 'mark_read' | 'mark_all_read', id? }
 *
 * Header: Authorization: Bearer <token>
 *
 * Every row belongs to exactly one account. A brand-new account has an
 * empty list, which is the honest reading of "nothing has happened yet" —
 * the alternative was showing demo alerts about a SQL injection in a
 * project the account does not own.
 *
 * DELETE is accepted as well as PATCH: the client deletes a notification
 * with `DELETE` and an `action` in the body. Without DELETE in this list
 * the endpoint answered 405 and the delete button in the UI did nothing.
 */

require_once __DIR__ . '/../includes/Database.php';
require_once __DIR__ . '/../includes/JWTAuth.php';
require_once __DIR__ . '/../includes/ResponseHelper.php';

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

    if ($method === 'GET') {
        $rows = $db->fetchAll(
            "SELECT id, type, title, message, is_read, data, created_at
             FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 100",
            [$userId]
        );

        $notifications = array_map(static function ($n) {
            return [
                'id'        => (int) $n['id'],
                'type'      => $n['type'],
                'title'     => $n['title'],
                'message'   => $n['message'],
                'read'      => (bool) $n['is_read'],
                'data'      => $n['data'] ? json_decode($n['data'], true) : null,
                'createdAt' => toUtcIso($n['created_at']),
            ];
        }, $rows);

        $unread = 0;
        foreach ($notifications as $n) {
            if (!$n['read']) {
                $unread++;
            }
        }

        sendResponse([
            'notifications' => $notifications,
            'unread'        => $unread,
        ], 'Notifications retrieved successfully');
    }

    // ---- Mutations ------------------------------------------------------
    $body = getRequestBody();
    $action = $body['action'] ?? '';

    if ($action === 'mark_all_read') {
        $db->update(
            'notifications',
            ['is_read' => 1],
            'user_id = :uid AND is_read = 0',
            ['uid' => $userId]
        );
        sendResponse(['updated' => true], 'All notifications marked as read');
    }

    if ($action === 'delete') {
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) {
            sendError('A notification id is required', 400);
        }
        // The `user_id = ?` guard means a row from another account is not
        // found, never deleted.
        $db->delete(
            'notifications',
            'id = :id AND user_id = :uid',
            ['id' => $id, 'uid' => $userId]
        );
        sendResponse(['deleted' => true, 'id' => $id], 'Notification deleted');
    }

    if ($action === 'delete_all_read') {
        $db->delete(
            'notifications',
            'user_id = :uid AND is_read = 1',
            ['uid' => $userId]
        );
        sendResponse(['deleted' => true], 'Read notifications deleted');
    }

    if ($action === 'mark_read') {
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) {
            sendError('A notification id is required', 400);
        }
        // The `user_id = ?` guard means an id from another account is
        // simply not found, never updated.
        $db->update(
            'notifications',
            ['is_read' => 1],
            'id = :id AND user_id = :uid',
            ['id' => $id, 'uid' => $userId]
        );
        sendResponse(['updated' => true, 'id' => $id], 'Notification marked as read');
    }

    sendError('Unknown action', 400);

} catch (Exception $e) {
    sendError('An error occurred while handling notifications', 500);
}
