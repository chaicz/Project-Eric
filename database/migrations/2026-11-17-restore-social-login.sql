-- ---------------------------------------------------------------------------
-- 2026-11-17 · restore_social_login
--
-- Adds the Google and GitHub sign-in link back to Project Eric. This is
-- the counterpart of `2026-11-17-remove-social-login.sql`, which took the
-- columns away again when social login was dropped.
--
-- The columns store the link between a Project Eric account and the
-- account the person already has at the provider:
--
--   oauth_provider  'google' or 'github' — which provider owns the identity
--   oauth_id        the identifier that provider gave the person
--
-- The pair is unique, so one provider identity can never be attached to
-- two Project Eric accounts. Both columns are NULL for accounts that
-- sign in with a password only, and MySQL treats several NULL rows as
-- distinct in a unique index, so those accounts are unaffected.
--
-- This migration is safe for both old and fresh databases: each column
-- is added only when it is missing, and the unique index is created only
-- when it is missing too.
--
-- Apply with:
--   D:\xampp\mysql\bin\mysql.exe -u root < database\migrations\2026-11-17-restore-social-login.sql
-- ---------------------------------------------------------------------------

SET @oauth_provider_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'oauth_provider'
);

SET @add_oauth_provider_sql = IF(
    @oauth_provider_exists > 0,
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50) DEFAULT NULL AFTER provider'
);
PREPARE add_oauth_provider FROM @add_oauth_provider_sql;
EXECUTE add_oauth_provider;
DEALLOCATE PREPARE add_oauth_provider;

SET @oauth_id_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'oauth_id'
);

SET @add_oauth_id_sql = IF(
    @oauth_id_exists > 0,
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN oauth_id VARCHAR(255) DEFAULT NULL AFTER oauth_provider'
);
PREPARE add_oauth_id FROM @add_oauth_id_sql;
EXECUTE add_oauth_id;
DEALLOCATE PREPARE add_oauth_id;

-- The unique index goes on last: it can only be created once both
-- columns are present.
SET @oauth_index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'idx_oauth'
);

SET @add_oauth_index_sql = IF(
    @oauth_index_exists > 0,
    'SELECT 1',
    'CREATE UNIQUE INDEX idx_oauth ON users (oauth_provider, oauth_id)'
);
PREPARE add_oauth_index FROM @add_oauth_index_sql;
EXECUTE add_oauth_index;
DEALLOCATE PREPARE add_oauth_index;
