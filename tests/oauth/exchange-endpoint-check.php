<?php
/**
 * Sends a real handoff to the exchange endpoint over HTTP.
 *
 * The cookie carries the session and the body carries the one-time
 * code, exactly the way the browser does it after the provider sends
 * the person back. The point is to check the whole path: the cookie is
 * read, the code is recomputed, and the session is returned.
 *
 * Run with:
 *   D:\xampp\php\php.exe tests\oauth\exchange-endpoint-check.php
 */

require_once __DIR__ . '/../../xampp-backend/project-eric-api/includes/ResponseHelper.php';

$apiBase = getenv('PROJECT_ERIC_API_BASE_URL') ?: 'http://localhost/project-eric-api/api';
$exchangeUrl = $apiBase . '/auth/oauth/exchange';

$token = 'testtoken123';

$userPayload = buildUserPayload([
    'id' => 42,
    'email' => 'person@example.com',
    'first_name' => 'Person',
    'last_name' => 'Example',
]);

$cookiePayload = json_encode([
    'token' => $token,
    'user' => $userPayload,
    'isNewUser' => false,
    'expiresAt' => time() + 120,
]);

$code = hash('sha256', $token . '|' . $userPayload['id']);

/**
 * Send the request with a raw `Cookie` header.
 *
 * A cookie jar cannot be used here: PHP does not URL-decode a cookie
 * value, and every cookie jar percent-encodes the value it writes.
 */
function postWithCookie(string $url, string $cookieValue, string $body): array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Content-Type: application/json',
                'Origin: http://localhost:5173',
                'Cookie: project_eric_oauth_handoff=' . $cookieValue,
            ],
            'content' => $body,
            'timeout' => 15,
            'ignore_errors' => true,
        ],
    ]);

    $response = @file_get_contents($url, false, $context);
    $decoded = json_decode((string) $response, true);

    return is_array($decoded) ? $decoded : [];
}

$checks = [];

// A correct code returns the session.
$result = postWithCookie(
    $exchangeUrl,
    $cookiePayload,
    json_encode(['code' => $code])
);
$checks['correct code returns a session'] = !empty($result['success'])
    && ($result['data']['token'] ?? '') === $token;
$checks['correct code returns the user'] = ($result['data']['user']['email'] ?? '') === 'person@example.com';

// A wrong code is refused.
$result = postWithCookie(
    $exchangeUrl,
    $cookiePayload,
    json_encode(['code' => 'not-the-code'])
);
$checks['wrong code is refused'] = empty($result['success']);

// A missing code is refused.
$result = postWithCookie($exchangeUrl, $cookiePayload, json_encode([]));
$checks['missing code is refused'] = empty($result['success']);

// An expired handoff is refused.
$expiredPayload = json_encode([
    'token' => $token,
    'user' => $userPayload,
    'expiresAt' => time() - 1,
]);
$result = postWithCookie(
    $exchangeUrl,
    $expiredPayload,
    json_encode(['code' => hash('sha256', $token . '|' . $userPayload['id'])])
);
$checks['expired handoff is refused'] = empty($result['success']);

$failed = 0;
foreach ($checks as $label => $passed) {
    printf("%-42s %s\n", $label, $passed ? 'PASS' : 'FAIL');
    if (!$passed) {
        $failed++;
    }
}

printf("\n%s\n", $failed === 0 ? 'All exchange endpoint checks passed.' : "$failed check(s) failed.");
exit($failed === 0 ? 0 : 1);
