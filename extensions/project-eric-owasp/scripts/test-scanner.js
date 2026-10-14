#!/usr/bin/env node
/**
 * Smoke test for the scanner. Runs a few sample code blocks through
 * `scanCode()` and verifies that the expected rules fire.
 *
 * Run with: `node scripts/test-scanner.js`
 */

const path = require('path');
const fs = require('node:fs');

// We can't require the .ts files directly without a transpiler, so the
// easiest check is to bundle with esbuild into a temp module and require it.

(async () => {
  const esbuild = require('esbuild');
  const outFile = path.join(__dirname, '..', 'out-test', 'test-bundle.cjs');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'test-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    external: ['vscode'],
    logLevel: 'error',
  });

  const mod = require(outFile);
  const { scanCode } = mod;

  const pack = require(path.join(__dirname, '..', 'data', 'owasp-pack.json'));
  const languages = pack.languages;
  for (const lang of languages) {
    pack.languages[pack.languages.indexOf(lang)] = lang;
  }

  const cases = [
    {
      label: 'JS — eval with user input',
      language: 'javascript',
      text: `const user = req.query.x; eval(user);`,
      expect: ['A03-004'],
    },
    {
      label: 'JS — Math.random for token',
      language: 'javascript',
      text: `const token = Math.random().toString(36);`,
      expect: ['JS-A02-001'],
    },
    {
      label: 'Python — pickle.loads',
      language: 'python',
      text: `import pickle; data = pickle.loads(blob)`,
      expect: ['A08-001'],
    },
    {
      label: 'Python — shell=True',
      language: 'python',
      text: `subprocess.run(f"ls {path}", shell=True)`,
      expect: ['PY-A03-001'],
    },
    {
      label: 'Java — MD5 digest',
      language: 'java',
      text: `MessageDigest md = MessageDigest.getInstance("MD5");`,
      expect: ['A02-001', 'JAVA-A02-001'],
    },
    {
      label: 'PHP — echo $_GET',
      language: 'php',
      text: `<?php echo $_GET["name"]; ?>`,
      expect: ['PHP-A03-001'],
    },
    {
      label: 'Go — math/rand',
      language: 'go',
      text: `import "math/rand"; rand.Read(buf)`,
      expect: ['GO-A02-001'],
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    const result = scanCode({
      uri: 'file:///test',
      language: c.language,
      text: c.text,
      pack,
    });
    const fired = new Set(result.findings.map((f) => f.ruleId));
    const missing = c.expect.filter((id) => !fired.has(id));
    if (missing.length === 0) {
      console.log(`  ✓ ${c.label} — fired ${fired.size} rule(s)`);
      passed++;
    } else {
      console.error(`  ✗ ${c.label}`);
      console.error(`    Expected to find: ${c.expect.join(', ')}`);
      console.error(`    Actually fired  : ${Array.from(fired).join(', ') || '(none)'}`);
      console.error(`    Missing          : ${missing.join(', ')}`);
      failed++;
    }
  }

  console.log('');
  console.log(`${passed} passed · ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();