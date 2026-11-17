#!/usr/bin/env node
/**
 * Lists every measured text on a route with its resolved background, so
 * a dark-mode finding can be traced to the element that produced it.
 *
 * node scripts/inspect-page.cjs /forgot-password --signed-out
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/forgot-password';
const authed = !process.argv.includes('--signed-out');

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

const ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-contrast-engine.js'),
  'utf8'
);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument((user, token, useAuth) => {
    try {
      if (useAuth) {
        localStorage.setItem('token', token);
        localStorage.setItem('project-eric_user', JSON.stringify(user));
      }
      localStorage.setItem('eric_welcome_tour_seen', 'true');
      localStorage.setItem('project-eric_theme', 'dark');
    } catch { /* ignore */ }
  }, SEED_USER, 'mock-token', authed);

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(1800);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(500);

  const rows = await page.evaluate(ENGINE + '\n;auditText();');
  const bad = rows.filter((r) => r.problem);

  console.log(`Route: ${route}  total=${rows.length}  problems=${bad.length}\n`);
  for (const r of bad) {
    console.log(`[${r.problem}] ratio=${r.ratio} (need ${r.required}) size=${r.fontSize}px w=${r.weight}`);
    console.log(`  color=${r.color}  bg=${r.bg}`);
    console.log(`  class="${r.className}"`);
    console.log(`  text="${r.text}"`);
    console.log(`  at (${r.x}, ${r.y})`);
    console.log('');
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
