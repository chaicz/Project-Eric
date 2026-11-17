#!/usr/bin/env node
/**
 * Dark-mode *visibility* audit (not just contrast).
 *
 * Contrast checks whether text is readable against the background it
 * sits on. This script checks whether anything is actually *shown*:
 *
 *   - `invisible`  text painted at (or near) zero opacity
 *   - `clipped`    text scrolled out of a clipping ancestor
 *   - `zero-size`  text with a zero-width or zero-height box
 *   - `behind`     text fully covered by an opaque overlapping element
 *   - `same-color` text whose colour resolves to the same colour as the
 *                 background it sits on (zero contrast, but not a
 *                 transparent colour)
 *
 * The transparent editor overlays (`.code-overlay-textarea`) are
 * ignored: they are invisible input proxies layered over a
 * syntax-highlighted `<pre>` that paints the real text.
 *
 *   node scripts/dark-mode-visibility-audit.cjs
 *   node scripts/dark-mode-visibility-audit.cjs --shots
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const OUT = path.resolve(__dirname, '..', 'logs', 'dark-mode-visibility');
const SHOT_DIR = path.resolve(__dirname, '..', 'reports', 'dark-mode-visibility-shots');

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

const argv = process.argv.slice(2);
const WANT_SHOTS = argv.includes('--shots');
const ONLY = (() => {
  const i = argv.indexOf('--routes');
  return i !== -1 && argv[i + 1] ? argv[i + 1].split(',').map((s) => s.trim()) : null;
})();

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

const VISIBILITY_ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-visibility-engine.js'),
  'utf8'
);

/** Redirects the API calls to the mock server. */
async function interceptApi(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
      const rewritten = url.replace(
        /https?:\/\/localhost\/project-eric-api/,
        'http://127.0.0.1:5299/project-eric-api'
      );
      req.continue({ url: rewritten });
      return;
    }
    req.continue();
  });
}

async function newPage(browser, auth) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument(
    (user, token) => {
      try {
        if (token) localStorage.setItem('token', token);
        if (user) localStorage.setItem('project-eric_user', JSON.stringify(user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
        localStorage.setItem('project-eric_theme', 'dark');
      } catch {
        /* ignore */
      }
    },
    auth ? SEED_USER : null,
    auth ? 'mock-token' : null
  );
  // The AppContext re-validates the stored token against the API on boot
  // and signs the user out when the call fails, so every API request has
  // to reach the mock server for the seeded session to survive.
  await interceptApi(page);
  return { context, page };
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error('Chrome not found at ' + CHROME);
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  if (WANT_SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });

  const routes = ONLY
    ? ROUTES.filter((r) => ONLY.some((p) => r.path.includes(p)))
    : ROUTES;
  const findings = [];
  const perRoute = {};

  for (const route of routes) {
    const { context, page } = await newPage(browser, route.auth);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    try {
      await page.goto(BASE + route.path, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(1600);
      await page.evaluate(() => {
        localStorage.setItem('project-eric_theme', 'dark');
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      });
      await sleep(400);

      const isDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      const rows = await page.evaluate(VISIBILITY_ENGINE + '\n;auditVisibility();');
      const landedOn = await page.evaluate(() => location.pathname + location.search);
      const redirected =
        !route.path.includes('?') && landedOn.replace(/\/$/, '') !== route.path.replace(/\/$/, '');

      const bad = rows.filter((r) => r.problem);
      perRoute[route.path] = {
        darkClassApplied: isDark,
        landedOn,
        redirected,
        total: rows.length,
        problems: bad,
        errors: errors.slice(0, 10),
      };
      for (const r of bad) findings.push({ route: route.path, ...r });

      if (WANT_SHOTS && !redirected) {
        const name = route.path.replace(/[/?=&]/g, '_').replace(/^_/, '') || 'root';
        await page.screenshot({
          path: path.join(SHOT_DIR, `${name}.png`),
          fullPage: true,
        });
      }

      const status = redirected ? 'SKIP' : bad.length === 0 ? 'OK  ' : 'FAIL';
      console.log(
        `[${status}] ${route.path.padEnd(28)} dark=${isDark ? 'y' : 'n'} ` +
          `texts=${String(rows.length).padStart(4)} problems=${String(bad.length).padStart(3)}` +
          (redirected ? `  REDIRECTED->${landedOn}` : '') +
          (errors.length ? `  jsErrors=${errors.length}` : '')
      );
    } catch (err) {
      console.log(`[FAIL] ${route.path.padEnd(28)} ${err.message}`);
      perRoute[route.path] = { error: err.message, problems: [], total: 0 };
    } finally {
      await context.close();
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(OUT, 'visibility-report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), perRoute, findings }, null, 2)
  );

  console.log('\n================ DARK MODE VISIBILITY PROBLEMS ================\n');
  const grouped = new Map();
  for (const f of findings) {
    const key = `${f.problem}|${f.tag}|${f.className}|${f.color}|${f.bg}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(f);
  }
  for (const [key, list] of grouped) {
    const f = list[0];
    console.log(
      `${String(f.problem).toUpperCase().padEnd(11)} ratio=${String(f.ratio ?? '-').padStart(6)}  routes=${list.length}`
    );
    console.log(`   tag=${f.tag}  color=${f.color}  bg=${f.bg}`);
    console.log(`   class="${f.className}"`);
    console.log(`   text="${f.text}"`);
    console.log(`   pages: ${[...new Set(list.map((x) => x.route))].join(', ')}`);
    console.log('');
  }
  console.log(`\nTOTAL findings: ${findings.length}`);
  console.log(`TOTAL unique selectors: ${grouped.size}`);
  console.log(`Report: ${path.join(OUT, 'visibility-report.json')}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
