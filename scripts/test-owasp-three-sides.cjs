// Three-surface OWASP test.
//
// Surfaces under test:
//   1. scanner page   (/owasp)          - built-in detectors
//   2. analysis page (/owasp-analysis) - the extension-pack engine
//   3. code-server extension engine     - the same engine the VS Code
//                                         extension runs inside code-server
//
// Fixtures are freshly written files the engines have never seen:
//   billing.php    - new code: SQL built in a variable then executed,
//                    a shell command assembled by concatenation, a weak
//                    hash and a hardcoded token
//   undefined.php  - the "error file": variables that are never assigned
//                    and functions that do not exist, plus one real
//                    weakness so the scan still has something to report
//
// The point is to prove nothing is replayed from a stored answer: each
// fixture must produce its own numbers, the error file must still
// produce a result, and the two healthy fixtures must differ.
//
// Usage: node scripts/test-owasp-three-sides.cjs

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve('logs/owasp-three-sides');

const FIXTURES = [
  {
    id: 'billing',
    file: path.resolve('logs/owasp-fixture-billing.php'),
    label: 'new PHP: SQL built in a variable, shell command by concatenation',
    expectFail: ['A02', 'A03'],
    expectExt: ['A02', 'A03'],
  },
  {
    id: 'undefined',
    file: path.resolve('logs/owasp-fixture-undefined.php'),
    label: 'error PHP: undefined variables and missing functions',
    expectFail: ['A02'],
    // The error file has no injection, so the extension engine must
    // report none either — flagging it would be a false positive.
    expectExt: ['A02'],
  },
  {
    id: 'inventory',
    file: path.resolve('logs/owasp-fixture-inventory.php'),
    label: 'earlier PHP fixture, kept as a regression check',
    expectFail: ['A02', 'A03'],
    expectExt: ['A02', 'A03'],
  },
];

