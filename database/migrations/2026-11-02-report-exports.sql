-- ---------------------------------------------------------------------------
-- 2026-11-02 · report_exports
--
-- Adds the table that stores the generated PDF security reports.
--
-- The table is created with `IF NOT EXISTS`, so running this against a
-- database that was already set up with the latest `setup.sql` is a
-- no-op.
--
-- Why a table at all: the PDF report embeds the user's source code, so
-- the stored copy must be short-lived. Every row carries an
-- `expires_at`; the API deletes the row and the file on disk as soon as
-- that moment passes (24 hours after generation).
--
-- Apply with:
--   D:\xampp\mysql\bin\mysql.exe -u root < database\migrations\2026-11-02-report-exports.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS report_exports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token CHAR(64) NOT NULL,             -- public, unguessable handle used in the download URL
    file_name VARCHAR(255) NOT NULL,     -- original source file name
    stored_name VARCHAR(255) NOT NULL,   -- on-disk name
    title VARCHAR(255) NOT NULL,
    language VARCHAR(100),
    score INT,
    total_issues INT DEFAULT 0,
    size_bytes INT DEFAULT 0,
    expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_token (token),
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
