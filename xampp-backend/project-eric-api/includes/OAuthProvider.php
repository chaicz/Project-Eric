<?php
/**
 * OAuth 2.0 provider helpers.
 *
 * The browser never receives a client secret and the API never trusts an
 * identity sent by the browser. The flow is the standard authorization
 * code exchange:
 *
 *   1. The browser is sent to Google or GitHub.
 *   2. The provider calls the callback URL with a one-time code.
 *   3. The API exchanges that code for an access token using its secret.
 *   4. The API asks the provider who owns the token and creates or links
 *      the Project Eric account from that verified response.
 *
 * Credentials come from the process environment so they never have to be
 * committed to the repository.
 */

function oauthEnv(string $name): string {
    $value = getenv($name);
    return is_string($value) ? trim($value) : '';
}

/**
 * The public configuration for one provider.
 *
 * `clientId` is safe to send to the browser. `clientSecret` stays on the
 * server and is never included in the returned array.
 */
function oauthProviderConfig(string $provider): ?array {
    switch ($provider) {
        case 'google':
            $clientId = oauthEnv('GOOGLE_CLIENT_ID');
            $clientSecret = oauthEnv('GOOGLE_CLIENT_SECRET');
            $authorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
            $tokenUrl = 'https://oauth2.googleapis.com/token';
            $scope = 'openid email profile';
            break;

        case 'github':
            $clientId = oauthEnv('GITHUB_CLIENT_ID');
            $clientSecret = oauthEnv('GITHUB_CLIENT_SECRET');
            $authorizeUrl = 'https://github.com/login/oauth/authorize';
            $tokenUrl = 'https://github.com/login/oauth/access_token';
            $scope = 'read:user user:email';
            break;

        default:
            return null;
    }

    if ($clientId === '' || $clientSecret === '') {
        return null;
    }

    return [
        'provider' => $provider,
        'clientId' => $clientId,
        'clientSecret' => $clientSecret,
        'authorizeUrl' => $authorizeUrl,
        'tokenUrl' => $tokenUrl,
        'scope' => $scope,
    ];
}

/**
 * The providers that can be used on this deployment.
 *
 * @return array<string, array<string, mixed>>
 */
function oauthConfiguredProviders(): array {
    $providers = [];

    foreach (['google', 'github'] as $provider) {
        $config = oauthProviderConfig($provider);
        if ($config !== null) {
            $providers[$provider] = $config;
        }
    }

    return $providers;
}

/**
 * The callback URL registered with the provider.
 *
 * It points at the API because the API performs the code exchange and
 * creates the session. The provider's redirect URI has to match this
 * value exactly.
 */
function oauthRedirectUri(string $provider): string {
    $baseUrl = getenv('PROJECT_ERIC_API_BASE_URL');
    if (!is_string($baseUrl) || trim($baseUrl) === '') {
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $baseUrl = 'http://' . $host;
    }

    return rtrim($baseUrl, '/') . '/project-eric-api/api/auth/oauth/' . $provider . '/callback';
}

/**
 * Build the provider authorization URL.
 *
 * A random state value is stored in a short-lived cookie. The callback
 * compares it with the one in the query string, which prevents another
 * site from feeding a forged authorization response to the browser.
 *
 * The preview flag is stored beside the state value in the same cookie.
 * Keeping it in the cookie means the callback learns about it only from
 * a request this server started, and it never travels through the
 * provider's URL.
 *
 * @param array $config
 * @param string $provider
 * @param bool $preview run the flow without writing to the database
 */
function oauthAuthorizationUrl(array $config, string $provider, bool $preview = false): string {
    $state = bin2hex(random_bytes(24));
    $cookieName = 'project_eric_oauth_state_' . $provider;

    setcookie($cookieName, json_encode([
        'state' => $state,
        'preview' => $preview,
    ]), [
        'expires' => time() + 600,
        'path' => '/',
        'samesite' => 'Lax',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
    ]);

    $params = [
        'client_id' => $config['clientId'],
        'redirect_uri' => oauthRedirectUri($provider),
        'response_type' => 'code',
        'scope' => $config['scope'],
        'state' => $state,
    ];

    if ($provider === 'google') {
        $params['access_type'] = 'online';
        $params['prompt'] = 'select_account';
    }

    return $config['authorizeUrl'] . '?' . http_build_query($params);
}

/**
 * Exchange the one-time authorization code for an access token.
 */
function oauthExchangeCode(array $config, string $code): string {
    $payload = http_build_query([
        'client_id' => $config['clientId'],
        'client_secret' => $config['clientSecret'],
        'code' => $code,
        'grant_type' => 'authorization_code',
        'redirect_uri' => oauthRedirectUri($config['provider']),
    ]);

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Accept: application/json',
                'Content-Type: application/x-www-form-urlencoded',
            ],
            'content' => $payload,
            'timeout' => 15,
            'ignore_errors' => true,
        ],
    ]);

    $response = @file_get_contents($config['tokenUrl'], false, $context);
    if ($response === false) {
        throw new RuntimeException('Could not reach the OAuth provider.');
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded) || empty($decoded['access_token'])) {
        throw new RuntimeException('The OAuth provider did not return an access token.');
    }

    return (string) $decoded['access_token'];
}

