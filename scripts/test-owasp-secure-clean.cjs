// False-positive check for the web OWASP pack engine.
//
// The web engine (public/extensions/owasp-pack.json + the per-language
// *.lang.json files, loaded by src/utils/owaspPackLoader.js) was
// extended with PHP injection patterns, made case-insensitive and
// changed to collapse overlapping matches. The "secure" reference
// files must still scan clean.
//
// The loader is an ES module, so it is bundled to CommonJS with
// esbuild and the loader's `fetch('/extensions/...')` is stubbed to
// read straight from disk.
//
// Usage: node scripts/test-owasp-secure-clean.cjs

const fs = require('fs');
const path = require('path');
const esbuild = require(path.join(
  __dirname, '../extensions/project-eric-owasp/node_modules/esbuild'));

const ROOT = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT, 'public/extensions');
const BUNDLE = path.join(ROOT, 'logs', 'owasp-secure-bundle.cjs');

(async () => {
  // Stub the loader's fetch with a disk read.
  global.fetch = async (url) => {
    const name = String(url).split('/').pop();
    const file = path.join(EXT_DIR, name);
    if (!fs.existsSync(file)) return { ok: false, json: async () => null };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  fs.mkdirSync(path.dirname(BUNDLE), { recursive: true });
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src/utils/owaspPackLoader.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: BUNDLE,
    logLevel: 'error',
  });

  const loader = require(BUNDLE);

  // The hardened reference files that ship with the extension.
  const SECURE_DIRS = [
    path.join(ROOT, 'extensions/project-eric-owasp/examples/secure'),
    'C:\\Users\\Public\\project-eric-ide\\owasp-samples\\secure',
  ];

  const EXT_TO_LANG = {
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.py': 'python', '.pyw': 'python',
    '.sql': 'sql', '.java': 'java', '.php': 'php', '.go': 'go', '.rs': 'rust',
    '.rb': 'ruby', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
    '.cs': 'csharp', '.html': 'html', '.htm': 'html', '.css': 'css',
  };

  // Findings the web pack has no rule for, so they cannot appear here.
  const EXTENSION_ONLY = new Set([
    'GO-A02-001', 'RB-A03-001', 'TS-A03-001', 'HTML-A05-001',
  ]);

  // Documented false positives: a category-wide regex fires on a pattern
  // that is safe in context. Each entry lists the categories that are
  // expected to fire on that file, with the reason they are safe.
  const RESIDUALS = {
    'css-secure.css': {
      A05: 'the @import points at the Google Fonts CDN over HTTPS, which is the A02-004 fix.',
    },
    'php-secure.php': {
      A10: 'curl_init() is called on a URL that passed the host allowlist check.',
    },
    'rust-secure.rs': {
      A10: 'reqwest::get() is called on a URL that passed the host allowlist check.',
    },
  };

  let failures = 0;
  let checked = 0;

  for (const dir of SECURE_DIRS) {
    if (!fs.existsSync(dir)) continue;

    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;

      const language = EXT_TO_LANG[path.extname(full).toLowerCase()];
      if (!language) continue;

      const text = fs.readFileSync(full, 'utf8');
      const findings = await loader.analyse(text, language);
      const residuals = RESIDUALS[name] || {};
      const hits = findings.filter((f) => f.status !== 'pass');
      checked += 1;

      const unexpected = hits.filter((f) => !(f.id in residuals));
      const expected = hits.filter((f) => f.id in residuals);

      if (unexpected.length === 0) {
        const note = expected.length
          ? ` (${expected.length} documented residual${expected.length === 1 ? '' : 's'})`
          : '';
        console.log(`PASS  ${name} (${language}) — clean${note}`);
        continue;
      }

      console.log(`FAIL  ${name} (${language}) — ${unexpected.length} categor(y/ies) flagged`);
      for (const f of unexpected) {
        if (EXTENSION_ONLY.has(f.id)) continue;
        console.log(`        ${f.id} ${f.name} (${f.status}) — ${f.description}`);
        for (const e of f.evidence || []) {
          console.log(`          line ${e.line}: ${e.snippet}`);
        }
      }
      failures += 1;
    }
  }

  console.log(
    failures === 0
      ? `\nALL ${checked} SECURE FILES CLEAN`
      : `\n${failures} of ${checked} SECURE FILES FLAGGED`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
})();
