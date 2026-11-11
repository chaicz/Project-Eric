<?php
/**
 * Reset the two-factor state of an account.
 *
 * The end-to-end walkthrough turns the second factor on for the demo
 * account and turns it off again afterwards. If a run is interrupted
 * in the middle, the account would be left locked behind a code that
 * only the test knows, so this puts it back.
 *
 *   & "D:\xampp\php\php.exe" scripts\reset-two-factor.php [email]
 */

require_once __DIR__ . '/../xampp-backend/project-eric-api/config/config.php';

$email = $argv[1] ?? 'demo@project-eric.com';

try {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $stmt = $pdo->prepare(
        'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL,
         two_factor_recovery_codes = NULL, two_factor_enabled_at = NULL
         WHERE email = ?'
    );
    $stmt->execute([$email]);

    // The update reports zero rows when the account was already in this
    // state, so the account is looked up separately.
    $check = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
    $check->execute([$email]);

    echo ((int) $check->fetchColumn() > 0)
        ? "Reset the two-factor state of {$email}.\n"
        : "No account with the email {$email}.\n";
} catch (PDOException $e) {
    fwrite(STDERR, 'Could not reset the two-factor state: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