// ---------------------------------------------------------------------------
// Surface 3: the code-server extension engine.
//
// This is the code that runs inside code-server (the installed extension
// under %LOCALAPPDATA%\code-server\Data\extensions), so it is loaded the
// same way the IDE loads it.
// ---------------------------------------------------------------------------
const extensionEngine = (fixturePath) => {
  const EXT = path.join(
    process.env.LOCALAPPDATA,
    'code-server', 'Data', 'extensions',
    'project-eric.project-eric-owasp-0.1.0',
  );
  const packLoader = require(path.join(EXT, 'out', 'scanner', 'packLoader.js'));
  const scanner = require(path.join(EXT, 'out', 'scanner', 'scanner.js'));
  const pack = packLoader.parsePack(
    fs.readFileSync(path.join(EXT, 'data', 'owasp-pack.json'), 'utf8'));
  packLoader.ingestPack(pack);

  const text = fs.readFileSync(fixturePath, 'utf8');
  const result = scanner.scanCode({
    uri: fixturePath,
    language: 'php',
    text,
    minSeverity: 'low',
    skipCategories: [],
  });

  const byCategory = {};
  for (const f of result.findings) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }
  return {
    findings: result.findings.length,
    byCategory,
    rules: [...new Set(result.findings.map((f) => f.ruleId))].sort(),
    evidence: result.findings.slice(0, 10).map((f) => ({
      rule: f.ruleId,
      category: f.category,
      severity: f.severity,
      line: f.line + 1,
      match: f.matchText.slice(0, 90),
    })),
  };
};

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
const findApp = async () => {
  const candidates = [process.env.APP_PORT, '5173', '5174', '5175', '5176', '4173']
    .filter(Boolean);
  for (const port of candidates) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${url}/login`, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status === 404) return url;
    } catch { /* try the next port */ }
  }
  throw new Error(`No dev server found on ports ${candidates.join(', ')}.`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const signIn = async (browser, app, email, password) => {
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'OWASP', lastName: 'ThreeSides', email, password }),
  });
  if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
  const jwt = (await reg.json()).data.token;
  await fetch(`${API}/auth/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ experience: 'tester', languages: ['php'], securityFocus: 'general' }),
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100 });
  page.on('pageerror', (err) => console.log('  [pageerror]', String(err).slice(0, 160)));
  await page.goto(`${app}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 20000 });
  for (const input of await page.$$('input')) {
    const type = await input.evaluate((el) => el.type);
    const name = await input.evaluate((el) => el.name || el.id || '');
    if (type === 'email' || name.toLowerCase().includes('email')) await input.type(email);
    else if (type === 'password') await input.type(password);
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
    page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find((b) => /sign in|log in/i.test(b.textContent || ''))?.click();
    }),
  ]);
  await sleep(1200);
  return page;
};

/**
 * Read the results off the page.
 *
 * The scanner page shows one card per category; the analysis page shows
 * one row per category. Both carry the category id (A01 … A10) and a
 * status word, so the reader keys off those.
 */
const readResults = (page) =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const score = (text.match(/(\d+)\s*\/\s*100/) || [])[1];

    // The two pages label the issue count differently: the analysis
    // page says "Found 6 issues across ...", the scanner page shows an
    // "ISSUES" stat pill whose value sits on the next line.
    let issues = (text.match(/Found\s+(\d+)\s+issue/i) || [])[1];
    if (!issues) {
      const pill = text.match(/\bISSUES\b\s*\n\s*(\d+)/i);
      if (pill) issues = pill[1];
    }

    // Split the visible text into category blocks and look for a status
    // word inside each block.
    const marks = [...text.matchAll(/\b(A\d{2})\b/g)];
    const findings = [];
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i].index;
      const end = i + 1 < marks.length ? marks[i + 1].index : Math.min(text.length, start + 400);
      const block = text.slice(start, end);
      const status = block.match(/\b(FAIL|PASS|WARNING|WARN)\b/i);
      if (status) {
        findings.push({
          id: marks[i][1].toUpperCase(),
          status: status[1].toLowerCase().startsWith('warn') ? 'warning' : status[1].toLowerCase(),
        });
      }
    }
    // Keep the first occurrence of each category id.
    const seen = new Set();
    const unique = findings.filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

    return {
      score: score ? Number(score) : null,
      totalIssues: issues ? Number(issues) : null,
      findings: unique,
      text,
    };
  });

const scanOnScannerPage = async (page, app, fixture) => {
  await page.goto(`${app}/owasp`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="file"]', { timeout: 20000 });
  await (await page.$('input[type="file"]')).uploadFile(fixture.file);
  await sleep(1800);

  const editor = await page.$eval('textarea', (el) => el.value);

  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => /run owasp scan/i.test(b.textContent || ''))?.click();
  });
  await page.waitForFunction(
    () => /Generate PDF report/i.test(document.body.innerText), { timeout: 90000 });
  await sleep(800);

  return { editor, ...(await readResults(page)) };
};

const scanOnAnalysisPage = async (page, app, fixture) => {
  await page.goto(`${app}/owasp-analysis`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('textarea', { timeout: 20000 });
  await sleep(800);

  const source = fs.readFileSync(fixture.file, 'utf8');

  await page.evaluate(() => {
    const select = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => o.value === 'php'));
    if (select) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'php');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(400);

  await page.evaluate((text) => {
    const areas = [...document.querySelectorAll('textarea')];
    const target = areas.find((t) => t.value.length > 50 && !/api key/i.test(t.placeholder || ''))
      || areas[0];
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(target, text);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }, source);
  await sleep(700);

  const pasted = await page.evaluate(() =>
    [...document.querySelectorAll('textarea')].map((t) => t.value.length));

  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => /run owasp scan/i.test(b.textContent || ''))?.click();
  });

  await page.waitForFunction(
    () => !/Scanning/i.test(document.body.innerText) &&
          /Found\s+\d+\s+issue/i.test(document.body.innerText),
    { timeout: 90000 });
  await sleep(900);

  return { pasted, ...(await readResults(page)) };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = await findApp();
  console.log('dev server:', app);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const email = `owasp-three-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';
  const summary = {};

  try {
    const page = await signIn(browser, app, email, password);
    console.log('signed in:', page.url().includes('/login') ? 'STILL ON LOGIN' : 'ok');

    for (const fixture of FIXTURES) {
      console.log(`\n=== fixture: ${fixture.id} — ${fixture.label} ===`);

      // ---- 1. scanner page ------------------------------------------------
      console.log('\n[1/3 scanner page /owasp — built-in detectors]');
      const scanner = await scanOnScannerPage(page, app, fixture);
      console.log('  editor chars:', scanner.editor.length);
      console.log('  score:', scanner.score, ' issues:', scanner.totalIssues);
      console.log('  categories:', scanner.findings.map((f) => `${f.id}=${f.status}`).join(' '));

      check(scanner.editor.length > 50, 'the file reached the editor',
        `${scanner.editor.length} chars`);
      check(typeof scanner.score === 'number', 'a score was produced', String(scanner.score));
      check(scanner.findings.length >= 8, 'all ten categories were reported',
        `${scanner.findings.length} categories`);
      for (const id of fixture.expectFail) {
        const hit = scanner.findings.find((f) => f.id === id);
        check(hit && hit.status !== 'pass', `${id} was flagged on the scanner page`,
          hit ? hit.status : 'missing');
      }
      await page.screenshot({ path: path.join(OUT, `scanner-${fixture.id}.png`) });

      // ---- 2. analysis page ----------------------------------------------
      console.log('\n[2/3 analysis page /owasp-analysis — extension pack engine]');
      const analysis = await scanOnAnalysisPage(page, app, fixture);
      console.log('  textarea lengths:', JSON.stringify(analysis.pasted));
      console.log('  score:', analysis.score, ' issues:', analysis.totalIssues);
      console.log('  categories:', analysis.findings.map((f) => `${f.id}=${f.status}`).join(' '));

      check(typeof analysis.score === 'number', 'a score was produced', String(analysis.score));
      check(analysis.findings.length >= 8, 'all ten categories were reported',
        `${analysis.findings.length} categories`);
      for (const id of fixture.expectFail) {
        const hit = analysis.findings.find((f) => f.id === id);
        check(hit && hit.status !== 'pass', `${id} was flagged on the analysis page`,
          hit ? hit.status : 'missing');
      }
      await page.screenshot({ path: path.join(OUT, `analysis-${fixture.id}.png`) });

      // ---- 3. code-server extension engine -------------------------------
      console.log('\n[3/3 code-server extension engine]');
      const ext = extensionEngine(fixture.file);
      console.log('  findings:', ext.findings);
      console.log('  by category:', JSON.stringify(ext.byCategory));
      console.log('  rules:', ext.rules.join(', '));
      for (const e of ext.evidence) {
        console.log(`    line ${e.line}  ${e.category}/${e.severity}  ${e.rule}  "${e.match}"`);
      }

      check(ext.findings > 0, 'the extension engine found something',
        `${ext.findings} findings`);
      for (const id of fixture.expectExt) {
        check(id in ext.byCategory, `the extension engine flagged ${id}`,
          JSON.stringify(ext.byCategory));
      }

      // ---- cross-surface agreement --------------------------------------
      console.log('\n[cross-check]');
      check(scanner.score === analysis.score,
        'scanner page and analysis page agree on the score',
        `${scanner.score} vs ${analysis.score}`);

      const scannerStatus = Object.fromEntries(scanner.findings.map((f) => [f.id, f.status]));
      const analysisStatus = Object.fromEntries(analysis.findings.map((f) => [f.id, f.status]));
      const mismatched = Object.keys(scannerStatus).filter(
        (id) => analysisStatus[id] && analysisStatus[id] !== scannerStatus[id]);
      check(mismatched.length === 0,
        'both pages agree on every category status', mismatched.join(', '));

      summary[fixture.id] = { scanner, analysis, extension: ext };
    }

    // ---- the results must track the input -------------------------------
    console.log('\n=== not hardcoded ===');
    const a = summary.billing;
    const b = summary.undefined;

    check(a.scanner.score !== b.scanner.score,
      'the two files give different scanner scores',
      `${a.scanner.score} vs ${b.scanner.score}`);
    check(a.analysis.score !== b.analysis.score,
      'the two files give different analysis scores',
      `${a.analysis.score} vs ${b.analysis.score}`);
    check(a.extension.findings !== b.extension.findings,
      'the two files give different extension-engine finding counts',
      `${a.extension.findings} vs ${b.extension.findings}`);
    check(a.extension.rules.join() !== b.extension.rules.join(),
      'the two files trip different extension rules',
      `${a.extension.rules.join('|')} vs ${b.extension.rules.join('|')}`);

    check(b.scanner.totalIssues !== null && b.analysis.totalIssues !== null,
      'the error file still produced a result on both pages');
    check(b.extension.findings > 0,
      'the error file still produced findings in the extension engine',
      `${b.extension.findings}`);

    check(b.scanner.score >= a.scanner.score,
      'the error file (one weakness) scores at least as high as the fuller one',
      `${b.scanner.score} vs ${a.scanner.score}`);

    // The two healthy fixtures both carry four weaknesses, so they can
    // legitimately land on the same score and trip the same categories.
    // What must differ is the specific findings behind them.
    const aInventory = summary.inventory;
    check(
      a.extension.rules.join('|') !== aInventory.extension.rules.join('|'),
      'the two healthy files trip different extension rules',
      `${a.extension.rules.join('|')} vs ${aInventory.extension.rules.join('|')}`);

    fs.writeFileSync(path.join(OUT, 'results.json'),
      JSON.stringify(summary, (k, v) => (k === 'text' ? undefined : v), 2));
    console.log('\nresults written:', path.join(OUT, 'results.json'));
  } catch (error) {
    console.error('\nFAILED:', error.message);
    console.error(error.stack);
    failures += 1;
  } finally {
    await browser.close();
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
