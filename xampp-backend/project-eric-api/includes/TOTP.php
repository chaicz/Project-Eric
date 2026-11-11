<?php
/**
 * Time-based One-Time Password (TOTP, RFC 6238).
 *
 * The Settings page's "Two-Factor Authentication" card used to be a
 * badge that said "Not enabled" and could not be acted on — there was
 * no way to turn it on, no way to turn it off, and the account could
 * not be protected with a second factor.
 *
 * This class implements the algorithm an authenticator app (Google
 * Authenticator, Authy, 1Password, …) expects:
 *
 *   - a base32 shared secret
 *   - an HMAC-SHA1 one-time password over a 30-second time step
 *   - a six digit code
 *
 * It is written out rather than pulled from a package because the API
 * has no Composer dependencies, and the algorithm is small enough that
 * the whole thing is auditable in one file.
 *
 * The verification window accepts the neighbouring time steps as well,
 * so a phone whose clock is a little off still works.
 */
class TOTP {
    /** How many time steps either side of "now" are accepted. */
    const WINDOW = 1;

    /** The length of the generated code, in digits. */
    const DIGITS = 6;

    /** The length of the time step, in seconds. */
    const PERIOD = 30;

    /**
     * Generate a random base32 secret.
     *
     * 20 bytes is the size the reference implementations use, and it
     * keeps the secret at 32 base32 characters.
     *
     * @param int $bytes
     * @return string
     */
    public static function generateSecret(int $bytes = 20): string {
        return self::base32Encode(random_bytes($bytes));
    }

    /**
     * The `otpauth://` URI an authenticator app scans.
     *
     * @param string $secret
     * @param string $accountName  the email the code belongs to
     * @param string $issuer       the name shown in the app
     * @return string
     */
    public static function provisioningUri(string $secret, string $accountName, string $issuer = 'Project Eric'): string {
        return sprintf(
            'otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d',
            rawurlencode($issuer),
            rawurlencode($accountName),
            $secret,
            rawurlencode($issuer),
            self::DIGITS,
            self::PERIOD
        );
    }

    /**
     * The code for a given secret and time step.
     *
     * @param string $secret  the base32 secret
     * @param int|null $timestamp  the unix time; defaults to now
     * @return string  a zero-padded six digit code
     */
    public static function code(string $secret, ?int $timestamp = null): string {
        $timestamp = $timestamp === null ? time() : $timestamp;
        $counter = intdiv($timestamp, self::PERIOD);

        $key = self::base32Decode($secret);
        if ($key === false || $key === '') {
            return '';
        }

        // The counter is an 8 byte big-endian integer.
        $binaryCounter = pack('N2', 0, $counter);

        $hash = hash_hmac('sha1', $binaryCounter, $key, true);

        // Dynamic truncation (RFC 4226).
        $offset = ord($hash[strlen($hash) - 1]) & 0x0F;
        $binary = ((ord($hash[$offset]) & 0x7F) << 24)
            | ((ord($hash[$offset + 1]) & 0xFF) << 16)
            | ((ord($hash[$offset + 2]) & 0xFF) << 8)
            | (ord($hash[$offset + 3]) & 0xFF);

        $code = (string) ($binary % (10 ** self::DIGITS));

        return str_pad($code, self::DIGITS, '0', STR_PAD_LEFT);
    }

    /**
     * Check a code against a secret.
     *
     * The neighbouring time steps are accepted, so a phone whose clock
     * drifts does not lock the user out of their own account.
     *
     * @param string $secret
     * @param string $code
     * @param int|null $timestamp
     * @return bool
     */
    public static function verify(string $secret, string $code, ?int $timestamp = null): bool {
        $code = preg_replace('/\D/', '', (string) $code);
        if ($code === null || strlen($code) !== self::DIGITS) {
            return false;
        }

        $timestamp = $timestamp === null ? time() : $timestamp;

        for ($offset = -self::WINDOW; $offset <= self::WINDOW; $offset++) {
            $step = $timestamp + ($offset * self::PERIOD);
            if (hash_equals(self::code($secret, $step), $code)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Encode raw bytes as base32 (RFC 4648, no padding).
     *
     * @param string $bytes
     * @return string
     */
    public static function base32Encode(string $bytes): string {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $output = '';
        $buffer = 0;
        $bitsLeft = 0;

        for ($i = 0, $length = strlen($bytes); $i < $length; $i++) {
            $buffer = ($buffer << 8) | ord($bytes[$i]);
            $bitsLeft += 8;

            while ($bitsLeft >= 5) {
                $output .= $alphabet[($buffer >> ($bitsLeft - 5)) & 31];
                $bitsLeft -= 5;
            }
        }

        if ($bitsLeft > 0) {
            $output .= $alphabet[($buffer << (5 - $bitsLeft)) & 31];
        }

        return $output;
    }

    /**
     * Decode a base32 string back to raw bytes.
     *
     * The alphabet is case-insensitive and padding is optional, which
     * is how the authenticator apps write the secret.
     *
     * @param string $value
     * @return string|false
     */
    public static function base32Decode(string $value) {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $value = strtoupper(rtrim(trim($value), '='));
        $value = preg_replace('/\s+/', '', $value);

        $buffer = 0;
        $bitsLeft = 0;
        $output = '';

        for ($i = 0, $length = strlen($value); $i < $length; $i++) {
            $index = strpos($alphabet, $value[$i]);
            if ($index === false) {
                return false;
            }
            $buffer = ($buffer << 5) | $index;
            $bitsLeft += 5;

            if ($bitsLeft >= 8) {
                $output .= chr(($buffer >> ($bitsLeft - 8)) & 0xFF);
                $bitsLeft -= 8;
            }
        }

        return $output;
    }

    /**
     * The recovery codes shown once, when the second factor is turned
     * on.
     *
     * They are stored hashed, the same way a password is, so a leaked
     * database cannot be used to sign in.
     *
     * @param int $count
     * @return array{plain: string[], hashes: string[]}
     */
    public static function generateRecoveryCodes(int $count = 8): array {
        $plain = [];
        $hashes = [];

        for ($i = 0; $i < $count; $i++) {
            // 10 characters from an unambiguous alphabet.
            $code = '';
            $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            for ($c = 0; $c < 10; $c++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $plain[] = $code;
            $hashes[] = password_hash($code, PASSWORD_DEFAULT);
        }

        return ['plain' => $plain, 'hashes' => $hashes];
    }
}
