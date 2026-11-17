#!/usr/bin/env node
// ---------------------------------------------------------------------------
// OWASP Hard Mode — test harness
//
// Runs every hard-mode fixture through the real engine and checks three
// things:
//
//   1. The vulnerable sample trips the category it targets, and the
//      category's status is `fail` (not merely `warning`).
//   2. The hardened sample produces no `fail` in that category.
//   3. Hard mode finds at least as much as standard mode — the whole
//      point of the profile is that it is stricter, so it must never be
//      quieter.
//
// Usage:
//   node tests/owasp-hard-mode/run-hard-mode-tests.cjs
//   node tests/owasp-hard-mode/run-hard-mode-tests.cjs --verbose
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const VERBOSE = process.argv.includes('--verbose');

/**
 * Import a module by absolute path.
 *
 * On Windows a bare absolute path is parsed as a URL with the `d:`
 * scheme, which Node's ESM loader rejects. `pathToFileURL` turns the
 * path into a proper `file://` URL.
 */
const importModule = (absPath) => import(pathToFileURL(absPath).href);

// The engine modules are ES modules under src/. Import them directly.
const { loadOwaspPack, loadLanguage } = await importModule(
  path.join(ROOT, 'src', 'utils', 'owaspPackLoader.js')
);
const { buildHardPack } = await importModule(
  path.join(ROOT, 'src', 'utils', 'owaspHardMode', 'hardPack.js')
);
const { analyseWithProfile, summarise } = await importModule(
  path.join(ROOT, 'src', 'utils', 'owaspHardMode', 'hardAnalyser.js')
);
const { FIXTURES } = await importModule(path.join(__dirname, 'fixtures.js'));

// ---------------------------------------------------------------------------
// A tiny fetch shim so the loader can read the packs off disk.
// The loader fetches `${BASE}/owasp-pack.json` with BASE = '/extensions'.
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  const name = String(url).replace(/^\/extensions\//, '').replace(/\?.*$/, '');
  const file = path.join(ROOT, 'public', 'extensions', name);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, json: async () => null };
  }
  const text = fs.readFileSync(file, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

const check = (ok, label, detail = '') => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return ok;
};

