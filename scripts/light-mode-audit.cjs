#!/usr/bin/env node
/**
 * Measures the text contrast of a route in LIGHT mode, so a change made
 * for dark mode can be checked for a light-mode regression.
 *
 *   node scripts/light-mode-audit.cjs /landing
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/landing';
const ONBOARDING = route.includes('onboarding');

const ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-contrast-engine.js'),
  'utf8'
);

const USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: !ONBOARDING,
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

  // The public pages (login, signup, landing) must NOT have a session —
  // the auth route redirects a signed-in visitor to the dashboard, so
  // the page would never be measured.
  const PUBLIC = ['/landing', '/login', '/signup', '/forgot-password',
    '/terms-of-service', '/privacy-policy', '/viewer'];

  await page.evaluateOnNewDocument((user, token, needsOnboarding, isPublic) => {
    try {
      if (!isPublic) {
        localStorage.setItem('token', token);
        localStorage.setItem('project-eric_user', JSON.stringify(user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
      }
      localStorage.setItem('project-eric_theme', 'light');
      if (needsOnboarding) {
        localStorage.setItem(
          `project-eric_onboarding:${user.id}`,
          JSON.stringify({ step: 1, totalSteps: 5, data: {} })
        );
      }
    } catch {
      /* ignore */
    }
  }, USER, 'mock-token', ONBOARDING, PUBLIC.includes(route));

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
      const target = url.replace(
        /https?:\/\/localhost\/project-eric-api/,
        'http://127.0.0.1:5299/project-eric-api'
      );
      if (ONBOARDING && /auth\/validate/i.test(target)) {
        const cors = {
          'access-control-allow-origin': 'http://127.0.0.1:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        };
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: cors, body: '' });
          return;
        }
        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({ user: { ...USER, onboardingComplete: false }, valid: true }),
        });
        return;
      }
      req.continue({ url: target });
      return;
    }
    req.continue();
  });

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2000);
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await sleep(600);

  const rows = await page.evaluate(ENGINE + '\n;auditText();');
  const bad = rows.filter((r) => r.problem);

  console.log(`route=${route} (light)  texts=${rows.length}  problems=${bad.length}`);
  for (const r of bad) {
    console.log(
      `  [${r.problem}] ${r.tag} "${r.text.slice(0, 55)}" color=${r.color} bg=${r.bg} ratio=${r.ratio} (need ${r.required})`
    );
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
