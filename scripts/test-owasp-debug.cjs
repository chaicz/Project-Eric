// Focused debug of the analysis page: which textarea holds the code,
// does the paste stick, and what does the scan report afterwards.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve('logs/owasp-debug');

const findApp = async () => {
  const candidates = [process.env.APP_PORT, '5173', '5174', '5175', '5176', '4173'].filter(Boolean);
  for (const port of candidates) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${url}/login`, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status === 404) return url;
    } catch { /* next */ }
  }
  throw new Error('No dev server found.');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = await findApp();

  const email = `owasp-debug2-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';

  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Debug', lastName: 'Two', email, password }),
  });
  if (!reg.ok) throw new Error(`register failed: ${await reg.text()}`);
  const jwt = (await reg.json()).data.token;
  await fetch(`${API}/auth/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ experience: 'tester', languages: ['php'], securityFocus: 'general' }),
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100 });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));

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

  // ================= scanner page =================
  console.log('\n=== scanner page ===');
  await page.goto(`${app}/owasp`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="file"]', { timeout: 20000 });

  const before = await page.evaluate(() => {
    const t = document.querySelector('textarea');
    return { value: t ? t.value.slice(0, 80) : null, len: t ? t.value.length : 0 };
  });
  console.log('  editor before upload:', JSON.stringify(before));

  await (await page.$('input[type="file"]')).uploadFile(
    path.resolve('logs/owasp-fixture-inventory.php'));
  await sleep(1800);

  const afterUpload = await page.evaluate(() => {
    const t = document.querySelector('textarea');
    const langChip = [...document.querySelectorAll('span,div')]
      .filter((el) => el.children.length === 0 && /\bphp\b/i.test(el.textContent || ''))
      .map((el) => el.textContent.trim())
      .slice(0, 8);
    return {
      value: t ? t.value.slice(0, 120) : null,
      len: t ? t.value.length : 0,
      langChip,
    };
  });
  console.log('  editor after upload:', JSON.stringify(afterUpload.value));
  console.log('  length:', afterUpload.len);
  console.log('  php-ish chips:', JSON.stringify(afterUpload.langChip));

  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => /run owasp scan/i.test(b.textContent || ''))?.click();
  });
  await page.waitForFunction(
    () => /Generate PDF report/i.test(document.body.innerText), { timeout: 90000 });
  await sleep(1000);

  const scannerResults = await page.evaluate(() => {
    const text = document.body.innerText;
    // Each category card carries the id, the name and a status word.
    const cards = [...document.querySelectorAll('[id^="A"], [data-category]')].map((el) => el.textContent.trim());
    const lines = text.split('\n').filter((l) => /^\s*A\d{2}\b/.test(l));
    return {
      score: (text.match(/(\d+)\s*\/\s*100/) || [])[1] || null,
      summaryLine: (text.match(/Found[^\n]*/i) || [])[0] || null,
      categoryLines: lines.slice(0, 14),
      cardSample: cards.slice(0, 4),
      text,
    };
  });
  console.log('  score:', scannerResults.score);
  console.log('  summary:', scannerResults.summaryLine);
  console.log('  category lines:', JSON.stringify(scannerResults.categoryLines, null, 1));
  fs.writeFileSync(path.join(OUT, 'scanner-results.txt'), scannerResults.text);

  // ================= analysis page =================
  console.log('\n=== analysis page ===');
  await page.goto(`${app}/owasp-analysis`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('textarea', { timeout: 20000 });
  await sleep(800);

  const textareas = await page.evaluate(() =>
    [...document.querySelectorAll('textarea')].map((t, i) => ({
      index: i,
      len: t.value.length,
      head: t.value.slice(0, 70),
      placeholder: t.placeholder || '',
      cls: t.className.slice(0, 60),
    })));
  console.log('  textareas:', JSON.stringify(textareas, null, 1));

  const source = fs.readFileSync('logs/owasp-fixture-inventory.php', 'utf8');

  // Paste into the code box (the one inside the "Code to scan" panel).
  const pasted = await page.evaluate((text) => {
    const areas = [...document.querySelectorAll('textarea')];
    // The code box is the one that already holds the sample source.
    const target = areas.find((t) => t.value.length > 50 && !t.placeholder.includes('AI key')) || areas[0];
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(target, text);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return { index: areas.indexOf(target), len: target.value.length, head: target.value.slice(0, 60) };
  }, source);
  console.log('  pasted into textarea index', pasted.index, 'len', pasted.len);
  await sleep(900);

  const readback = await page.evaluate(() =>
    [...document.querySelectorAll('textarea')].map((t, i) => ({ index: i, len: t.value.length })));
  console.log('  textarea lengths after paste:', JSON.stringify(readback));

  // Pick PHP in the language select.
  await page.evaluate(() => {
    const select = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => o.value === 'php'));
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'php');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(700);
  console.log('  language now:', await page.evaluate(() =>
    document.querySelector('select')?.value));

  const packState = await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]');
    return { usePackChecked: cb ? cb.checked : null };
  });
  console.log('  use-pack checkbox:', JSON.stringify(packState));

  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => /run owasp scan/i.test(b.textContent || ''))?.click();
  });
  await sleep(6000);

  const analysisResults = await page.evaluate(() => {
    const text = document.body.innerText;
    const lines = text.split('\n').filter((l) => /^\s*A\d{2}/.test(l));
    return {
      score: (text.match(/(\d+)\s*\/\s*100/) || [])[1] || null,
      summary: (text.match(/Found[^\n]*/i) || [])[0] || null,
      categoryLines: lines.slice(0, 14),
      text,
    };
  });
  console.log('  score:', analysisResults.score);
  console.log('  summary:', analysisResults.summary);
  console.log('  category lines:', JSON.stringify(analysisResults.categoryLines, null, 1));
  fs.writeFileSync(path.join(OUT, 'analysis-results.txt'), analysisResults.text);
  await page.screenshot({ path: path.join(OUT, 'analysis-after.png'), fullPage: false });

  await browser.close();
  console.log('\ndumps written to', OUT);
})();
