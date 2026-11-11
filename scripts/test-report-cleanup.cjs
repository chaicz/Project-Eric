// Remove the throwaway accounts the report tests created, together with
// their stored reports.
//
// Usage: node scripts/test-report-cleanup.cjs

const { execFileSync } = require('child_process');

const MYSQL = 'D:\\xampp\\mysql\\bin\\mysql.exe';

const sql = (query) =>
  execFileSync(
    MYSQL,
    ['-u', 'root', '-e', `SET time_zone = '+00:00'; USE project_eric; ${query}`],
    { encoding: 'utf8' }
  );

const PATTERNS = [
  'report-test-%',
  'expiry-test-%',
  'expiry2-%',
  'ui-report-%',
  'orphan-%',
];

/**
 * Read a single value out of the mysql client's output.
 *
 * The client prints a header row before the value, so the last
 * non-empty line is the one to read.
 */
const count = (query) => {
  const lines = sql(query)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1];
};

for (const pattern of PATTERNS) {
  const before = count(`SELECT COUNT(*) FROM users WHERE email LIKE '${pattern}';`);

  // The report rows go first so the files can be unlinked, then the
  // accounts themselves.
  sql(
    `DELETE r FROM report_exports r ` +
    `JOIN users u ON u.id = r.user_id WHERE u.email LIKE '${pattern}';`
  );
  sql(`DELETE FROM users WHERE email LIKE '${pattern}';`);

  console.log(`removed ${before} account(s) matching ${pattern}`);
}

const left = count('SELECT COUNT(*) FROM report_exports;');
console.log('report rows left:', left);
