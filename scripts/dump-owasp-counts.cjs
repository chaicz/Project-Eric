// Dumps the per-category issue counts the scanner page reports, so the
// built-in detectors can be compared with the extension-pack engine
// category by category.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = 'http://localhost/project-eric-api/api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const app = 'http://127.0.0.1:5173';
  const email = `owasp-dump-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';

  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Dump', lastName: 'One', email, password }),
  });
  const jwt = (await reg.json()).data.token;
  await fetch(`${API}/auth/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ experience: 'tester', languages: ['php'], securityFocus: 'general' }),
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100 });
  await page.goto(`${app}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  for (const input of await page.$$('input')) {
    const type = await input.evaluate((el) => el.type);
    if (type === 'email') await input.type(email);
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

  for (const file of process.argv.slice(2)) {
    await page.goto(`${app}/owasp`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="file"]', { timeout: 20000 });
    await (await page.$('input[type="file"]')).uploadFile(path.resolve(file));
    await sleep(1800);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find((b) => /run owasp scan/i.test(b.textContent || ''))?.click();
    });
    await page.waitForFunction(() => /Generate PDF report/i.test(document.body.innerText),
      { timeout: 90000 });
    await sleep(800);

    const dump = await page.evaluate(() => {
      const text = document.body.innerText;
      const out = [];
      const marks = [...text.matchAll(/\b(A\d{2})\b/g)];
      for (let i = 0; i < marks.length; i++) {
        const start = marks[i].index;
        const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
        const block = text.slice(start, end);
        const status = block.match(/\b(FAIL|PASS|WARNING|WARN)\b/i);
        const matches = block.match(/(\d+)\s+MATCHES/i);
        const issues = block.match(/(\d+)\s+issues?/i);
        if (status) {
          out.push({
            id: marks[i][1],
            status: status[1].toUpperCase(),
            matches: matches ? Number(matches[1]) : null,
            issues: issues ? Number(issues[1]) : null,
          });
        }
      }
      return { score: (text.match(/(\d+)\s*\/\s*100/) || [])[1], rows: out };
    });
    console.log('\n===', file, 'score', dump.score);
    for (const r of dump.rows) console.log('  ', r.id, r.status, 'matches=' + r.matches, 'issues=' + r.issues);
  }

  await browser.close();
})();
