<?php
/**
 * Check the TOTP implementation against the RFC 6238 test vectors.
 *
 * RFC 6238 uses the ASCII string "12345678901234567890" as the shared
 * secret, which is the base32 of "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ".
 * The reference codes are for SHA-1.
 *
 *   & "D:\xampp\php\php.exe" scripts\test-totp.php
 */

require_once __DIR__ . '/../xampp-backend/project-eric-api/includes/TOTP.php';

$secret = TOTP::base32Encode('12345678901234567890');

$vectors = [
    59        => '287082',
    1111111109 => '081804',
    1111111111 => '050471',
    1234567890 => '005924',
    2000000000 => '279037',
];

$failed = 0;

foreach ($vectors as $timestamp => $expected) {
    $actual = TOTP::code($secret, $timestamp);
    $ok = $actual === $expected;
    if (!$ok) {
        $failed++;
    }
    printf(
        "%s  t=%-11s expected=%s actual=%s\n",
        $ok ? 'PASS' : 'FAIL',
        $timestamp,
        $expected,
        $actual
    );
}

// The base32 round trip.
$roundTrip = TOTP::base32Decode($secret);
$ok = $roundTrip === '12345678901234567890';
if (!$ok) {
    $failed++;
}
printf("%s  base32 round trip\n", $ok ? 'PASS' : 'FAIL');

// Verification accepts the neighbouring time step and rejects a wrong code.
$ok = TOTP::verify($secret, TOTP::code($secret, time() - 30)) === true;
if (!$ok) {
    $failed++;
}
printf("%s  verify accepts the previous step\n", $ok ? 'PASS' : 'FAIL');

$ok = TOTP::verify($secret, '000000') === false;
if (!$ok) {
    $failed++;
}
printf("%s  verify rejects a wrong code\n", $ok ? 'PASS' : 'FAIL');

$ok = TOTP::verify($secret, '12ab') === false;
if (!$ok) {
    $failed++;
}
printf("%s  verify rejects a malformed code\n", $ok ? 'PASS' : 'FAIL');

echo $failed === 0 ? "\nAll TOTP checks passed.\n" : "\n{$failed} check(s) failed.\n";
exit($failed === 0 ? 0 : 1);
