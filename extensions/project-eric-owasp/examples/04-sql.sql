-- ---------------------------------------------------------------------------
-- Project Eric OWASP — SQL sample (intentionally vulnerable)
--
-- SAFE COUNTERPART: ./secure/sql-secure.sql
-- ---------------------------------------------------------------------------

-- A02-003 — hard-coded credential sentinel that the scanner regex picks up:
--   api_key = 'production-api-key-aaaa-bbbb-1234567890'
-- lives here.

-- A03-001 — SQL string concatenation
-- The application builds this query in code and ships it here as text.
SELECT id, name, email
FROM users
WHERE name = 'given-name-here' + :user_supplied_input;
--            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
--        Intentional unsafe pattern. Never concatenate user input into SQL.

-- A03-001 — dynamic ORDER BY (column name from user input)
-- ORDER BY does not accept bind parameters in most engines, so the column
-- name has to be validated against an allowlist before it lands here.
SELECT id, name, email
FROM users
ORDER BY 'injected-column-name-here';

-- A03-002 — exec() / sp_executesql driven by string concat
-- (SQL Server): equivalent to command/exec injection for stored procedures.
EXEC('SELECT * FROM users WHERE id = ' + :user_id);

-- A04-001 — TODO marker
-- TODO: replace the legacy "credit_cards" table before the PCI audit.

-- A02-003 — credentials stored next to data. (The literal here is what
-- the scanner regex matches — `password = 'plaintext-not-hashed-123456'`)
CREATE TABLE app_secrets (
  id        SERIAL PRIMARY KEY,
  api_key   TEXT NOT NULL,
  password  TEXT NOT NULL
);

-- A02-004 — insecure HTTP link surfaced inside a query result.
INSERT INTO api_endpoints (name, url) VALUES
  ('legacy-docs', 'http://legacy.svc.local:8080/docs');
--                          ^ starts the URL right after the opening quote.

-- Inline A02-004 sentinels — the scanner matches anywhere an `http://`
-- address is quoted and not localhost.
-- password = 'http://docs.internal/api'
