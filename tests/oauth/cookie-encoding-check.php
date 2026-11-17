<?php
/**
 * Shows how a JSON payload is written into a `Set-Cookie` header, and
 * what PHP reads back from `$_COOKIE`.
 *
 * This matters for the OAuth handoff: the cookie carries the session,
 * so it has to survive the round trip through the browser exactly.
 */
$payload = json_encode(['token' => 'abc', 'user' => ['id' => 1]]);

echo "payload raw     : $payload\n";
echo "rawurlencode    : " . rawurlencode($payload) . "\n";
echo "urlencode       : " . urlencode($payload) . "\n";
echo "str_replace ' ' : " . str_replace(' ', '%20', $payload) . "\n";

/**
 * PHP's `setcookie()` runs the value through `urlencode()` before it
 * writes the header, unless the value is already encoded. This is the
 * form the browser receives.
 */
echo "\nsetcookie would write: project_eric_oauth_handoff=" . urlencode($payload) . "\n";

// And the value PHP hands to `$_COOKIE` is the raw, decoded value.
$decoded = urldecode(urlencode($payload));
echo "PHP reads back        : $decoded\n";
echo "json_decode works     : " . (is_array(json_decode($decoded, true)) ? 'YES' : 'NO') . "\n";
