-- The sort column comes from a fixed allowlist and the value is bound.
SELECT id, name FROM accounts
WHERE tenant = ?
ORDER BY created_at DESC;