const section = (title) => {
  console.log(`\n${title}`);
  console.log('-'.repeat(Math.max(20, title.length)));
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('OWASP Hard Mode — test harness');
console.log(`root: ${ROOT}`);

const basePack = await loadOwaspPack();
if (!basePack) {
  console.error('Could not load the base OWASP pack. Aborting.');
  process.exit(1);
}

const hardPack = buildHardPack(basePack, 'hard');
const langCache = new Map();

const loadLang = async (id) => {
  if (!langCache.has(id)) langCache.set(id, await loadLanguage(id));
  return langCache.get(id);
};

const runScan = async (code, language, pack, profile) => {
  const langPack = await loadLang(language);
  const findings = await analyseWithProfile(code, pack, langPack, profile);
  return { findings, stats: summarise(findings) };
};

// ---------------------------------------------------------------------------

section('1. Hard pack construction');
{
  check(
    basePack.categories.length === 10,
    'base pack has 10 OWASP categories',
    `${basePack.categories.length}`,
  );

  const hardCategoryCount = hardPack.categories.length;
  check(
    hardCategoryCount === 10,
    'hard pack keeps all 10 categories',
    `${hardCategoryCount}`,
  );

  check(
    hardPack.id !== basePack.id,
    'hard pack has its own id',
    hardPack.id,
  );

  check(
    basePack.categories.every((c) => !c.hardRules),
    'base pack is not mutated',
    'no hardRules on base categories',
  );

  const withHardRules = hardPack.categories.filter((c) => (c.hardRules || []).length > 0);
  check(
    withHardRules.length >= 8,
    'hard rules cover at least 8 categories',
    `${withHardRules.length} categories`,
  );

  const totalHardRules = hardPack.categories.reduce(
    (sum, c) => sum + (c.hardRules || []).length,
    0,
  );
  check(totalHardRules >= 18, 'hard tier ships at least 18 rules', `${totalHardRules}`);

  // Every hard rule pattern must compile as a JavaScript RegExp.
  let badPatterns = 0;
  for (const cat of hardPack.categories) {
    for (const key of Object.keys(cat.patterns || {})) {
      for (const p of cat.patterns[key]) {
        try {
          new RegExp(p.regex, p.flags || 'g');
        } catch {
          badPatterns++;
          console.log(`        invalid regex in ${cat.id}/${key}: ${p.regex.slice(0, 70)}`);
        }
      }
    }
  }
  check(badPatterns === 0, 'every hard-mode pattern compiles', `${badPatterns} invalid`);
}

// ---------------------------------------------------------------------------

section('2. Vulnerable fixtures trip their category');
for (const fixture of FIXTURES) {
  const { findings } = await runScan(fixture.vulnerable, fixture.language, hardPack, 'hard');
  const finding = findings.find((f) => f.id === fixture.category);

  const detected = !!finding && finding.status === 'fail';
  check(
    detected,
    `${fixture.id} (${fixture.category}) fails in hard mode`,
    finding
      ? `status=${finding.status} count=${finding.count} score=${finding.score} severity=${finding.severity}`
      : 'category not reported',
  );

  if (VERBOSE && finding) {
    for (const e of finding.evidence) {
      console.log(`        L${e.line}: ${e.snippet}`);
    }
  }
}

// ---------------------------------------------------------------------------

section('3. Hardened fixtures do not fail');
for (const fixture of FIXTURES) {
  const { findings } = await runScan(fixture.safe, fixture.language, hardPack, 'hard');
  const finding = findings.find((f) => f.id === fixture.category);

  const clean = !!finding && finding.status !== 'fail';
  check(
    clean,
    `${fixture.id} (${fixture.category}) is clean in hard mode`,
    finding
      ? `status=${finding.status} count=${finding.count} score=${finding.score}`
      : 'category not reported',
  );

  if (!clean && VERBOSE && finding) {
    for (const e of finding.evidence) {
      console.log(`        L${e.line}: ${e.snippet}`);
    }
  }
}

// ---------------------------------------------------------------------------

section('4. Hard mode is stricter than standard mode');
{
  let stricter = 0;
  let notStricter = 0;

  for (const fixture of FIXTURES) {
    const hard = await runScan(fixture.vulnerable, fixture.language, hardPack, 'hard');
    const standard = await runScan(fixture.vulnerable, fixture.language, basePack, 'standard');

    const hardIssues = hard.findings.filter((f) => f.status !== 'pass').length;
    const standardIssues = standard.findings.filter((f) => f.status !== 'pass').length;

    if (hardIssues >= standardIssues) stricter++;
    else {
      notStricter++;
      console.log(
        `        ${fixture.id}: hard=${hardIssues} standard=${standardIssues} (hard found less)`,
      );
    }

    check(
      hard.stats.score <= standard.stats.score,
      `${fixture.id}: hard score <= standard score`,
      `hard=${hard.stats.score} standard=${standard.stats.score}`,
    );
  }

  check(
    notStricter === 0,
    'hard mode never finds fewer issues than standard mode',
    `${stricter}/${FIXTURES.length} fixtures`,
  );
}

// ---------------------------------------------------------------------------

section('5. Severity floors are enforced');
{
  const floors = {
    A01: 'high',
    A02: 'critical',
    A03: 'critical',
    A07: 'high',
    A10: 'high',
  };

  let floorFailures = 0;
  for (const fixture of FIXTURES) {
    const { findings } = await runScan(fixture.vulnerable, fixture.language, hardPack, 'hard');
    for (const [categoryId, floor] of Object.entries(floors)) {
      const finding = findings.find((f) => f.id === categoryId);
      if (!finding || finding.status === 'pass') continue;
      const order = ['info', 'low', 'medium', 'high', 'critical'];
      if (order.indexOf(finding.severity) < order.indexOf(floor)) {
        floorFailures++;
        console.log(
          `        ${fixture.id}: ${categoryId} reported ${finding.severity}, floor is ${floor}`,
        );
      }
    }
  }
  check(
    floorFailures === 0,
    'no finding falls below its category severity floor',
    `${floorFailures} violations`,
  );
}

// ---------------------------------------------------------------------------

section('6. Mitigation gate reports a missing control');
{
  // A file that is otherwise clean but has no rate limiter on its login
  // route. Hard mode should flag the absent control.
  const noRateLimit = `app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.users.findByEmail(email);
  res.json({ token: issueToken(user) });
});
`;

  const withRateLimit = `app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  await rateLimit({ key: req.ip, limit: 5, windowMs: 60000 });
  const user = await db.users.findByEmail(email);
  res.json({ token: issueToken(user) });
});
`;

  const without = await runScan(noRateLimit, 'javascript', hardPack, 'hard');
  const with_ = await runScan(withRateLimit, 'javascript', hardPack, 'hard');

  const a04Without = without.findings.find((f) => f.id === 'A04');
  const a04With = with_.findings.find((f) => f.id === 'A04');

  check(
    !!a04Without && a04Without.status !== 'pass',
    'missing rate limit is flagged in hard mode',
    a04Without ? `status=${a04Without.status}` : 'not reported',
  );

  check(
    !!a04With && a04With.status !== 'fail',
    'present rate limit does not fail A04',
    a04With ? `status=${a04With.status}` : 'not reported',
  );

  check(
    !!a04Without && a04Without.mitigationMissing === true,
    'the missing control is reported as mitigationMissing',
  );
}

// ---------------------------------------------------------------------------

section('7. The hard pack never changes the standard pack');
{
  const reloaded = await loadOwaspPack();
  const stillClean = reloaded.categories.every((c) => !c.hardRules);
  check(stillClean, 'reloading the base pack returns the unmodified pack');

  const standard = await runScan(
    FIXTURES[0].vulnerable,
    FIXTURES[0].language,
    basePack,
    'standard',
  );
  const hard = await runScan(
    FIXTURES[0].vulnerable,
    FIXTURES[0].language,
    hardPack,
    'hard',
  );
  check(
    standard.findings.length === hard.findings.length,
    'both profiles report the same number of categories',
    `${standard.findings.length} vs ${hard.findings.length}`,
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const report = {
  generatedAt: new Date().toISOString(),
  passed,
  failed,
  total: passed + failed,
  fixtures: FIXTURES.map((f) => ({
    id: f.id,
    language: f.language,
    category: f.category,
    label: f.label,
  })),
  failures,
};

const reportDir = path.join(ROOT, 'reports');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, 'owasp-hard-mode-test.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

globalThis.fetch = originalFetch;

console.log('\n==================================================');
console.log(`passed ${passed}, failed ${failed}, total ${passed + failed}`);
console.log(`report: ${reportPath}`);
console.log('==================================================');

process.exitCode = failed === 0 ? 0 : 1;
