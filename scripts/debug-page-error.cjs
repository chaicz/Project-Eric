#!/usr/bin/env node
/**
 * Loads a page and reports the first error that breaks it, together
 * with what actually rendered.
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5200';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTE = process.argv[2] || '/team';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem(
      'project-eric_user',
      JSON.stringify({ id: 113, name: 'Developer', email: 'developer@gmail.com', role: 'admin', onboardingComplete: true })
    );
    localStorage.setItem('project-eric_theme', 'dark');
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api/.test(url)) {
      req.continue({
        url: url.replace(
          /https?:\/\/localhost\/project-eric-api/,
          'http://127.0.0.1:5299/project-eric-api'
        ),
      });
      return;
    }
    req.continue();
  });

  let firstError = null;
  page.on('pageerror', (e) => {
    if (!firstError) firstError = String(e.stack || e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !firstError) {
      firstError = m.text();
    }
  });

  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2800);

  const body = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, ' ').slice(0, 320)
  );

  console.log(`route: ${ROUTE}`);
  console.log('error:', firstError ? firstError.slice(0, 700) : '(none captured)');
  console.log('body :', body);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});