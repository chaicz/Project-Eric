// ---------------------------------------------------------------------------
// Browser check for the Hard Mode toggle.
//
// Drives the scanner page the way a person would: sign in, paste a
// vulnerable snippet, switch to Hard Mode, run the scan, and confirm the
// stricter profile reports the flaw and the page shows the toggle.
//
// The API calls are rewritten to the mock server on port 5299, the same
// way the functional walkthrough does it.
//
// Usage: node tests/owasp-hard-mode/browser-check.cjs
// ---------------------------------------------------------------------------

const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const MOCK_API = 'http://127.0.0.1:5299/project-eric-api/api';

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

const VULNERABLE = [
  "const q = \"SELECT * FROM users WHERE email = '\" + req.query.email + \"'\";",
  'db.query(q);',
  'const token = "tok_live_9f2a4c6e8b1d";',
].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  return ok;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Rewrite the XAMPP API calls to the mock server.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
        const rewritten = url.replace(
          /https?:\/\/localhost\/project-eric-api/,
          'http://127.0.0.1:5299/project-eric-api'
        );
        req.continue({ url: rewritten }).catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });

    await page.evaluateOnNewDocument((user) => {
      try {
        localStorage.setItem('token', 'mock-token');
        localStorage.setItem('project-eric_user', JSON.stringify(user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
        localStorage.setItem('project-eric_theme', 'dark');
      } catch (e) { /* ignore */ }
    }, SEED_USER);

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));

    await page.goto(`${BASE}/owasp`, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(3000);

    const landed = await page.evaluate(() => window.location.pathname);
    check(landed === '/owasp', 'the scanner page loaded', `landed=${landed}`);

    const hasToggle = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button')];
      return nodes.some((b) => b.textContent.trim() === 'Hard Mode');
    });
    check(hasToggle, 'the Hard Mode toggle is rendered');

    const switched = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Hard Mode',
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    await sleep(400);
    check(switched, 'the Hard Mode button is clickable');

    const isChecked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Hard Mode',
      );
      return btn && btn.getAttribute('aria-checked') === 'true';
    });
    check(isChecked, 'the toggle reports aria-checked=true once switched on');

    await page.evaluate((src) => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      ).set;
      setter.call(ta, src);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, VULNERABLE);
    await sleep(600);

    const typed = await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      return ta ? ta.value.includes('SELECT') : false;
    });
    check(typed, 'the snippet reached the editor');

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /Run OWASP Scan/i.test(b.textContent),
      );
      if (btn) btn.click();
    });

    // The scan runs ten detectors with a short delay each.
    await sleep(14000);

    const summary = await page.evaluate(() => {
      const text = document.body.innerText;
      const scoreMatch = text.match(/score\s+(\d+)\/100/i);
      return {
        score: scoreMatch ? Number(scoreMatch[1]) : null,
        mentionsHard: /hard mode/i.test(text),
        hasInjection: /Injection/i.test(text),
        showsSecret: /Hardcoded credential/i.test(text),
      };
    });

    check(summary.score !== null, 'the scan reports a score', `score=${summary.score}`);
    check(
      summary.score !== null && summary.score < 100,
      'the vulnerable snippet does not score 100',
      `score=${summary.score}`,
    );
    check(summary.mentionsHard, 'the results mention the hard-mode profile');
    check(summary.hasInjection, 'the Injection category is reported');
    check(errors.length === 0, 'no uncaught page errors', errors.join(' | '));

    console.log('');
    console.log('--- summary ---');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }

  console.log('');
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
