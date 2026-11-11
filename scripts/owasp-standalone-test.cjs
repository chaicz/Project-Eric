// Exercises the standalone ProjectEric.scan() bundle that ships inside
// code-server (dist/project-eric-scanner.js). This is the exact file the
// standalone scanner webview loads via <script src=...>.
const path = require('path');
const fs = require('fs');

const EXT = path.join(
  process.env.LOCALAPPDATA,
  'code-server',
  'Data',
  'extensions',
  'project-eric.project-eric-owasp-0.1.0',
);

const bundlePath = path.join(EXT, 'dist', 'project-eric-scanner.js');
const src = fs.readFileSync(bundlePath, 'utf8');

// Evaluate the bundle in a sandbox with a fake window so it installs
// globalThis.ProjectEric exactly like a <script> tag would.
const vm = require('vm');
const sandbox = { window: {}, console, setTimeout, clearTimeout, Date, Math, JSON, RegExp };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: bundlePath });

const eric = sandbox.ProjectEric || sandbox.window.ProjectEric;
if (!eric) {
  console.error('FAIL: ProjectEric was not installed on the global object');
  process.exit(1);
}

let failures = 0;
const check = (name, cond, extra = '') => {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  [${ok ? 'OK  ' : 'FAIL'}] ${name}${extra ? ' :: ' + extra : ''}`);
};

console.log('=== standalone bundle loaded ===');
console.log('  hasPack      :', eric.hasPack());
console.log('  languages    :', eric.languages().length, '->', eric.languages().join(', '));
console.log('  api keys     :', Object.keys(eric).join(', '));

// ---------------------------------------------------------------------------
console.log('\n=== 1. scan() basic vulnerable JS ===');
const vulnerableJs = `
app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM users WHERE id = '" + id + "'", (e, rows) => res.json(rows));
});
const apiKey = "sk_live_abcdef1234567890";
const md5 = require('md5');
const hashed = md5(password);
fetch(req.query.url).then(r => r.text()).then(t => res.send(t));
eval(req.body.code);
`;
const r1 = eric.scan(vulnerableJs, 'javascript');
console.log('  language   :', r1.language);
console.log('  findings   :', r1.findings.length);
console.log('  durationMs :', r1.durationMs);
console.log('  lineCount  :', r1.lineCount);
const cats1 = [...new Set(r1.findings.map(f => f.category))].sort();
console.log('  categories :', cats1.join(', '));
check('scan returns findings', r1.findings.length > 0, `${r1.findings.length} findings`);
check('scan returns a language', r1.language === 'javascript');
check('findings have severity', r1.findings.every(f => !!f.severity));
check('findings have ruleId', r1.findings.every(f => !!f.ruleId));
check('findings have line numbers', r1.findings.every(f => typeof f.line === 'number' && f.line > 0));
check('detects SQL injection', cats1.includes('A03'));
check('detects crypto issues', cats1.includes('A02'));

// ---------------------------------------------------------------------------
console.log('\n=== 2. score() grading ===');
const s1 = eric.score(r1);
console.log('  score :', s1.score, 'grade:', s1.grade, 'counts:', JSON.stringify(s1.counts));
check('score is numeric', typeof s1.score === 'number');
check('score within 0-100', s1.score >= 0 && s1.score <= 100);
check('grade assigned', !!s1.grade);

// ---------------------------------------------------------------------------
console.log('\n=== 3. clean code scores better than vulnerable code ===');
const cleanJs = `
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
app.post('/login', async (req, res) => {
  const user = await db.users.findOne({ email: req.body.email });
  if (!user) return res.status(401).json({ error: 'invalid' });
  const ok = await bcrypt.compare(req.body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid' });
  const token = randomBytes(32).toString('hex');
  res.json({ token });
});
`;
const rClean = eric.scan(cleanJs, 'javascript');
const sClean = eric.score(rClean);
console.log('  clean  :', sClean.score, sClean.grade, JSON.stringify(sClean.counts));
console.log('  vulner :', s1.score, s1.grade);
check('clean code scores higher', sClean.score > s1.score, `${sClean.score} > ${s1.score}`);

// ---------------------------------------------------------------------------
console.log('\n=== 4. language coverage ===');
const samples = {
  python: 'import os\npassword = "hunter2supersecret"\nos.system("ls " + user_input)\neval(user_input)\n',
  sql: 'SELECT * FROM users WHERE id = \'\' + id + \'\';\nDROP TABLE users;\n',
  java: 'class A { void f(String q){ Runtime.getRuntime().exec(q); } }\n',
  php: '<?php $x = $_GET["id"]; mysql_query("SELECT * FROM t WHERE id=".$x); ?>',
  go: 'package main\nimport "os/exec"\nfunc f(s string){ exec.Command("sh", "-c", s) }\n',
  html: '<html><script>document.write(location.hash)</script><input></html>',
  typescript: 'const q = `SELECT * FROM t WHERE id = ${id}`;\neval(userInput);\n',
};
for (const [lang, code] of Object.entries(samples)) {
  const r = eric.scan(code, lang);
  const s = eric.score(r);
  console.log(
    `  ${lang.padEnd(11)} findings=${String(r.findings.length).padStart(3)}  score=${String(s.score).padStart(3)}  grade=${s.grade}  cats=${[...new Set(r.findings.map(f => f.category))].sort().join(',') || '-'}`,
  );
  check(`${lang} scan returns a result`, r && typeof r.findings.length === 'number');
}

// ---------------------------------------------------------------------------
console.log('\n=== 5. inferLanguageForCode() ===');
const inferred = [
  ['python', 'def foo():\n    import os\n'],
  ['javascript', 'const x = 1; function bar(){}'],
  ['sql', 'SELECT id FROM users'],
  ['java', 'package com.x; class A { }'],
  ['php', '<?php echo "hi"; ?>'],
  ['go', 'package main\nfunc main(){}'],
  ['rust', 'fn main() { }'],
  ['html', '<html><body class="x">hi</body></html>'],
  ['css', '.btn { color: red; }'],
  ['typescript', 'interface User { id: number }'],
  ['csharp', 'using System;\nnamespace App { }'],
  ['cpp', '#include <stdio.h>\nint main() { return 0; }'],
  ['ruby', "require 'json'\nclass Foo < Bar\nend"],
];
for (const [expected, code] of inferred) {
  const got = eric.inferLanguageForCode(code);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  [${ok ? 'OK  ' : 'FAIL'}] infer ${expected.padEnd(11)} -> ${got}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 6. scanMcp() ===');
// The canonical MCP sample from the extension's own smoke test — it uses
// the args.dir / server.tool(name, {}, handler) shapes the MCP rules
// are written against.
const mcpCode = `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "demo", version: "0.0.1" });
server.tool("run", {}, async () => {
  return child_process.exec("ls " + args.dir);
});
`;
const rMcp = eric.scanMcp(mcpCode);
console.log('  language :', rMcp.language);
console.log('  findings :', rMcp.findings.length);
console.log('  cats     :', [...new Set(rMcp.findings.map(f => f.category))].sort().join(', '));
check('scanMcp detects mcp language or falls back', !!rMcp.language);
check('scanMcp returns findings', rMcp.findings.length > 0);

// ---------------------------------------------------------------------------
console.log('\n=== 7. skipCategories + minSeverity options ===');
const rSkip = eric.scan(vulnerableJs, { language: 'javascript', skipCategories: ['A03'] });
const catsSkip = [...new Set(rSkip.findings.map(f => f.category))];
console.log('  categories when A03 skipped:', catsSkip.join(', '));
check('skipCategories removes A03', !catsSkip.includes('A03'));

const rMin = eric.scan(vulnerableJs, { language: 'javascript', minSeverity: 'critical' });
const sevs = [...new Set(rMin.findings.map(f => f.severity))];
console.log('  severities when minSeverity=critical:', sevs.join(', '));
check('minSeverity filters lower severities', sevs.every(s => s === 'critical'), sevs.join(','));

// ---------------------------------------------------------------------------
console.log('\n=== 8. scoreMany() workspace aggregate ===');
const many = eric.scoreMany([r1, rClean, rMcp]);
console.log('  keys:', Object.keys(many).join(', '));
console.log('  score:', many.score ?? JSON.stringify(many).slice(0, 200));
check('scoreMany returns an object', many && typeof many === 'object');

// ---------------------------------------------------------------------------
console.log('\n=== 9. edge cases (must never throw) ===');
const edges = [
  ['empty string', ''],
  ['whitespace', '   \n\n  '],
  ['null', null],
  ['undefined', undefined],
  ['non-string number', 12345],
  ['huge input', 'a=1;\n'.repeat(20000)],
  ['binary-ish', '\u0000\u0001\u0002'],
  ['unicode', 'const 密码 = "🔐"; eval(密码);'],
];
for (const [label, val] of edges) {
  try {
    const r = eric.scan(val, 'javascript');
    check(`handles ${label}`, r && Array.isArray(r.findings));
  } catch (e) {
    failures++;
    console.log(`  [FAIL] handles ${label} :: threw ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== 10. scan() without a language argument (auto-detect) ===');
const rAuto = eric.scan(vulnerableJs);
console.log('  detected language:', rAuto.language, ' findings:', rAuto.findings.length);
check('auto-detects a language', !!rAuto.language);

console.log('\n============================================');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
console.log('============================================');
process.exit(failures === 0 ? 0 : 1);
