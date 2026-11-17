#!/usr/bin/env node
/**
 * Project Eric - dark-mode text visibility audit.
 *
 * Walks every route of the app in dark mode and measures the real
 * rendered contrast of every piece of visible text against the
 * background it actually sits on.
 *
 * Method
 * ------
 * For each text node we walk up the ancestor chain, blending every
 * background colour (including alpha) that is painted behind it until
 * we reach an opaque one. The effective background is then compared with
 * the text colour using the WCAG 2.1 relative-luminance formula.
 *
 * Reported problems
 * -----------------
 *   - `invisible`   text whose contrast against its background is below
 *                   1.5:1 - effectively unreadable (this is the
 *                   "I cannot see the text" class of bug)
 *   - `low`         below the WCAG AA threshold for its size
 *                   (4.5:1 normal, 3:1 for large/bold text)
 *   - `transparent` a text colour that resolves to fully transparent, so
 *                   the text is painted in nothing
 *
 * Routes that redirect
 * --------------------
 * A route that lands somewhere else was never measured, so the audit
 * reports it as `SKIP` rather than as clean. The redirects the app
 * intends are listed as `expectRedirect` on the route, and those count
 * as measured.
 *
 * The onboarding tour
 * -------------------
 * `/onboarding` needs a signed-in user whose onboarding is not finished,
 * and the session re-validation on boot has to be answered with such a
 * user - the server says the tour was already done, and the app would
 * redirect the page to `/dashboard` before it could be measured. All
 * five steps of the tour are walked, because each step paints its own
 * gradient.
 *
 *   node scripts/dark-mode-audit.cjs
 *   node scripts/dark-mode-audit.cjs --routes /dashboard,/settings
 *   node scripts/dark-mode-audit.cjs --shots
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5173';
const MOCK_API = 'http://127.0.0.1:5299/project-eric-api/api';
const OUT = path.resolve(__dirname, '..', 'logs', 'dark-mode-audit');
const SHOT_DIR = path.resolve(__dirname, '..', 'reports', 'dark-mode-shots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const ROUTES = [
  { path: '/landing', auth: false },
  { path: '/login', auth: false },
  { path: '/signup', auth: false },
  { path: '/forgot-password', auth: false },
  { path: '/terms-of-service', auth: false },
  { path: '/privacy-policy', auth: false },
  { path: '/viewer', auth: false },
  // The tour needs a signed-in user whose onboarding is not finished,
  // otherwise the router bounces the page straight back to `/landing`.
  { path: '/onboarding', auth: true, onboarding: true },
  { path: '/about-team', auth: true },
  { path: '/dashboard', auth: true },
  // `/security` opens on the findings tab, so the router redirects the
  // bare path to `/security?tab=findings`. That is the intended
  // landing, not a mis-routed page, so the redirect is expected and
  // the tab is audited separately below.
  { path: '/security', auth: true, expectRedirect: '/security?tab=findings' },
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

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const argVal = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  if (i === -1 || i === argv.length - 1) return fallback;
  return argv[i + 1];
};
const WANT_SHOTS = argv.includes('--shots');
const ONLY = argVal('--routes');
const ROUTES_TO_RUN = ONLY
  ? ROUTES.filter((r) => ONLY.split(',').some((p) => r.path.includes(p.trim())))
  : ROUTES;

// ---------------------------------------------------------------------------
// Colour maths (runs inside the page)
/**
 * The contrast engine lives in its own file so it can be handed to
 * `page.evaluate` as plain source — no template-string escaping.
 */
const CONTRAST_ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-contrast-engine.js'),
  'utf8'
);

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

const findings = [];
const perRoute = {};

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

/**
 * The user used for the onboarding page: signed in, but the tour has
 * not been finished, so the router keeps them on `/onboarding`.
 */
const SEED_USER_ONBOARDING = {
  ...SEED_USER,
  onboardingComplete: false,
};

