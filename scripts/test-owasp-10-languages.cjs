/* eslint-disable no-console */
/**
 * OWASP engine correctness test — 10 languages, 10 distinct vulnerabilities.
 *
 * Three independent engines ship in this repo and all three are exercised:
 *
 *   A. the web scanner page's built-in detectors
 *      (src/pages/OWASPScanner.jsx → runDetectors)
 *   B. the web OWASP pack analyser
 *      (src/utils/owaspPackLoader.js → analyse, reads public/extensions/*.json)
 *   C. the VS Code / code-server extension scanner
 *      (extensions/project-eric-owasp/src/scanner/scanner.ts → scanCode,
 *       reads extensions/project-eric-owasp/data/owasp-pack.json)
 *
 * Each fixture exists twice: a `vulnerable` copy that must raise its target
 * OWASP category, and a `safe` copy of the same program that must not.
 *
 * Usage: node scripts/test-owasp-10-languages.cjs
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'owasp-fixtures');
const PUBLIC_EXT = path.join(ROOT, 'public', 'extensions');
const EXT_DATA = path.join(ROOT, 'extensions', 'project-eric-owasp', 'data');
const REPORT_DIR = path.join(ROOT, 'reports');

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const green = (s) => `\u001b[32m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const dim = (s) => `\u001b[90m${s}\u001b[0m`;
const bold = (s) => `\u001b[1m${s}\u001b[0m`;

// ---------------------------------------------------------------------------
// Ground truth
//
// target      – the OWASP category the vulnerability genuinely belongs to
// engines     – the engines that are documented to cover this rule family
// (the remaining engines are still reported, but a miss there is a coverage
//  gap rather than a broken fixture)
// residuals   – findings a safe fixture is *expected* to raise, because a
// regex scanner cannot prove the mitigation is present:
//
//   · `safe/jwt-none.ts` contains a JWT sign-in but no rate-limit hint,
//     so the built-in A04 heuristic warns about it.
//   · `safe/unwrap-panic.rs` has an Actix route with `{id}` and a
//     `web::Path<(u64,)>` parameter. The ownership check is written in a
//     different shape than the rule's negative lookahead looks for, so
//     A01 still fires.
//
// Both are in a *different category* from the fixture's target, so they
// never mask a missed detection. A residual in the target category, or a
// residual that is not listed here, is a genuine false positive and
// fails the test.
// ---------------------------------------------------------------------------
const RESIDUALS = {
  'jwt-none': { 'web-builtin': ['A04'] },
  'unwrap-panic': { 'web-pack': ['A01'] },
};

const CASES = [
  {
    id: 'dom-xss',
    lang: 'javascript',
    ext: 'js',
    mode: 'code',
    target: 'A03',
    flaw: 'DOM XSS — request data assigned to innerHTML',
    engines: ['web-builtin', 'web-pack', 'extension'],
  },
  {
    id: 'jwt-none',
    lang: 'typescript',
    mode: 'code',
    target: 'A07',
    flaw: 'JWT signed with algorithm "none" (forgeable token)',
    engines: ['web-builtin', 'web-pack'],
  },
  {
    id: 'pickle-loads',
    lang: 'python',
    mode: 'code',
    target: 'A08',
    flaw: 'pickle.loads() on untrusted bytes',
    engines: ['web-pack', 'extension'],
  },
  {
    id: 'md5-digest',
    lang: 'java',
    mode: 'code',
    target: 'A02',
    flaw: 'MessageDigest.getInstance("MD5") for password hashing',
    engines: ['web-pack', 'extension'],
  },
  {
    id: 'command-injection',
    lang: 'go',
    mode: 'code',
    target: 'A03',
    flaw: 'exec.Command with a shell string built from input',
    engines: ['web-pack', 'extension'],
  },
  {
    id: 'sql-injection',
    lang: 'csharp',
    mode: 'code',
    target: 'A03',
    flaw: 'SqlCommand built by string concatenation',
    engines: ['web-builtin', 'extension'],
  },
  {
    id: 'shell-interpolation',
    lang: 'ruby',
    mode: 'code',
    target: 'A03',
    flaw: 'Backtick shell command interpolating params[:dir]',
    engines: ['web-pack', 'extension'],
  },
  {
    id: 'unwrap-panic',
    lang: 'rust',
    mode: 'code',
    target: 'A04',
    flaw: 'unwrap() on user-supplied id → panic (insecure design)',
    engines: ['extension'],
  },
  {
    id: 'idor-laravel',
    lang: 'php',
    mode: 'code',
    target: 'A01',
    flaw: 'Laravel route with {id} and no authorisation check',
    engines: ['web-pack', 'extension'],
  },
  {
    id: 'dynamic-identifier',
    lang: 'sql',
    mode: 'sql',
    target: 'A03',
    flaw: 'Dynamic SQL identifier built by concatenation',
    engines: ['web-builtin', 'web-pack', 'extension'],
  },
];

// ---------------------------------------------------------------------------
// Engine A — the built-in detectors (src/utils/owaspDetectors.js)
//
// The detectors used to live inside the scanner page. They were moved
// into their own module, so they are bundled here instead of being
// sliced out of the JSX by matching marker strings — that approach broke
// the moment the file was reorganised.
// ---------------------------------------------------------------------------
const buildBuiltinEngine = async () => {
  const outfile = path.join(REPORT_DIR, '.tmp-owasp-builtin-engine.cjs');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'utils', 'owaspDetectors.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  const mod = require(outfile);

  return async (code, mode) => {
    const findings = await mod.runDetectors(code, mode || 'code', 'javascript');
    return findings.map((f) => ({
      id: f.id,
      count: f.count,
      status: f.status,
      severity: f.severity,
      evidence: (f.evidence || []).map((e) => ({ line: e.line, snippet: e.snippet })),
    }));
  };
};

// ---------------------------------------------------------------------------
// Engine B — the web OWASP pack analyser (public/extensions/*.json)
// ---------------------------------------------------------------------------
const buildWebPackEngine = async () => {
  const outfile = path.join(REPORT_DIR, '.tmp-owasp-pack-engine.cjs');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'utils', 'owaspPackLoader.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  const mod = require(outfile);

  // the loader fetches "/extensions/<file>" — serve them off disk instead
  global.fetch = async (url) => {
    const rel = String(url).replace(/^\/extensions\//, '');
    const file = path.join(PUBLIC_EXT, rel);
    if (!fs.existsSync(file)) return { ok: false, json: async () => null };
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
  };

  return async (code, lang) => {
    mod._resetCache();
    const findings = await mod.analyse(code, lang);
    return findings.map((f) => ({
      id: f.id,
      count: f.count,
      status: f.status,
      severity: f.severity,
      evidence: (f.evidence || []).map((e) => ({ line: e.line, snippet: e.snippet })),
    }));
  };
};

// ---------------------------------------------------------------------------
// Engine C — the extension scanner (data/owasp-pack.json)
// ---------------------------------------------------------------------------
const buildExtensionEngine = async () => {
  const outfile = path.join(REPORT_DIR, '.tmp-owasp-extension-engine.cjs');
  // scanner.ts and packLoader.ts have to be bundled together: the pack cache
  // lives in the packLoader module instance, so two separate bundles would
  // leave the scanner looking at an empty cache.
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

  const packJson = fs.readFileSync(path.join(EXT_DATA, 'owasp-pack.json'), 'utf8');
  const pack = scanner.parsePack(packJson);

  // Load the per-language packs the same way the extension does at
  // activation (`loadPacks()` in src/extension.ts): each
  // `data/languages/<id>.lang.json` replaces the stub entry the
  // manifest carries. Without this step the manifest alone only holds
  // a stub per language, so most language rules never run and the
  // extension appears to miss vulnerabilities it really catches.
  const langDir = path.join(EXT_DATA, 'languages');
  let fromFile = 0;
  let inline = 0;
  for (const lang of pack.languages) {
    const file = path.join(langDir, `${lang.id}.lang.json`);
    if (!fs.existsSync(file)) {
      if ((lang.rules || []).length) inline++;
      continue;
    }
    const parsed = scanner.parseLanguagePack(fs.readFileSync(file, 'utf8'));
    const idx = pack.languages.findIndex((l) => l.id === lang.id);
    if (idx >= 0) pack.languages[idx] = parsed;
    fromFile++;
  }
  scanner.ingestPack(pack);

  const totalRules =
    pack.globalRules.length +
    pack.languages.reduce((n, l) => n + ((l.rules || []).length), 0);
  console.log(
    dim(`  extension pack: ${pack.globalRules.length} global rules + ` +
      `${pack.languages.length} languages (${fromFile} from files, ${inline} inline) ` +
      `= ${totalRules} rules`)
  );

  return (code, lang) => {
    const result = scanner.scanCode({
      uri: `fixture.${lang}`,
      language: lang,
      text: code,
      minSeverity: 'low',
      skipCategories: [],
    });
    const grouped = new Map();
    for (const f of result.findings) {
      if (!grouped.has(f.category)) {
        grouped.set(f.category, { id: f.category, count: 0, status: 'warning', severity: f.severity, evidence: [], rules: [] });
      }
      const g = grouped.get(f.category);
      g.count += 1;
      if (!g.rules.includes(f.ruleId)) g.rules.push(f.ruleId);
      if (g.evidence.length < 8) {
        g.evidence.push({
          line: f.line + 1, // extension lines are 0-based
          snippet: (f.matchText || '').slice(0, 220),
          rule: f.ruleId,
        });
      }
    }
    for (const g of grouped.values()) {
      if (g.count >= 2) g.status = 'fail';
    }
    return [...grouped.values()];
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EXT_BY_LANG = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  go: 'go',
  csharp: 'cs',
  ruby: 'rb',
  rust: 'rs',
  php: 'php',
  sql: 'sql',
};

const readFixture = (kind, name) => fs.readFileSync(path.join(FIXTURES, kind, name), 'utf8');

const summarise = (findings) => {
  const flagged = findings.filter((f) => f.count > 0);
  const map = {};
  for (const f of flagged) map[f.id] = f.count;
  return { map, flagged };
};

const engineNames = ['web-builtin', 'web-pack', 'extension'];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const builtin = await buildBuiltinEngine();
  const webPack = await buildWebPackEngine();
  const extension = await buildExtensionEngine();

  const results = [];
  let failures = 0;

  console.log('\nOWASP engine correctness — 10 languages / 10 vulnerability types\n');

  for (const c of CASES) {
    const vulnCode = readFixture('vulnerable', `${c.id}.${c.ext || EXT_BY_LANG[c.lang]}`);
    const safeCode = readFixture('safe', `${c.id}.${c.ext || EXT_BY_LANG[c.lang]}`);

    const perEngine = {};
    for (const name of engineNames) {
      const run = name === 'web-builtin' ? builtin : name === 'web-pack' ? webPack : extension;
      const vulnFindings = await run(vulnCode, c.lang, c.mode);
      const safeFindings = await run(safeCode, c.lang, c.mode);
      perEngine[name] = {
        vuln: summarise(vulnFindings),
        safe: summarise(safeFindings),
        vulnFindings,
        safeFindings,
      };
    }

    // ---- verdicts -------------------------------------------------------
    //
    // A finding on the safe fixture is a false positive unless it is a
    // documented residual (see RESIDUALS above). A residual in the
    // fixture's *target* category would mask a missed detection, so it
    // always counts as a false positive.
    const detected = [];
    const missed = [];
    const falsePositives = [];
    const documentedResiduals = [];

    for (const name of engineNames) {
      const e = perEngine[name];
      const hit = (e.vuln.map[c.target] || 0) > 0;
      if (hit) detected.push(name);
      else missed.push(name);

      const allowed = (RESIDUALS[c.id] || {})[name] || [];
      for (const category of Object.keys(e.safe.map)) {
        if (category === c.target) {
          // Same category as the vulnerability — always a false positive.
          falsePositives.push(`${name}:${category}`);
        } else if (allowed.includes(category)) {
          documentedResiduals.push(`${name}:${category}`);
        } else {
          falsePositives.push(`${name}:${category}`);
        }
      }
    }

    const expectedCoverage = c.engines;
    const coverageGap = expectedCoverage.filter((n) => !detected.includes(n));
    const unexpectedMiss = missed.filter((n) => !expectedCoverage.includes(n));

    const ok =
      detected.length > 0 && coverageGap.length === 0 && falsePositives.length === 0;
    if (!ok) failures += 1;

    results.push({
      id: c.id,
      lang: c.lang,
      target: c.target,
      flaw: c.flaw,
      expectedCoverage,
      detected,
      missed,
      coverageGap,
      unexpectedMiss,
      falsePositives,
      documentedResiduals,
      perEngine: Object.fromEntries(
        Object.entries(perEngine).map(([n, e]) => [n, { vuln: e.vuln.map, safe: e.safe.map }]),
      ),
    });

    // ---- console report -------------------------------------------------
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(20)} ${c.lang.padEnd(11)} ${c.target}  ${c.flaw}`);
    for (const name of engineNames) {
      const e = perEngine[name];
      const vulnStr = JSON.stringify(e.vuln.map);
      const safeStr = JSON.stringify(e.safe.map);
      const flag = e.vuln.map[c.target] ? 'detected ' : 'MISSED   ';
      console.log(
        `        ${name.padEnd(12)} ${flag} target=${c.target} vuln=${vulnStr.padEnd(46)} safe=${safeStr}`,
      );
    }
    if (coverageGap.length) console.log(`        ! coverage gap in: ${coverageGap.join(', ')}`);
    if (falsePositives.length) console.log(`        ! false positive: ${falsePositives.join(', ')}`);
    if (documentedResiduals.length) {
      console.log(`        ~ documented residual: ${documentedResiduals.join(', ')}`);
    }
    console.log('');
  }

  // ---- summary ---------------------------------------------------------
  console.log('summary');
  console.log('-------');
  for (const name of engineNames) {
    const rows = results.filter((r) => r.perEngine[name]);
    const hits = rows.filter((r) => (r.perEngine[name].vuln[r.target] || 0) > 0).length;
    // A false positive is any category raised on a safe fixture that is
    // not a documented residual.
    const fps = rows.reduce((n, r) => {
      const allowed = (RESIDUALS[r.id] || {})[name] || [];
      return n + Object.keys(r.perEngine[name].safe).filter(
        (cat) => cat !== r.target && !allowed.includes(cat)
      ).length;
    }, 0);
    const residuals = rows.reduce(
      (n, r) => n + ((RESIDUALS[r.id] || {})[name] || []).length, 0
    );
    console.log(
      `  ${name.padEnd(12)} detected ${String(hits).padStart(2)}/${rows.length} targets, ` +
      `${fps} false positive(s), ${residuals} documented residual(s)`,
    );
  }
  console.log(`\n${results.length - failures}/${results.length} fixtures behaved as expected`);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'owasp-10-language-test.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log('report: reports/owasp-10-language-test.json');

  process.exitCode = failures === 0 ? 0 : 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
