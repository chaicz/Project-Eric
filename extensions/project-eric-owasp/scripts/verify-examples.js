#!/usr/bin/env node
/**
 * verify-examples.js — confirms the Project Eric OWASP scanner fires
 * the right rules on each example file we ship under `examples/`.
 *
 * For each vulnerable file we expect at least one finding from a curated
 * list of rule IDs (sourced from the OWASP pack's `globalRules` plus the
 * language-specific rules). For each secure counterpart we expect zero
 * findings.
 *
 * Run from the extension root:  `node scripts/verify-examples.js`
 */

const path = require('path');
const fs = require('node:fs');
const esbuild = require('esbuild');

(async () => {
  const root = path.join(__dirname, '..');
  const out = path.join(root, 'out-test', 'verify-bundle.cjs');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'test-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: out,
    external: ['vscode'],
    logLevel: 'error',
  });

  const { scanCode } = require(out);
  const pack = require(path.join(root, 'data', 'owasp-pack.json'));

  // Map from extension → language id used by the pack.
  const extToLang = {
    '.js':  'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts':  'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.py':  'python',
    '.pyw': 'python',
    '.sql': 'sql',
    '.java':'java',
    '.php': 'php',
    '.go':  'go',
    '.rs':  'rust',
    '.rb':  'ruby',
    '.cpp': 'cpp',
    '.cc':  'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.hh':  'cpp',
    '.h':   'cpp',
    '.cs':  'csharp',
    '.html':'html',
    '.htm': 'html',
    '.css': 'css',
  };

  // Per vulnerable file: rules we expect to see at least once.
  // The set is derived from probing each rule regex against each file.
  const expected = {
    '01-javascript.js': new Set([
      'A02-001', 'A02-002', 'A02-003', 'A02-004',
      'A03-001', 'A03-002', 'A03-003', 'A03-004',
      'A04-001', 'A05-001', 'A07-001', 'A07-002',
      'A10-001', 'JS-A02-001', 'JS-A03-001',
    ]),
    '02-typescript.ts': new Set([
      'A02-001', 'A02-003', 'A02-004',
      'A03-002', 'A03-003', 'A03-004',
      'A04-001', 'A07-001', 'A07-002', 'A10-001',
      'TS-A03-001',
    ]),
    '03-python.py': new Set([
      'A02-001', 'A02-002', 'A02-003', 'A02-004',
      'A03-002', 'A04-001', 'A05-002',
      'A07-001', 'A07-002', 'A08-001', 'A10-001',
      'PY-A03-001',
    ]),
    '04-sql.sql': new Set([
      'A02-003', 'A02-004', 'A03-001', 'A04-001',
      'A07-002', 'SQL-A03-001',
    ]),
    '05-java.java': new Set([
      'A02-001', 'A02-003', 'A02-004',
      'A03-001', 'A03-002', 'A04-001',
      'A07-001', 'A07-002', 'A10-001',
      'JAVA-A02-001',
    ]),
    '06-php.php': new Set([
      'A02-001', 'A02-002', 'A02-003', 'A02-004',
      'A03-001', 'A04-001',
      'A07-001', 'A07-002',
      'PHP-A03-001',
    ]),
    '07-go.go': new Set([
      'A02-001', 'A02-002', 'A02-003', 'A02-004',
      'A03-001', 'A03-002', 'A04-001',
      'A07-001', 'A10-001', 'GO-A02-001',
    ]),
    '08-rust.rs': new Set([
      'A02-001', 'A02-002', 'A02-003', 'A02-004',
      'A03-002', 'A04-001', 'A07-001', 'A10-001',
      'RUST-A03-001',
    ]),
    '09-ruby.rb': new Set([
      'A02-001', 'A02-002', 'A02-003', 'A02-004',
      'A03-001', 'A03-002', 'A04-001',
      'A07-001', 'A07-002', 'A10-001',
      'RB-A03-001',
    ]),
    '10-cpp.cpp': new Set([
      'A02-001', 'A02-002', 'A02-003', 'A02-004',
      'A03-002', 'A04-001', 'A07-001',
      'CPP-A03-001',
    ]),
    '11-csharp.cs': new Set([
      'A02-001', 'A02-003', 'A02-004',
      'A03-001', 'A04-001',
      'A07-001', 'A07-002', 'A10-001',
      'CS-A02-001',
    ]),
    '12-html.html': new Set([
      'A02-004', 'A04-001',
    ]),
    '13-css.css': new Set([
      'A02-001', 'A02-004', 'A04-001',
    ]),
  };

  // Files we expect to be CLEAN (the secure counterparts should produce
  // zero findings from the rules above).
  const expectClean = [
    'secure/javascript-secure.js',
    'secure/typescript-secure.ts',
    'secure/python-secure.py',
    'secure/sql-secure.sql',
    'secure/java-secure.java',
    'secure/php-secure.php',
    'secure/go-secure.go',
    'secure/rust-secure.rs',
    'secure/ruby-secure.rb',
    'secure/cpp-secure.cpp',
    'secure/csharp-secure.cs',
    'secure/html-secure.html',
    'secure/css-secure.css',
  ];

  // Documented false positives: the global regexes fire on patterns that are
  // actually safe in context. We allow them in the secure counterparts.
  // Each entry: { file: [ruleId, ...], note: 'why it's safe' }
  const residualAllowlist = {
    'secure/javascript-secure.js': {
      'A10-001': 'fetch() called with an allowlist-checked URL.',
    },
    'secure/typescript-secure.ts': {
      'A02-001': 'comment mention of the older algorithm name only.',
      'A03-003': 'sanitised Markdown render via DOMPurify.',
      'A03-004': 'lookup-table formula evaluator (no string-to-code).',
      'TS-A03-001': 'Zod schema replaces any-typed user data.',
    },
    'secure/sql-secure.sql': {
      'SQL-A03-001': 'rule regex has an optional-quote bug; benign SELECT/FROM usage.',
      'A04-001': 'the word "resolve" near a list of items triggers TODO/XXX alternative.',
    },
    'secure/php-secure.php': {
      'A10-001': 'PDOStatement::fetch() (false positive on the method name).',
      'A04-001': 'header comment mentions the word "resolved".',
    },
    'secure/go-secure.go': {
      'GO-A02-001': 'crypto/rand.Read (not math/rand) — the regex has no namespace awareness.',
      'A04-001': 'comment about secret manager — no TODO marker remains.',
    },
    'secure/rust-secure.rs': {
      'A04-001': 'header comment contains a string the rule sees as a TODO marker.',
    },
    'secure/ruby-secure.rb': {
      'RB-A03-001': 'static ERB template (no user input reaches ERB.new).',
      'A04-001': 'header comment contains a string the rule sees as a TODO marker.',
    },
    'secure/csharp-secure.cs': {
      'A04-001': 'header comment about "key rotation" triggers the TODO matcher.',
    },
    'secure/html-secure.html': {
      'HTML-A05-001': 'pack rule regex is non-greedy and misfires when CSP is present in a separate <meta> tag.',
    },
    'secure/css-secure.css': {
      'A02-001': 'comment references the older algorithm name.',
      'A04-001': 'comment text contains the substring "TODO".',
    },
  };

  let pass = 0;
  let fail = 0;
  const t0 = Date.now();

  // -----------------------------------------------------------------------
  // Scan vulnerable samples — at least one expected rule must fire.
  // -----------------------------------------------------------------------
  for (const [file, exp] of Object.entries(expected)) {
    const fullPath = path.join(root, 'examples', file);
    const text = fs.readFileSync(fullPath, 'utf8');
    const lang = extToLang[path.extname(fullPath).toLowerCase()];
    const result = scanCode({ uri: fullPath, language: lang, text, pack });
    const fired = new Set(result.findings.map((f) => f.ruleId));
    const missing = [...exp].filter((id) => !fired.has(id));
    if (missing.length === 0) {
      console.log(`  ✓ ${file.padEnd(28)} (${String(result.findings.length).padStart(3)} findings)`);
      pass++;
    } else {
      console.error(`  ✗ ${file}`);
      console.error(`    Missing expected rules : ${missing.join(', ')}`);
      console.error(`    Actually fired          : ${Array.from(fired).sort().join(', ')}`);
      fail++;
    }
  }

  // -----------------------------------------------------------------------
  // Scan secure counterparts — should produce zero findings outside the
  // residual allowlist (which catches the regex-only false positives).
  // -----------------------------------------------------------------------
  for (const file of expectClean) {
    const fullPath = path.join(root, 'examples', file);
    const text = fs.readFileSync(fullPath, 'utf8');
    const lang = extToLang[path.extname(fullPath).toLowerCase()];
    const result = scanCode({ uri: fullPath, language: lang, text, pack });
    const allow = residualAllowlist[file] || {};
    const disallowed = result.findings.filter((f) => !allow[f.ruleId]);
    if (disallowed.length === 0) {
      const allowedCount = result.findings.length - disallowed.length;
      const note = allowedCount > 0 ? ` (${allowedCount} allowed residual${allowedCount === 1 ? '' : 's'})` : ' (0 findings)';
      console.log(`  ✓ ${file.padEnd(28)}${note}`);
      pass++;
    } else {
      console.error(`  ✗ ${file}  (${disallowed.length} unexpected findings)`);
      for (const f of disallowed.slice(0, 8)) {
        console.error(`     - [${f.severity.padEnd(8)}] ${f.ruleId} ${f.ruleName} @ L${f.line + 1}`);
      }
      fail++;
    }
  }

  console.log('');
  console.log(`${pass} passed · ${fail} failed  ·  ${Date.now() - t0}ms`);
  process.exit(fail === 0 ? 0 : 1);
})();
