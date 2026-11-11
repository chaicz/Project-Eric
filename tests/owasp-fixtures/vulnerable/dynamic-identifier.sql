-- A03: the ORDER BY column is glued into the statement, so a caller can
-- inject a sub-select instead of naming a column.
SELECT id, name FROM accounts
WHERE tenant = 42
ORDER BY ' || (SELECT password FROM users WHERE id = 7) || ';
