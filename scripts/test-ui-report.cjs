// End-to-end browser test for the OWASP scanner's upload and PDF
// report flow.
//
//   1. log in
//   2. open the OWASP scanner
//   3. upload a source file
//   4. run the scan
//   5. generate the PDF report
//   6. check the popup shows the expiry notice
//   7. store the report for 24 hours and check the link works
//
// Screenshots are written to logs/ui-report/ so the result can be
// inspected.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
// The dev server picks the next free port when 5173 is taken, so the
// port is discovered rather than hard-coded. Set APP_PORT to override.
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve('logs/ui-report');
const SAMPLE = path.resolve('logs/test-upload-orders.php');

/** Find the dev server: the explicit port, then the usual Vite ports. */
const findApp = async () => {
  const candidates = [
    process.env.APP_PORT,
    '5173', '5174', '5175', '5176', '4173',
  ].filter(Boolean);
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

let APP = null;
fs.mkdirSync(OUT, { recursive: true });

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  screenshot: ${file}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  APP = await findApp();
  console.log('dev server:', APP);
  const email = `ui-report-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';

  // ---- Create the account through the API ------------------------------
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'UI', lastName: 'Report', email, password }),
  });
  console.log('register:', reg.status);
  if (!reg.ok) {
    console.error('registration failed:', await reg.text());
    process.exit(1);
  }

  // The app gates the scanner behind a completed onboarding, so the
  // test account is marked as done through the same endpoint the tour
  // uses.
  const jwt = (await reg.json()).data.token;
  const onboarding = await fetch(`${API}/auth/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ experience: 'tester', languages: ['php'], securityFocus: 'general' }),
  });
  console.log('onboarding:', onboarding.status);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('favicon')) {
      console.log('  [browser error]', text.slice(0, 200));
    }
  });

  try {
    // ---- 1. Log in ------------------------------------------------------
    console.log('\n[1] log in');
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 20000 });

    const inputs = await page.$$('input');
    for (const input of inputs) {
      const type = await input.evaluate((el) => el.type);
      const name = await input.evaluate((el) => el.name || el.id || '');
      if (type === 'email') await input.type(email);
      else if (type === 'password') await input.type(password);
      else if (name.toLowerCase().includes('email')) await input.type(email);
    }

    await shot(page, '01-login');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
      page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          /sign in|log in/i.test(b.textContent || '')
        );
        btn?.click();
      }),
    ]);
    await sleep(1500);
    console.log('  after login url:', page.url());

    // ---- 2. Open the scanner -------------------------------------------
    console.log('\n[2] open the scanner');
    await page.goto(`${APP}/owasp`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="file"]', { timeout: 20000 });
    console.log('  url:', page.url());

    // ---- 3. Upload the file --------------------------------------------
    console.log('\n[3] upload the source file');
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(SAMPLE);
    await sleep(2000);

    const editorText = await page.$eval('textarea', (el) => el.value.slice(0, 120));
    console.log('  editor now contains:', JSON.stringify(editorText.slice(0, 80)));

    const chipText = await page.evaluate(() => {
      const el = [...document.querySelectorAll('span')].find((s) =>
        s.textContent.includes('test-upload-orders.php')
      );
      return el ? el.textContent.trim() : null;
    });
    console.log('  file chip:', chipText);

    // The language should have been detected as PHP.
    const detectedLanguage = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((s) =>
        s.children.length === 0 && s.textContent.trim() === 'PHP'
      );
      return el ? 'PHP' : null;
    });
    console.log('  language detected:', detectedLanguage);

    await shot(page, '02-uploaded');

    // ---- 4. Run the scan -------------------------------------------------
    console.log('\n[4] run the scan');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /run owasp scan/i.test(b.textContent || '')
      );
      btn?.click();
    });

    await page.waitForFunction(
      () => /Generate PDF report/i.test(document.body.innerText),
      { timeout: 60000 }
    );
    console.log('  scan finished, PDF button visible');

    const summary = await page.evaluate(() => {
      const text = document.body.innerText;
      const score = text.match(/(\d+)\s*\/\s*100/);
      return { score: score ? score[0] : null };
    });
    console.log('  score shown:', summary.score);

    await shot(page, '03-scan-results');

    // ---- 5. Generate the PDF --------------------------------------------
    console.log('\n[5] generate the PDF report');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /generate pdf report/i.test(b.textContent || '')
      );
      btn?.click();
    });

    await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await sleep(1200);

    const dialogText = await page.$eval('[role="dialog"]', (el) => el.innerText);
    console.log('  popup shows the expiry notice:',
      /24 hours/i.test(dialogText));
    console.log('  popup mentions the source code:',
      /contains your source code/i.test(dialogText));
    console.log('  popup title:', (await page.$eval('[role="dialog"] h3', (el) => el.textContent)));

    await shot(page, '04-report-popup');

    // ---- 6. Store the report for 24 hours --------------------------------
    console.log('\n[6] store the report for 24 hours');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /store for 24 hours/i.test(b.textContent || '')
      );
      btn?.click();
    });

    await page.waitForFunction(
      () => /shareable link created/i.test(document.body.innerText),
      { timeout: 30000 }
    );
    await sleep(1500);

    const link = await page.$eval('input[aria-label="Report download link"]', (el) => el.value);
    console.log('  download link:', link);

    const storedText = await page.$eval('[role="dialog"]', (el) => el.innerText);
    console.log('  shows a countdown:', /Deleted in \d\d:\d\d:\d\d/.test(storedText));

    await shot(page, '05-report-stored');

    // The link must actually serve the PDF.
    const pdf = await fetch(link);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    console.log('  link status:', pdf.status);
    console.log('  content-type:', pdf.headers.get('content-type'));
    console.log('  is a PDF:', bytes.slice(0, 5).toString() === '%PDF-');
    console.log('  size:', bytes.length, 'bytes');

    fs.writeFileSync(path.join(OUT, 'downloaded-report.pdf'), bytes);

    // ---- 7. Close the popup ---------------------------------------------
    console.log('\n[7] close the popup');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[role="dialog"] button')].find((b) =>
        /close/i.test(b.textContent || '') || b.getAttribute('aria-label') === 'Close'
      );
      btn?.click();
    });
    await sleep(600);
    const stillOpen = await page.$('[role="dialog"]');
    console.log('  popup closed:', stillOpen === null);

    console.log('\nBrowser flow finished.');
  } catch (error) {
    console.error('\nFAILED:', error.message);
    await shot(page, 'zz-failure').catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
