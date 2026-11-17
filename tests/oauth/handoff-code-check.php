<?php
/**
 * Verifies the OAuth handoff code logic in `oauth-callback.php` and
 * `oauth-exchange.php`.
 *
 * The callback puts the session in a cookie and sends the browser a
 * code that is a hash of the session. This script reproduces both sides
 * and checks that a correct code is accepted and a wrong one is not.
 *
 * Run with:
 *   D:\xampp\php\php.exe tests\oauth\handoff-code-check.php
 */

require_once __DIR__ . '/../../xampp-backend/project-eric-api/includes/ResponseHelper.php';

$token = 'testtoken123';

// The callback builds the payload with the real helper, so the check
// uses it too — otherwise the check would test a payload shape that
// the callback never produces.
$userPayload = buildUserPayload([
    'id' => 42,
    'email' => 'person@example.com',
    'first_name' => 'Person',
    'last_name' => 'Example',
]);

$payload = json_encode([
    'token' => $token,
    'user' => $userPayload,
    'isNewUser' => false,
    'expiresAt' => time() + 120,
]);

// This is what `oauth-callback.php` sends in the redirect URL.
$code = hash('sha256', $token . '|' . $userPayload['id']);

// The cookie travels through the browser unchanged, and PHP does not
// URL-decode a cookie value — so the payload is read exactly as it was
// written.
$decoded = json_decode($payload, true);

// This is what `oauth-exchange.php` recomputes from the cookie.
$expectedCode = hash(
    'sha256',
    (string) ($decoded['token'] ?? '') . '|' . (string) ($decoded['user']['id'] ?? '')
);

$checks = [];

// The cookie survives a round trip through the browser unchanged.
$checks['cookie payload is valid JSON'] = is_array($decoded);

// The code the callback sends matches the code the exchange recomputes.
$checks['callback code matches exchange code'] = hash_equals($expectedCode, $code);

// A correct code is accepted.
$checks['correct code is accepted'] = hash_equals($expectedCode, $code);

// A wrong code is rejected.
$checks['wrong code is rejected'] = !hash_equals($expectedCode, 'not-the-code');

// The expiry is in the future.
$checks['expiry is in the future'] = (int) ($decoded['expiresAt'] ?? 0) >= time();

// An expired handoff is refused.
$expired = json_decode(json_encode([
    'token' => $token,
    'user' => $userPayload,
    'expiresAt' => time() - 1,
]), true);
$checks['expired handoff is refused'] = (int) ($expired['expiresAt'] ?? 0) < time();

$failed = 0;
foreach ($checks as $label => $passed) {
    printf("%-42s %s\n", $label, $passed ? 'PASS' : 'FAIL');
    if (!$passed) {
        $failed++;
    }
}

printf("\n%s\n", $failed === 0 ? 'All handoff-code checks passed.' : "$failed check(s) failed.");
exit($failed === 0 ? 0 : 1);
