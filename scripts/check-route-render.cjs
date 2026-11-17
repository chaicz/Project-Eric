#!/usr/bin/env node
/**
 * Verifies that every route really rendered its own content.
 *
 * The dark-mode audit counts text nodes, so a page that never mounted
 * (a redirect, a loading spinner, an error boundary) looks deceptively
 * clean. This script records what each route actually displayed, so a
 * silent failure cannot hide behind a low problem count.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  { path: '/landing', auth: false },
  { path: '/login', auth: false },
  { path: '/signup', auth: false },
  { path: '/forgot-password', auth: false },
  { path: '/terms-of-service', auth: false },
  { path: '/privacy-policy', auth: false },
  { path: '/viewer', auth: false },
  { path: '/about-team', auth: true },
  { path: '/dashboard', auth: true },
  { path: '/security', auth: true },
  { path: '/security?tab=findings', auth: true },
  { path: '/security?tab=threats', auth: true },
  { path: '/security?tab=reports', auth: true },
  { path: '/team', auth: true },
  { path: '/api-keys', auth: true },
  { path: '/audit-logs', auth: true },
  { path: '/notifications', auth: true },
  { path: '/settings', auth: true },
  { path: '/profile', auth: true },
  { path: '/sandbox', auth: true },
  { path: '/owasp', auth: true },
  { path: '/owasp-analysis', auth: true },
  { path: '/ide', auth: true },
];

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

  const results = [];

  for (const route of ROUTES) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    await page.evaluateOnNewDocument((user, token) => {
      try {
        localStorage.setItem('token', token);
        localStorage.setItem('project-eric_user', JSON.stringify(user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
        localStorage.setItem('project-eric_theme', 'dark');
      } catch { /* ignore */ }
    }, SEED_USER, 'mock-token');

    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    try {
      await page.goto(BASE + route.path, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(1800);
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      });
      await sleep(400);

      const info = await page.evaluate(() => {
        const body = document.body;
        const text = body.innerText || '';
        // A visible spinner or "Loading" text means the page never got
        // its data.
        const loading = /loading|please wait|spinner/i.test(text.slice(0, 400));
        const hasErrorBoundary = !!document.querySelector('[data-error-boundary]');
        const headings = Array.from(document.querySelectorAll('h1,h2'))
          .map((h) => h.innerText.trim())
          .filter(Boolean)
          .slice(0, 6);
        const buttons = document.querySelectorAll('button').length;
        const inputs = document.querySelectorAll('input,textarea,select').length;
        const tables = document.querySelectorAll('table').length;
        const cards = document.querySelectorAll('[class*="card"],[class*="Card"]').length;
        return {
          url: location.pathname + location.search,
          chars: text.replace(/\s+/g, ' ').trim().length,
          headings,
          buttons,
          inputs,
          tables,
          cards,
          loading,
          hasErrorBoundary,
          snippet: text.replace(/\s+/g, ' ').trim().slice(0, 180),
        };
      });

      const redirected = info.url !== route.path && !route.path.includes('?');
      const flag = redirected ? 'REDIRECT' : info.chars < 200 ? 'THIN' : 'OK';

      results.push({ route: route.path, flag, ...info, errors });

      console.log(
        `[${flag.padEnd(8)}] ${route.path.padEnd(26)} -> ${info.url.padEnd(26)} ` +
          `chars=${String(info.chars).padStart(5)} btn=${String(info.buttons).padStart(3)} ` +
          `inp=${String(info.inputs).padStart(3)} tbl=${String(info.tables).padStart(2)} ` +
          `card=${String(info.cards).padStart(3)} err=${errors.length}`
      );
      if (info.headings.length) console.log(`           headings: ${info.headings.join(' | ')}`);
      if (info.loading) console.log(`           !! page still shows a loading state`);
      if (info.snippet) console.log(`           text: ${info.snippet}`);
      errors.slice(0, 4).forEach((e) => console.log(`           ERR: ${e.slice(0, 160)}`));
    } catch (err) {
      console.log(`[FAIL    ] ${route.path.padEnd(26)} ${err.message}`);
      results.push({ route: route.path, flag: 'FAIL', error: err.message, errors });
    } finally {
      await context.close();
    }
  }

  await browser.close();
  fs.writeFileSync(
    path.resolve(__dirname, '..', 'logs', 'dark-mode-audit', 'route-render-check.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
  );
  console.log('\nReport: logs/dark-mode-audit/route-render-check.json');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
