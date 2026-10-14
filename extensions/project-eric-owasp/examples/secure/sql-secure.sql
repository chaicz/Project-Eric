-- ---------------------------------------------------------------------------
-- Project Eric OWASP — SQL SECURE counterpart.
--
-- SQL is largely safe by virtue of the application passing parameters
-- through bind variables; the patterns below assume the application
-- validates identifiers against an allowlist before they reach the DB.
-- ---------------------------------------------------------------------------

-- parameterised query
PREPARE find_user_by_name (text) AS
  SELECT id, name, email
  FROM users
  WHERE name = $1;

EXECUTE find_user_by_name($1);

-- application-side allowlist the column name
PREPARE list_users_sorted (text) AS
  SELECT id, name, email
  FROM users
  ORDER BY CASE WHEN $1 = 'name'   THEN name
                WHEN $1 = 'email'  THEN email
                WHEN $1 = 'id'     THEN id::text
                ELSE name
           END;

EXECUTE list_users_sorted('email');

COMMENT ON TABLE users IS 'no plaintext credentials; password_hash bcrypt (cost 12)';
