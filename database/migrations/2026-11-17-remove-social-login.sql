-- ---------------------------------------------------------------------------
-- 2026-11-17 · remove_social_login
--
-- Removes the Google and GitHub account-login connection from Project Eric.
-- Accounts now authenticate with email and password only.
--
-- This migration is safe for both old and fresh databases:
--   • If the OAuth index exists, it is dropped first (MySQL cannot drop an
--     index while a column that participates in it still exists).
--   • Each OAuth column is dropped only when it exists.
--   • The old provider-specific demo accounts are deleted only when their
--     provider is still one of the removed social providers.
--
-- Apply with:
--   D:\xampp\mysql\bin\mysql.exe -u root < database\migrations\2026-11-17-remove-social-login.sql
-- ---------------------------------------------------------------------------

SET @index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'idx_oauth'
);

SET @drop_index_sql = IF(
    @index_exists > 0,
    'DROP INDEX idx_oauth ON users',
    'SELECT 1'
);
PREPARE drop_oauth_index FROM @drop_index_sql;
EXECUTE drop_oauth_index;
DEALLOCATE PREPARE drop_oauth_index;

SET @oauth_provider_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'oauth_provider'
);
SET @drop_oauth_provider_sql = IF(
    @oauth_provider_exists > 0,
    'ALTER TABLE users DROP COLUMN oauth_provider',
    'SELECT 1'
);
PREPARE drop_oauth_provider FROM @drop_oauth_provider_sql;
EXECUTE drop_oauth_provider;
DEALLOCATE PREPARE drop_oauth_provider;

SET @oauth_id_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'oauth_id'
);
SET @drop_oauth_id_sql = IF(
    @oauth_id_exists > 0,
    'ALTER TABLE users DROP COLUMN oauth_id',
    'SELECT 1'
);
PREPARE drop_oauth_id FROM @drop_oauth_id_sql;
EXECUTE drop_oauth_id;
DEALLOCATE PREPARE drop_oauth_id;

DELETE FROM users
WHERE provider IN ('google', 'github')
   OR email IN ('developer@gmail.com', 'developer@github.com');
