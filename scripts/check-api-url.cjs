#!/usr/bin/env node
/**
 * Reports the request URL the app builds, before any interception.
 *
 * The API base URL is built from an environment variable, and a stray
 * space in that value ends up as `%20` in every request path — which
 * is invisible once a browser has decoded it.
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const seen = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('project-eric-api') || url.includes(':5299/')) {
      seen.push(url);
    }
  });

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(1500);

  // Read the built endpoint straight out of the module the app uses.
  const built = await page.evaluate(async () => {
    const mod = await import('/src/services/api.js');
    const base = mod.API_ENDPOINTS.AUTH.LOGIN;
    return {
      login: base,
      codes: base.split('').map((c) => c.charCodeAt(0)),
      hasSpace: /\s/.test(base),
    };
  });
  console.log('AUTH.LOGIN as built by the app:');
  console.log('  value:', built.login);
  console.log('  codes:', built.codes.join(','));
  console.log('  space?:', built.hasSpace);

  console.log('\nrequest URLs the browser produced:');
  for (const url of [...new Set(seen)]) {
    console.log('  ' + url);
  }
  if (!seen.length) console.log('  (none yet)');

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});