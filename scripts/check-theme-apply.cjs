#!/usr/bin/env node
/**
 * Checks whether the stored theme is applied on load.
 *
 * The theme is read once, when the app mounts, so the check reads the
 * stored value and the applied class together.
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

  for (const stored of ['dark', 'light', 'system']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1500);

    await page.evaluate((value) => localStorage.setItem('project-eric_theme', value), stored);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2200);

    const out = await page.evaluate(() => ({
      stored: localStorage.getItem('project-eric_theme'),
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      hasDark: document.documentElement.classList.contains('dark'),
      hasLight: document.documentElement.classList.contains('light'),
    }));
    console.log(`stored="${stored}" -> ${JSON.stringify(out)}`);
    await context.close();
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});