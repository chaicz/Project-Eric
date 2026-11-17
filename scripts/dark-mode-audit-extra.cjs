#!/usr/bin/env node
/**
 * Audits a route that the standard audit skips because it redirects,
 * forcing the router to stay on the requested path.
 *
 * The onboarding page needs a signed-in user whose onboarding is NOT
 * complete; the seeded user in the other scripts has finished it, so
 * `/onboarding` bounces to `/dashboard`.
 *
 *   node scripts/dark-mode-audit-extra.cjs /onboarding
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/onboarding';
const ONBOARDING = process.argv.includes('--onboarding');

const CONTRAST_ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-contrast-engine.js'),
  'utf8'
);
const VISIBILITY_ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-visibility-engine.js'),
  'utf8'
);

const SEED_USER = {
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

  await page.evaluateOnNewDocument(
    (user, token, needsOnboarding) => {
      try {
        localStorage.setItem('token', token);
        localStorage.setItem('project-eric_user', JSON.stringify(user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
        localStorage.setItem('project-eric_theme', 'dark');
        if (needsOnboarding) {
          // The onboarding state is scoped to the account, so the key
          // carries the user id: `project-eric_onboarding:113`.
          localStorage.setItem(
            `project-eric_onboarding:${user.id}`,
            JSON.stringify({ step: 1, totalSteps: 5, data: {} })
          );
        }
      } catch {
        /* ignore */
      }
    },
    SEED_USER,
    'mock-token',
    ONBOARDING
  );

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
      const target = url.replace(
        /https?:\/\/localhost\/project-eric-api/,
        'http://127.0.0.1:5299/project-eric-api'
      );

      // The app re-validates the session on boot and replaces the cached
      // user with the server's copy. The server says the onboarding is
      // already done, so the router would bounce `/onboarding` straight
      // back to `/dashboard`. Answer that one call with a user whose
      // onboarding is still outstanding.
      if (ONBOARDING && /auth\/validate/i.test(target)) {
        const cors = {
          'access-control-allow-origin': 'http://127.0.0.1:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        };

        // The preflight has to be answered as well, otherwise the
        // browser refuses the real request.
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: cors, body: '' });
          return;
        }

        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({
            user: { ...SEED_USER, onboardingComplete: false },
            valid: true,
          }),
        });
        return;
      }

      req.continue({ url: target });
      return;
    }
    req.continue();
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2200);
  await page.evaluate(() => {
    localStorage.setItem('project-eric_theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(500);

  const landedOn = await page.evaluate(() => location.pathname + location.search);

  // The onboarding tour has five steps and every step paints its own
  // gradient, so each one has to be measured on its own.
  const steps = ONBOARDING ? 5 : 1;
  const allContrast = [];
  const allVisibility = [];

  for (let step = 0; step < steps; step += 1) {
    if (step > 0) {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const next = buttons.find((b) => /^(Next|Get Started)/.test(b.textContent.trim()));
        if (next) next.click();
      });
      await sleep(900);
    }

    const contrast = await page.evaluate(CONTRAST_ENGINE + '\n;auditText();');
    const visibility = await page.evaluate(VISIBILITY_ENGINE + '\n;auditVisibility();');
    for (const r of contrast) allContrast.push({ ...r, step });
    for (const r of visibility) allVisibility.push({ ...r, step });
  }

  const contrastBad = allContrast.filter((r) => r.problem);
  const visibilityBad = allVisibility.filter((r) => r.problem);

  console.log(`route=${route} landedOn=${landedOn}`);
  console.log(`contrast: ${allContrast.length} texts, ${contrastBad.length} problems`);
  console.log(`visibility: ${allVisibility.length} texts, ${visibilityBad.length} problems`);
  if (errors.length) {
    console.log(`\nJS errors (${errors.length}):`);
    for (const e of [...new Set(errors)].slice(0, 10)) console.log('  - ' + e);
  }
  for (const r of [...contrastBad, ...visibilityBad]) {
    console.log(
      `  [step ${r.step + 1}] [${r.problem}] ${r.tag} "${r.text.slice(0, 60)}" color=${r.color} bg=${r.bg} ratio=${r.ratio}`
    );
  }

  await page.screenshot({
    path: path.resolve(__dirname, '..', 'reports', 'dark-mode-visibility-shots', `extra${route.replace(/\W/g, '_')}.png`),
    fullPage: true,
  });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
