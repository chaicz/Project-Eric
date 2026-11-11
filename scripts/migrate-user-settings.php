<?php
/**
 * Migration: add the `user_settings` table.
 *
 * The Settings page stores the account's preferences on the server so
 * they follow the account between machines. The table holds one JSON
 * document per account.
 *
 * The migration is idempotent: it checks whether the table exists
 * before creating it, so it can be run against a fresh install (where
 * setup.sql already created the table) and against an existing one.
 *
 *   & "D:\xampp\php\php.exe" scripts\migrate-user-settings.php
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

$exists = $pdo->query(
    "SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = " . $pdo->quote(DB_NAME) . " AND TABLE_NAME = 'user_settings'"
)->fetch()['c'];

if ((int) $exists > 0) {
    echo "user_settings already exists — nothing to do.\n";
    exit(0);
}

$pdo->exec(
    "CREATE TABLE user_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        settings JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_settings (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
);

echo "Created table user_settings.\n";
