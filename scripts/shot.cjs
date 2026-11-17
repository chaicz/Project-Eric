#!/usr/bin/env node
/**
 * Takes a screenshot of a route in dark mode, so a finding can be
 * checked against what a person actually sees.
 *
 * node scripts/shot.cjs /forgot-password out.png
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/forgot-password';
const out = process.argv[3] || 'shot.png';
// Auth pages have to be visited signed out, otherwise the router
// redirects them to the dashboard and the screenshot shows the wrong
// screen.
const authed = process.argv[4] !== '--signed-out';

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

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

  const target = path.resolve(__dirname, '..', 'logs', out);
  await page.screenshot({ path: target, fullPage: true });
  console.log('Saved ' + target);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
