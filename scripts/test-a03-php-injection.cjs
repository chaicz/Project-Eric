// Regression check for the A03 detector's dotted-concatenation patterns.
//
// The web scanner used to report a PHP file containing textbook SQL
// injection as a clean scan, because the injection patterns only
// understood JavaScript-style `+` concatenation.
const fs = require('fs');

const sqlConcatDotted = /(["'])\s*(?:SELECT|INSERT|UPDATE|DELETE)\b(?:(?!\1).)*\1\s*\.\s*(?:\$[a-zA-Z_]\w*|@[a-zA-Z_]\w*|#\{)/gi;
const sqlExecDotted = /\b(?:mysqli_query|mysql_query|pg_query|DB::(?:select|statement|unprepared)|->(?:query|exec|execute|raw))\s*\([^)]*?\.\s*\$/g;

const count = (code, re) => {
  re.lastIndex = 0;
  return (code.match(re) || []).length;
};

const cases = [
  {
    name: 'PHP file with a dotted-concatenated SQL query',
    file: 'logs/test-upload-orders.php',
    expect: 1,
  },
];

// The scanner's own built-in PHP sample.
const src = fs.readFileSync('src/pages/OWASPScanner.jsx', 'utf8');
const start = src.indexOf('  php: `');
const bodyStart = src.indexOf('`', start) + 1;
const bodyEnd = src.indexOf('`', bodyStart);
cases.push({
  name: "the scanner's own PHP sample",
  code: src.slice(bodyStart, bodyEnd),
  expect: 1,
});

// A safe parameterised query must NOT be flagged.
cases.push({
  name: 'a safe parameterised query',
  code: '$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");\n$stmt->execute([$id]);',
  expect: 0,
});

let failed = 0;
for (const c of cases) {
  const code = c.code ?? fs.readFileSync(c.file, 'utf8');
  const hits = count(code, sqlConcatDotted) + count(code, sqlExecDotted);
  const ok = hits >= c.expect;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: ${hits} hit(s), expected at least ${c.expect}`);
  if (!ok) {
    for (const line of code.split('\n')) {
      if (/SELECT|mysqli_query|DB::select/i.test(line)) console.log('      ', line.trim());
    }
  }
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