/**
 * Ask Google who owns the access token.
 */
function oauthFetchGoogleIdentity(string $accessToken): array {
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => [
                'Accept: application/json',
                'Authorization: Bearer ' . $accessToken,
            ],
            'timeout' => 15,
            'ignore_errors' => true,
        ],
    ]);

    $response = @file_get_contents('https://openidconnect.googleapis.com/v1/userinfo', false, $context);
    $decoded = json_decode((string) $response, true);

    if (!is_array($decoded) || empty($decoded['sub']) || empty($decoded['email'])) {
        throw new RuntimeException('Google did not return a verified account.');
    }

    $parts = preg_split('/\s+/', trim((string) ($decoded['name'] ?? '')), 2);

    return [
        'oauthId' => (string) $decoded['sub'],
        'email' => strtolower((string) $decoded['email']),
        'firstName' => $parts[0] ?? '',
        'lastName' => $parts[1] ?? '',
        'avatar' => isset($decoded['picture']) ? (string) $decoded['picture'] : null,
    ];
}

/**
 * Ask GitHub who owns the access token.
 *
 * GitHub keeps private email addresses private, so the email is taken
 * from the verified primary address endpoint when the public profile
 * does not include one.
 */
function oauthFetchGithubIdentity(string $accessToken): array {
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => [
                'Accept: application/vnd.github+json',
                'Authorization: Bearer ' . $accessToken,
                'X-GitHub-Api-Version: 2022-11-28',
            ],
            'timeout' => 15,
            'ignore_errors' => true,
        ],
    ]);

    $profileRaw = @file_get_contents('https://api.github.com/user', false, $context);
    $profile = json_decode((string) $profileRaw, true);

    if (!is_array($profile) || empty($profile['id'])) {
        throw new RuntimeException('GitHub did not return a verified account.');
    }

    $email = '';
    if (!empty($profile['email'])) {
        $email = strtolower((string) $profile['email']);
    } else {
        $emailsRaw = @file_get_contents('https://api.github.com/user/emails', false, $context);
        $emails = json_decode((string) $emailsRaw, true);
        if (is_array($emails)) {
            foreach ($emails as $entry) {
                if (!empty($entry['verified']) && !empty($entry['primary']) && !empty($entry['email'])) {
                    $email = strtolower((string) $entry['email']);
                    break;
                }
            }
        }
    }

    if ($email === '') {
        throw new RuntimeException('Your GitHub account does not expose a verified email address.');
    }

    $name = trim((string) ($profile['name'] ?? ''));
    if ($name === '') {
        $name = (string) ($profile['login'] ?? 'GitHub User');
    }
    $parts = preg_split('/\s+/', $name, 2);

    return [
        'oauthId' => (string) $profile['id'],
        'email' => $email,
        'firstName' => $parts[0] ?? '',
        'lastName' => $parts[1] ?? '',
        'avatar' => !empty($profile['avatar_url']) ? (string) $profile['avatar_url'] : null,
    ];
}

/**
 * Fetch the verified identity for either provider.
 */
function oauthFetchIdentity(string $provider, string $accessToken): array {
    if ($provider === 'google') {
        return oauthFetchGoogleIdentity($accessToken);
    }
    if ($provider === 'github') {
        return oauthFetchGithubIdentity($accessToken);
    }

    throw new RuntimeException('Unsupported OAuth provider.');
}

/**
 * Validate the state value returned by the provider.
 *
 * The state cookie also carries the preview flag, so the callback knows
 * whether the sign-in is allowed to write to the database. The flag is
 * only ever read from the cookie this server wrote — it is never taken
 * from the request.
 *
 * @return bool true when this is a preview sign-in
 */
function oauthValidateState(string $provider, string $receivedState): bool {
    $cookieName = 'project_eric_oauth_state_' . $provider;
    $cookieValue = $_COOKIE[$cookieName] ?? '';
    $expectedState = '';
    $preview = false;

    if ($cookieValue !== '') {
        $decoded = json_decode($cookieValue, true);
        if (is_array($decoded) && isset($decoded['state'])) {
            $expectedState = (string) $decoded['state'];
            $preview = !empty($decoded['preview']);
        } else {
            // A cookie written by an older version of the API holds the
            // bare state value.
            $expectedState = (string) $cookieValue;
        }
    }

    setcookie($cookieName, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'samesite' => 'Lax',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
    ]);

    if ($expectedState === '' || !hash_equals($expectedState, $receivedState)) {
        throw new RuntimeException('The sign-in request expired or could not be verified. Please try again.');
    }

    return $preview;
}
