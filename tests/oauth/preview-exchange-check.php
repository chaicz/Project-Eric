<?php
/**
 * Sends a real preview handoff to the exchange endpoint over HTTP.
 *
 * A preview sign-in never creates an account, so there is no handoff
 * code and no session token: the callback leaves the verified identity
 * in the preview cookie instead. The point of this check is to prove
 * that the exchange endpoint hands that identity back as a local
 * session, with no token and no database write.
 *
 * Run with:
 *   D:\xampp\php\php.exe tests\oauth\preview-exchange-check.php
 */

require_once __DIR__ . '/../../xampp-backend/project-eric-api/includes/ResponseHelper.php';

$apiBase = getenv('PROJECT_ERIC_API_BASE_URL') ?: 'http://localhost/project-eric-api/api';
$exchangeUrl = $apiBase . '/auth/oauth/exchange';

$previewUser = [
    'id' => null,
    'email' => 'preview@example.com',
    'name' => 'Preview Person',
    'firstName' => 'Preview',
    'lastName' => 'Person',
    'role' => 'preview',
    'avatar' => 'https://example.com/avatar.png',
    'experience' => 'mid',
    'languages' => [],
    'securityFocus' => [],
    'onboardingComplete' => true,
    'provider' => 'google',
];

$previewPayload = json_encode([
    'user' => $previewUser,
    'provider' => 'google',
    'expiresAt' => time() + 3600,
]);

/**
 * Send the request with a raw `Cookie` header.
 *
 * A cookie jar cannot be used here: PHP does not URL-decode a cookie
 * value, and every cookie jar percent-encodes the value it writes.
 */
function postPreviewWithCookie(string $url, string $cookieValue, string $body): array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Content-Type: application/json',
                'Origin: http://localhost:5173',
                'Cookie: project_eric_oauth_preview=' . $cookieValue,
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

// The preview cookie is answered with the identity and no token.
$result = postPreviewWithCookie($exchangeUrl, $previewPayload, json_encode(['code' => '']));
$data = $result['data'] ?? [];

$checks['preview cookie returns a session'] = !empty($result['success']);
$checks['preview session carries the identity'] = ($data['user']['email'] ?? '') === 'preview@example.com';
$checks['preview session has no token'] = !isset($data['token']) || $data['token'] === null;
$checks['preview session is flagged'] = !empty($data['isPreview']);
$checks['preview session names the provider'] = ($data['provider'] ?? '') === 'google';
$checks['preview user has the preview role'] = ($data['user']['role'] ?? '') === 'preview';

// An expired preview cookie is refused.
$expiredPayload = json_encode([
    'user' => $previewUser,
    'provider' => 'google',
    'expiresAt' => time() - 1,
]);
$result = postPreviewWithCookie($exchangeUrl, $expiredPayload, json_encode(['code' => '']));
$checks['expired preview is refused'] = empty($result['success']);

// With neither cookie nor code the endpoint refuses the request.
$result = postPreviewWithCookie($exchangeUrl, '', json_encode(['code' => '']));
$checks['missing preview is refused'] = empty($result['success']);

$failed = 0;
foreach ($checks as $label => $passed) {
    printf("%-42s %s\n", $label, $passed ? 'PASS' : 'FAIL');
    if (!$passed) {
        $failed++;
    }
}

printf("\n%s\n", $failed === 0 ? 'All preview exchange checks passed.' : "$failed check(s) failed.");
exit($failed === 0 ? 0 : 1);
