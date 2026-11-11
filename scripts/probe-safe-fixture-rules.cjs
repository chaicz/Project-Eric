/**
 * Probe which rules fire on the "safe" fixtures.
 *
 * Some safe fixtures legitimately trip a rule: a route with `{id}` in the
 * path looks like broken access control to a regex scanner even when the
 * handler checks ownership. This prints the exact rule ids so the
 * expected behaviour can be documented rather than guessed at.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'owasp-fixtures');
const EXT_DATA = path.join(ROOT, 'extensions', 'project-eric-owasp', 'data');

const TARGETS = [
  ['safe/jwt-none.ts', 'typescript'],
  ['safe/unwrap-panic.rs', 'rust'],
  ['vulnerable/command-injection.go', 'go'],
  ['vulnerable/shell-interpolation.rb', 'ruby'],
  ['vulnerable/idor-laravel.php', 'php'],
  ['vulnerable/jwt-none.ts', 'typescript'],
];

(async () => {
  const outfile = path.join(ROOT, 'reports', '.tmp-probe-safe.cjs');
  await esbuild.build({
    stdin: {
      contents: "export * from './scanner'; export * from './packLoader';",
      resolveDir: path.join(ROOT, 'extensions', 'project-eric-owasp', 'src', 'scanner'),
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  const scanner = require(outfile);
  const pack = scanner.parsePack(
    fs.readFileSync(path.join(EXT_DATA, 'owasp-pack.json'), 'utf8')
  );
  scanner.ingestPack(pack);

  for (const [rel, lang] of TARGETS) {
    const code = fs.readFileSync(path.join(FIXTURES, rel), 'utf8');
    const result = scanner.scanCode({
      uri: rel,
      language: lang,
      text: code,
      minSeverity: 'low',
      skipCategories: [],
    });
    console.log(`\n--- ${rel} (${lang}) ---`);
    if (!result.findings.length) {
      console.log('   (no findings)');
    }
    for (const f of result.findings) {
      console.log(
        `   ${f.category}  ${f.ruleId}  ${f.severity}  line ${f.line + 1}  ${(f.matchText || '').slice(0, 70)}`
      );
    }
  }
})();
