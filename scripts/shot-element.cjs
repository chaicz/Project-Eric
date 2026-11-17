#!/usr/bin/env node
/**
 * Takes a cropped screenshot of one element on a route, so a small
 * region (a code panel, a card) can be inspected at full resolution.
 *
 *   node scripts/shot-element.cjs /landing "pre.text-slate-300" 2
 *   node scripts/shot-element.cjs /dashboard "section:has(h3)" 0
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const SHOT_DIR = path.resolve(__dirname, '..', 'reports', 'dark-mode-visibility-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/landing';
const selector = process.argv[3] || 'body';
const index = Number(process.argv[4] || 0);

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((user, token) => {
    try {
      localStorage.setItem('token', token);
      localStorage.setItem('project-eric_user', JSON.stringify(user));
      localStorage.setItem('eric_welcome_tour_seen', 'true');
      localStorage.setItem('project-eric_theme', 'dark');
    } catch { /* ignore */ }
  }, SEED_USER, 'mock-token');

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
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

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2200);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(800);

  const handles = await page.$$(selector);
  if (!handles[index]) {
    console.error(`No element for selector "${selector}" at index ${index} (found ${handles.length})`);
    await browser.close();
    process.exit(1);
  }
  const name = `${route.replace(/[/?=&]/g, '_').replace(/^_/, '') || 'root'}-${index}`;
  const file = path.join(SHOT_DIR, `${name}.png`);
  await handles[index].screenshot({ path: file });
  console.log('screenshot:', file);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