async function newPage(browser, { auth, dark, onboarding }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  await page.evaluateOnNewDocument(
    (user, token, isDark, needsOnboarding) => {
      try {
        // The token is only written for the pages that need a signed-in
        // session. Seeding it everywhere made the auth pages redirect
        // to the dashboard, so they were never actually audited.
        if (token) localStorage.setItem('token', token);
        if (user) localStorage.setItem('project-eric_user', JSON.stringify(user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
        localStorage.setItem('project-eric_theme', isDark ? 'dark' : 'light');
        if (needsOnboarding) {
          // The onboarding answers are scoped to the account, so the key
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
    auth ? (onboarding ? SEED_USER_ONBOARDING : SEED_USER) : null,
    auth ? 'mock-token' : null,
    dark,
    onboarding
  );

  return { context, page };
}

/**
 * Redirects the API calls to the mock server.
 *
 * When `onboarding` is set, the session re-validation on boot is
 * answered with a user whose onboarding is still outstanding. The mock
 * server says the tour was already finished, and the app would replace
 * the cached user with that copy and redirect `/onboarding` back to
 * `/dashboard` before the page could be measured.
 */
async function interceptApi(page, { onboarding = false } = {}) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
      const rewritten = url.replace(
        /https?:\/\/localhost\/project-eric-api/,
        'http://127.0.0.1:5299/project-eric-api'
      );

      if (onboarding && /auth\/validate/i.test(rewritten)) {
        const cors = {
          'access-control-allow-origin': 'http://127.0.0.1:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        };

        // The preflight has to be answered too, or the browser refuses
        // the real request.
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: cors, body: '' });
          return;
        }

        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({
            user: { ...SEED_USER_ONBOARDING },
            valid: true,
          }),
        });
        return;
      }

      req.continue({ url: rewritten });
      return;
    }
    req.continue();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  for (const route of ROUTES_TO_RUN) {
    const { context, page } = await newPage(browser, {
      auth: route.auth,
      dark: true,
      onboarding: route.onboarding,
    });
    await interceptApi(page, { onboarding: route.onboarding });

    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    try {
      const target = BASE + route.path;
      await page.goto(target, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(1400);

      // Force the document into dark mode.
      //
      // Two things fight this: the AppContext resolves the 'system'
      // theme from the OS preference (a headless browser reports
      // light), and some pages load the account's saved appearance
      // settings and overwrite the stored theme. The class is forced
      // directly and re-checked right before measuring, so a page that
      // re-applies the light theme cannot hide a light-mode result
      // behind a dark-mode report.
      await page.evaluate(() => {
        try {
          localStorage.setItem('project-eric_theme', 'dark');
        } catch {
          /* ignore */
        }
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      });
      await sleep(500);
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      });
      await sleep(200);

      const isDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );

      const rows = await page.evaluate(CONTRAST_ENGINE + '\n;auditText();');

      // The tour has five steps and each step paints its own gradient,
      // so every step has to be measured on its own.
      if (route.onboarding) {
        for (let step = 0; step < 4; step += 1) {
          await page.evaluate(() => {
            const buttons = [...document.querySelectorAll('button')];
            const next = buttons.find((b) => /^(Next|Get Started)/.test(b.textContent.trim()));
            if (next) next.click();
          });
          await sleep(900);
          const stepRows = await page.evaluate(CONTRAST_ENGINE + '\n;auditText();');
          for (const r of stepRows) rows.push({ ...r, step });
        }
      }

      // A page that redirected somewhere else was never measured. The
      // audit would report it as clean while checking the wrong screen.
      const landedOn = await page.evaluate(() => location.pathname + location.search);
      const normalize = (p) => p.replace(/\/$/, '');
      const redirected =
        !route.path.includes('?') &&
        normalize(landedOn) !== normalize(route.path) &&
        normalize(landedOn) !== normalize(route.expectRedirect || '');

      const bad = rows.filter((r) => r.problem);
      perRoute[route.path] = {
        darkClassApplied: isDark,
        landedOn,
        redirected,
        total: rows.length,
        problems: bad,
        errors: errors.slice(0, 10),
      };

      for (const r of bad) {
        findings.push({ route: route.path, ...r });
      }

      if (WANT_SHOTS) {
        const name =
          route.path.replace(/[/?=&]/g, '_').replace(/^_/, '') || 'root';
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

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  fs.writeFileSync(
    path.join(OUT, 'dark-mode-report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), perRoute, findings }, null, 2)
  );

  console.log('\n================ DARK MODE VISIBILITY PROBLEMS ================\n');

  const grouped = new Map();
  for (const f of findings) {
    const key = `${f.tag}|${f.className}|${f.color}|${f.bg}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(f);
  }

  const sorted = [...grouped.entries()].sort((a, b) => {
    const ra = a[1][0].ratio ?? 0;
    const rb = b[1][0].ratio ?? 0;
    return ra - rb;
  });

  for (const [key, list] of sorted) {
    const f = list[0];
    console.log(
      `${f.problem.toUpperCase().padEnd(11)} ratio=${String(f.ratio).padStart(6)} ` +
        `(need ${f.required})  routes=${list.length}`
    );
    console.log(`   tag=${f.tag}  color=${f.color}  bg=${f.bg}`);
    console.log(`   class="${f.className}"`);
    console.log(`   text="${f.text}"`);
    console.log(`   pages: ${[...new Set(list.map((x) => x.route))].join(', ')}`);
    console.log('');
  }

  console.log(`\nTOTAL findings: ${findings.length}`);
  console.log(`TOTAL unique selectors: ${sorted.length}`);
  console.log(`Report: ${path.join(OUT, 'dark-mode-report.json')}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
