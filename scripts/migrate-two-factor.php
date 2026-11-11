<?php
/**
 * Migration: add the two-factor columns to `users`.
 *
 * The Settings page's "Two-Factor Authentication" card used to be a
 * badge that could not be acted on. These columns give the account
 * somewhere to keep its second factor.
 *
 * The migration is idempotent: it checks which columns exist before
 * adding the missing ones, so it can be run against a fresh install
 * (where setup.sql already created them) and against an existing one.
 *
 *   & "D:\xampp\php\php.exe" scripts\migrate-two-factor.php
 */

require_once __DIR__ . '/../xampp-backend/project-eric-api/config/config.php';

try {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "Could not connect to the database: " . $e->getMessage() . PHP_EOL);
    exit(1);
}

$existing = $pdo->query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = " . $pdo->quote(DB_NAME) . " AND TABLE_NAME = 'users'"
)->fetchAll(PDO::FETCH_COLUMN);

$wanted = [
    'two_factor_secret'        => 'VARCHAR(255) DEFAULT NULL',
    'two_factor_enabled'      => 'TINYINT(1) DEFAULT 0',
    'two_factor_enabled_at'   => 'TIMESTAMP NULL',
    'two_factor_recovery_codes' => 'JSON DEFAULT NULL',
];

$added = 0;

foreach ($wanted as $column => $definition) {
    if (in_array($column, $existing, true)) {
        continue;
    }
    $pdo->exec("ALTER TABLE users ADD COLUMN `{$column}` {$definition}");
    echo "Added column {$column}.\n";
    $added++;
}

if ($added === 0) {
    echo "The two-factor columns already exist — nothing to do.\n";
} else {
    echo "Added {$added} column(s).\n";
}
