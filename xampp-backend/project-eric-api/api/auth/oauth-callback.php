<?php
/**
 * Authentication API - OAuth 2.0 provider callback
 *
 * GET /api/auth/oauth/{provider}/callback
 *
 * The provider redirects the browser here with a one-time code and the
 * state value created when the flow started. This endpoint verifies
 * both, exchanges the code on the server, and creates the Project Eric
 * session.
 *
 * The browser is returned to the frontend callback page with a one-time
 * handoff code. The JWT itself is placed in a short-lived, HttpOnly
 * cookie and read by the exchange endpoint so it never appears in the
 * browser history or a URL that can be copied and replayed.
 */

require_once __DIR__ . '/../../includes/Database.php';
require_once __DIR__ . '/../../includes/JWTAuth.php';
require_once __DIR__ . '/../../includes/ResponseHelper.php';
require_once __DIR__ . '/../../includes/OAuthProvider.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

$provider = sanitizeInput($_GET['provider'] ?? '');
$code = sanitizeInput($_GET['code'] ?? '');
$state = sanitizeInput($_GET['state'] ?? '');
$error = sanitizeInput($_GET['error'] ?? '');

$frontendCallback = rtrim(oauthEnv('PROJECT_ERIC_FRONTEND_URL') ?: 'http://localhost:5173', '/')
    . '/oauth/callback';

if ($error !== '') {
    header('Location: ' . $frontendCallback . '?error=' . rawurlencode('The ' . $provider . ' sign-in was cancelled.'), true, 302);
    exit();
}

$config = oauthProviderConfig($provider);
if ($config === null) {
    header('Location: ' . $frontendCallback . '?error=' . rawurlencode($provider . ' login is not configured on this server.'), true, 302);
    exit();
}

if ($code === '') {
    header('Location: ' . $frontendCallback . '?error=' . rawurlencode('The provider did not return an authorization code.'), true, 302);
    exit();
}

try {
    // The preview flag comes from the state cookie this server wrote,
    // so it cannot be set by the browser.
    $isPreview = oauthValidateState($provider, $state);

    $accessToken = oauthExchangeCode($config, $code);
    $identity = oauthFetchIdentity($provider, $accessToken);

    // ---- Preview sign-in ------------------------------------------------
    //
    // The identity is verified by the provider and the person is sent
    // into the app, but nothing is written: no account row, no provider
    // link, no team, no audit entry and no session token. The browser
    // gets a short-lived preview session that only lives in this
    // browser's storage.
    if ($isPreview) {
        $previewUser = [
            'id' => null,
            'email' => $identity['email'],
            'name' => trim($identity['firstName'] . ' ' . $identity['lastName']) ?: $identity['email'],
            'firstName' => $identity['firstName'],
            'lastName' => $identity['lastName'],
            'role' => 'preview',
            'avatar' => $identity['avatar'],
            'experience' => 'mid',
            'languages' => [],
            'securityFocus' => [],
            'onboardingComplete' => true,
            'provider' => $provider,
        ];

        $previewPayload = json_encode([
            'user' => $previewUser,
            'provider' => $provider,
            'expiresAt' => time() + 3600,
        ]);

        setcookie('project_eric_oauth_preview', $previewPayload, [
            'expires' => time() + 3600,
            'path' => '/',
            'samesite' => 'Lax',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true,
        ]);

        header('Location: ' . $frontendCallback . '?preview=' . rawurlencode($provider), true, 302);
        exit();
    }

    $db = Database::getInstance();

    // The provider identity is the authoritative lookup. It cannot be
    // claimed by another account because the provider link is unique.
    $user = $db->fetchOne(
        "SELECT id, email, password_hash, first_name, last_name, name, role, avatar,
                avatar_url, experience, languages, security_focus, onboarding_complete,
                provider, is_active, oauth_provider, oauth_id
         FROM users WHERE oauth_provider = ? AND oauth_id = ?",
        [$provider, $identity['oauthId']]
    );

    $isNewUser = false;

    if (!$user) {
        // An email account can be linked to the provider. This keeps a
        // person's projects and history when they first use social login.
        $user = $db->fetchOne(
            "SELECT id, email, password_hash, first_name, last_name, name, role, avatar,
                    avatar_url, experience, languages, security_focus, onboarding_complete,
                    provider, is_active, oauth_provider, oauth_id
             FROM users WHERE email = ?",
            [$identity['email']]
        );

        if ($user && !empty($user['oauth_provider']) && $user['oauth_provider'] !== $provider) {
            header('Location: ' . $frontendCallback . '?error=' . rawurlencode('This account is already linked to another sign-in provider.'), true, 302);
            exit();
        }

        if ($user) {
            $db->update(
                'users',
                [
                    'oauth_provider' => $provider,
                    'oauth_id' => $identity['oauthId'],
                    'email_verified' => 1,
                ],
                'id = :id',
                ['id' => $user['id']]
            );
            $user['oauth_provider'] = $provider;
            $user['oauth_id'] = $identity['oauthId'];
        }
    }

    if (!$user) {
        $firstName = trim($identity['firstName']);
        $lastName = trim($identity['lastName']);

        if ($firstName === '') {
            $firstName = substr($identity['email'], 0, strpos($identity['email'], '@'));
        }

        $passwordHash = password_hash(generateToken(32), PASSWORD_DEFAULT);
        $userId = $db->insert('users', [
            'email' => $identity['email'],
            'password_hash' => $passwordHash,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'name' => trim($firstName . ' ' . $lastName),
            'oauth_provider' => $provider,
            'oauth_id' => $identity['oauthId'],
            'provider' => $provider,
            'email_verified' => 1,
            'role' => 'user',
            'avatar_url' => $identity['avatar'],
            'avatar' => $identity['avatar'],
        ]);

        $teamId = $db->insert('teams', [
            'name' => "{$firstName}'s Team",
            'description' => 'Personal workspace',
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

        $isNewUser = true;
    }

    if (!$user['is_active']) {
        header('Location: ' . $frontendCallback . '?error=' . rawurlencode('This account is disabled. Please contact support.'), true, 302);
        exit();
    }

    $db->update('users', ['last_login' => date('Y-m-d H:i:s')], 'id = :id', ['id' => $user['id']]);

    $jwt = new JWTAuth();
    $token = $jwt->generateToken($user['id'], $user['email'], $user['role']);

    // The one-time handoff keeps the JWT out of the redirect URL.
    //
    // The code is a hash of the session itself, so the exchange endpoint
    // can recompute it from the cookie and compare — the browser never
    // holds anything that reveals the token.
    $userPayload = buildUserPayload($user);
    $handoffCode = hash('sha256', $token . '|' . $userPayload['id']);
    $handoffPayload = json_encode([
        'token' => $token,
        'user' => $userPayload,
        'isNewUser' => $isNewUser,
        'expiresAt' => time() + 120,
    ]);

    setcookie('project_eric_oauth_handoff', $handoffPayload, [
        'expires' => time() + 120,
        'path' => '/',
        'samesite' => 'Lax',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
    ]);

    recordAuditLog(
        $db,
        (int) $user['id'],
        $isNewUser ? 'OAUTH_REGISTER' : 'OAUTH_LOGIN',
        'auth',
        $provider
    );

    header('Location: ' . $frontendCallback . '?handoff=' . rawurlencode($handoffCode), true, 302);
    exit();
} catch (Throwable $e) {
    error_log('OAuth callback failed: ' . $e->getMessage());
    header('Location: ' . $frontendCallback . '?error=' . rawurlencode('The ' . $provider . ' sign-in could not be completed.'), true, 302);
    exit();
}
