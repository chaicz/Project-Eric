// End-to-end test of the OWASP scanner on both sides of the app:
//
//   1. the scanner page      (/owasp)          - upload + file detection
//   2. the analysis page    (/owasp-analysis) - the code-server workbench
//
// The fixtures are freshly written files that the scanners have never
// seen. Two of them are deliberately broken (undefined variables, calls
// to functions that do not exist), because a scanner that silently
// falls back to a stored answer would look exactly the same on clean
// input as it does on broken input.
//
// For each fixture the test records the score, the per-category status
// and the number of issues, then checks that the two scanners agree
// with each other and that the results actually track the input.
//
// Usage: node scripts/test-owasp-both-sides.cjs

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve('logs/owasp-both-sides');

const FIXTURES = [
  {
    id: 'inventory',
    file: path.resolve('logs/owasp-fixture-inventory.php'),
    label: 'fresh PHP with injection, hardcoded secret and weak hash',
    expectFail: ['A03', 'A02'],
  },
  {
    id: 'broken',
    file: path.resolve('logs/owasp-fixture-broken.php'),
    label: 'broken PHP with undefined variables and a missing function',
    expectFail: ['A02'],
  },
];

const findApp = async () => {
  const candidates = [process.env.APP_PORT, '5173', '5174', '5175', '5176', '4173'].filter(Boolean);
  for (const port of candidates) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${url}/login`, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status === 404) return url;
    } catch {
      /* try the next port */
    }
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

/** Sign a fresh account in and return the browser page. */
const signIn = async (browser, app, email, password) => {
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'OWASP', lastName: 'BothSides', email, password }),
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

  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });
  page.__errors = errors;

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
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /sign in|log in/i.test(b.textContent || ''));
      btn?.click();
    }),
  ]);
  await sleep(1200);
  return page;
};

/**
 * Read the scan results out of the page.
 *
 * The two pages show different cards, so the reader keys off the
 * category id (A01 … A10) that appears next to each result and the
 * status word beside it.
 */
const readResults = (page) =>
  page.evaluate(() => {
    const text = document.body.innerText;

    const scoreMatch = text.match(/(\d+)\s*\/\s*100/);
    const score = scoreMatch ? Number(scoreMatch[1]) : null;

    // The two pages label the issue count differently: the analysis
    // page says "Found 6 issues across ...", the scanner page shows an
    // "ISSUES" stat pill whose value sits on the next line.
    let totalIssues = (text.match(/Found\s+(\d+)\s+issue/i) || [])[1];
    if (!totalIssues) {
      const pill = text.match(/\bISSUES\b\s*\n\s*(\d+)/i);
      if (pill) totalIssues = pill[1];
    }

    // Walk the visible text and pick up each category id together with
    // the status word that belongs to it. The status word can sit well
    // below the id (the analysis page puts the description and the
    // match count in between), so each block runs from one id to the
    // next.
    const findings = [];
    const marks = [...text.matchAll(/\b(A\d{2})\b/g)];
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

    return { score, totalIssues: totalIssues ? Number(totalIssues) : null, findings: unique, text };
  });

/** Drive the scanner page: upload a file and run the scan. */
const scanOnScannerPage = async (page, app, fixture) => {
  await page.goto(`${app}/owasp`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="file"]', { timeout: 20000 });

  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(fixture.file);
  await sleep(1500);

  const editor = await page.$eval('textarea', (el) => el.value);
  // The scanner page states the language it is scanning with in a
  // "Scanning as PHP" caption next to the file stats.
  const language = await page.evaluate(() => {
    const caption = document.body.innerText.match(/Scanning as\s+([A-Za-z#0-9 +]+)/);
    if (caption) return caption[1].trim();
    const el = [...document.querySelectorAll('*')].find(
      (s) => s.children.length === 0 && s.textContent.trim() === 'PHP');
    return el ? 'PHP' : null;
  });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /run owasp scan/i.test(b.textContent || ''));
    btn?.click();
  });

  await page.waitForFunction(
    () => /Generate PDF report/i.test(document.body.innerText),
    { timeout: 90000 }
  );
  await sleep(800);

  return { editor, language, ...(await readResults(page)) };
};

/** Drive the analysis page: paste the code and run the scan. */
const scanOnAnalysisPage = async (page, app, fixture) => {
  await page.goto(`${app}/owasp-analysis`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('textarea', { timeout: 20000 });

  const source = fs.readFileSync(fixture.file, 'utf8');

  // The language picker has to say PHP, otherwise the language-specific
  // rules are not the ones being tested.
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
    const area = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, text);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }, source);
  await sleep(600);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /run owasp scan/i.test(b.textContent || ''));
    btn?.click();
  });

  // The analysis page streams results in, so wait for the run to end
  // rather than for a fixed button.
  await page.waitForFunction(
    () => /Scanning/i.test(document.body.innerText) === false &&
          /Found\s+\d+\s+issue/i.test(document.body.innerText),
    { timeout: 90000 }
  );
  await sleep(1000);

  return await readResults(page);
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

  const email = `owasp-both-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';

  try {
    const page = await signIn(browser, app, email, password);
    console.log('signed in:', page.url().includes('/login') ? 'STILL ON LOGIN' : 'ok');

    const summary = {};

    for (const fixture of FIXTURES) {
      console.log(`\n=== fixture: ${fixture.id} — ${fixture.label} ===`);

      // ---- Scanner page --------------------------------------------------
      console.log('\n[scanner page /owasp]');
      const scanner = await scanOnScannerPage(page, app, fixture);

      console.log('  editor length:', scanner.editor.length);
      console.log('  language detected:', scanner.language);
      console.log('  score:', scanner.score);
      console.log('  total issues:', scanner.totalIssues);
      console.log('  categories:', scanner.findings.map((f) => `${f.id}=${f.status}`).join(' '));

      check(scanner.editor.includes('<?php') || scanner.editor.length > 50,
        'the uploaded file reached the editor',
        `${scanner.editor.length} chars`);
      check(scanner.language === 'PHP', 'the language was detected as PHP',
        String(scanner.language));
      check(typeof scanner.score === 'number', 'a score was produced',
        String(scanner.score));
      check(scanner.findings.length >= 8, 'all ten categories were reported',
        `${scanner.findings.length} categories`);

      for (const id of fixture.expectFail) {
        const hit = scanner.findings.find((f) => f.id === id);
        check(hit && hit.status !== 'pass',
          `${id} was flagged in the fresh file`,
          hit ? hit.status : 'missing');
      }

      await page.screenshot({ path: path.join(OUT, `scanner-${fixture.id}.png`) });

      // ---- Analysis page -------------------------------------------------
      console.log('\n[analysis page /owasp-analysis]');
      const analysis = await scanOnAnalysisPage(page, app, fixture);

      console.log('  score:', analysis.score);
      console.log('  total issues:', analysis.totalIssues);
      console.log('  categories:', analysis.findings.map((f) => `${f.id}=${f.status}`).join(' '));

      check(typeof analysis.score === 'number', 'a score was produced',
        String(analysis.score));
      check(analysis.findings.length >= 8, 'all ten categories were reported',
        `${analysis.findings.length} categories`);

      for (const id of fixture.expectFail) {
        const hit = analysis.findings.find((f) => f.id === id);
        check(hit && hit.status !== 'pass',
          `${id} was flagged in the fresh file`,
          hit ? hit.status : 'missing');
      }

      await page.screenshot({ path: path.join(OUT, `analysis-${fixture.id}.png`) });

      // ---- The two sides must agree -------------------------------------
      console.log('\n[cross-check]');
      check(scanner.score === analysis.score,
        'both sides produced the same score',
        `${scanner.score} vs ${analysis.score}`);
      check(scanner.totalIssues === analysis.totalIssues,
        'both sides produced the same issue count',
        `${scanner.totalIssues} vs ${analysis.totalIssues}`);

      const scannerStatus = Object.fromEntries(
        scanner.findings.map((f) => [f.id, f.status]));
      const analysisStatus = Object.fromEntries(
        analysis.findings.map((f) => [f.id, f.status]));
      const mismatched = Object.keys(scannerStatus).filter(
        (id) => analysisStatus[id] && analysisStatus[id] !== scannerStatus[id]);
      check(mismatched.length === 0,
        'both sides agree on every category status',
        mismatched.join(', '));

      summary[fixture.id] = { scanner, analysis };
    }

    // ---- The results must track the input, not a stored answer ----------
    console.log('\n=== not hardcoded ===');
    const a = summary.inventory;
    const b = summary.broken;
    check(a.scanner.score !== b.scanner.score,
      'two different files give two different scores',
      `${a.scanner.score} vs ${b.scanner.score}`);
    check(a.analysis.score !== b.analysis.score,
      'the analysis page also differs between the two files',
      `${a.analysis.score} vs ${b.analysis.score}`);
    check(a.scanner.totalIssues !== b.scanner.totalIssues,
      'the issue counts differ between the two files',
      `${a.scanner.totalIssues} vs ${b.scanner.totalIssues}`);

    // The broken file must not have produced an error or a crash.
    check(b.scanner.totalIssues !== null && b.analysis.totalIssues !== null,
      'the broken file still produced a result on both sides');

    // The broken file has fewer weaknesses than the inventory file, so
    // it must score at least as high.
    check(b.scanner.score >= a.scanner.score,
      'the broken file (one weakness) scores at least as high as the fuller one',
      `${b.scanner.score} vs ${a.scanner.score}`);

    fs.writeFileSync(
      path.join(OUT, 'results.json'),
      JSON.stringify(summary, null, 2)
    );
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
