#!/usr/bin/env node
/**
 * Project Eric — interactive UI audit.
 *
 * Drives a real Chrome through every page of the app, exercises the
 * controls that are safe to touch, and reports:
 *
 *   - routes that do not render the page they advertise
 *   - buttons with no event handler behind them (a dead control)
 *   - form fields that are not bound to React state
 *   - JavaScript errors, failed requests and 4xx/5xx API responses
 *
 * The state seeding happens through `evaluateOnNewDocument`, so the
 * session is in place *before* the app's own scripts run. Seeding it
 * after `domcontentloaded` loses the race with the React boot effect,
 * which rewrites the cached user as `null` and bounces every protected
 * route back to the landing page.
 *
 *   node scripts/ui-audit.cjs              # all phases
 *   node scripts/ui-audit.cjs auth         # auth flows only
 *   node scripts/ui-audit.cjs routes       # protected routes only
 *   node scripts/ui-audit.cjs destructive  # write/delete flows only
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve(__dirname, '..', 'logs', 'ui-audit');

const DEMO = { email: 'demo@project-eric.com', password: 'demo123' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const findings = [];
const reports = {};

function addFinding(phase, route, severity, kind, message, extra) {
  findings.push({
    phase,
    route,
    severity,
    kind,
    message: String(message).slice(0, 600),
    extra: extra ? String(extra).slice(0, 600) : undefined,
  });
}

/** Errors that are noise from the tooling, not the app. */
const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /not wrapped in act/i,
  /React Router Future Flag/i,
  /\[vite\] connect/i,
  /\[vite\] hot updated/i,
  /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/i,
  /WebSocket connection to .* failed: Page entered Back-Forward Cache/i,
];

const isNoise = (text) => IGNORE_CONSOLE.some((re) => re.test(text));

// ---------------------------------------------------------------------------
// Route table — markers taken from the real copy in src/pages/*.jsx
// ---------------------------------------------------------------------------

const ROUTES = [
  { path: '/landing', auth: false, markers: ['SECURE CODE', 'Security-first IDE'] },
  { path: '/terms-of-service', auth: false, markers: ['Terms of Service'] },
  { path: '/privacy-policy', auth: false, markers: ['Privacy Policy'] },
  { path: '/viewer', auth: false, markers: ['Lite Viewer', 'room', 'Collab'] },
  { path: '/about-team', auth: true, markers: ['About Developer Team'] },
  { path: '/dashboard', auth: true, markers: ['Quick Actions', 'Recent Activity'] },
  { path: '/security', auth: true, markers: ['Security'] },
  { path: '/team', auth: true, markers: ['Pending Invitations', 'Invite Team Member'] },
  { path: '/api-keys', auth: true, markers: ['AI API Keys'] },
  { path: '/audit-logs', auth: true, markers: ['Audit Logs'] },
  { path: '/notifications', auth: true, markers: ['Notifications'] },
  { path: '/settings', auth: true, markers: ['Settings'] },
  { path: '/profile', auth: true, markers: ['Achievements', 'Project Activity'] },
  { path: '/sandbox', auth: true, markers: ['Hello, sandbox'] },
  { path: '/owasp', auth: true, markers: ['OWASP Security Scanner'] },
  { path: '/owasp-analysis', auth: true, markers: ['OWASP Top 10 Analysis'] },
  { path: '/ide', auth: true, markers: ['Run Project'] },
];

/**
 * Buttons that change or destroy account data. They are only run in the
 * destructive phase, against a throwaway account.
 */
const DESTRUCTIVE = /logout|log out|sign out|delete|remove|revoke|disconnect|deprovision|clear all|reset password|danger|demote|purge/i;

/**
 * Buttons that end the session or leave the page for good. Skipped
 * everywhere except the destructive phase.
 */
const SESSION_ENDING = /logout|log out|sign out/i;

/**
 * Controls that manage the local dev stack. The Live IDE page can stop
 * the Vite server that is serving the very page the button lives on, so
 * the audit must not press them: the run would take the app down with
 * it and every later route would fail for the wrong reason.
 */
const STACK_CONTROL = /stop stack|run project|stop project|start project|stop server|start server|restart/i;

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

let browser;

async function newPage({ seed = null, viewport = { width: 1600, height: 1000 }, promptValue = null } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);

  if (seed) {
    // Runs before any of the app's scripts on every navigation.
    await page.evaluateOnNewDocument((s) => {
      try {
        localStorage.setItem('token', s.token);
        localStorage.setItem('project-eric_user', JSON.stringify(s.user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
      } catch {
        /* not a real origin yet */
      }
    }, seed);
  }

  // Never let a native dialog stall the run.
  //
  // A prompt that asks for a value is answered with `promptValue` when the
  // caller supplied one, and dismissed otherwise. The API-key page asks
  // for the new key's name through a native prompt, so the create flow
  // only completes when the prompt is actually answered.
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt' && promptValue !== null) {
      await d.accept(promptValue).catch(() => {});
      return;
    }
    await d.dismiss().catch(() => {});
  });

  // New tabs opened by a control must not pile up.
  page.on('popup', (p) => p.close().catch(() => {}));

  return { context, page };
}

/** Attaches the console / network / error collectors to a page. */
function instrument(page) {
  const bucket = [];
  const listeners = [];

  const onConsole = (m) => {
    const type = m.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = m.text();
    if (isNoise(text)) return;
    bucket.push({ severity: type === 'error' ? 'error' : 'warn', kind: `console.${type}`, message: text });
  };
  const onPageError = (e) =>
    bucket.push({ severity: 'error', kind: 'pageerror', message: e.message, extra: e.stack });
  const onRequestFailed = (req) => {
    const f = req.failure();
    if (f && /ERR_ABORTED/i.test(f.errorText)) return;
    bucket.push({
      severity: 'error',
      kind: 'requestfailed',
      message: `${req.method()} ${req.url()}`,
      extra: f && f.errorText,
    });
  };
  const onResponse = async (res) => {
    const url = res.url();
    if (!/project-eric-api|localhost:5173\/api/.test(url)) return;
    if (res.status() < 400) return;
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* body already consumed */
    }
    bucket.push({
      severity: 'error',
      kind: `http.${res.status()}`,
      message: `${res.request().method()} ${url}`,
      extra: detail,
    });
  };

  listeners.push(
    ['console', page.on('console', onConsole)],
    ['pageerror', page.on('pageerror', onPageError)],
    ['requestfailed', page.on('requestfailed', onRequestFailed)],
    ['response', page.on('response', onResponse)]
  );

  return {
    bucket,
    drain() {
      const out = bucket.splice(0, bucket.length);
      return out;
    },
    detach() {
      listeners.forEach(([event, handler]) => page.off(event, handler));
    },
  };
}

/** Reads the visible text of the app, with whitespace collapsed. */
async function readText(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    return ((root && root.innerText) || '').replace(/\s+/g, ' ').trim();
  });
}

/** Is the dev server still serving? */
async function devServerAlive() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/** Signs in through the real login form and returns the session. */
async function loginViaUI(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await sleep(700);

  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);

  await Promise.all([
    page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await sleep(1200);

  return page.evaluate(() => ({
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('project-eric_user') || 'null'),
    path: location.pathname,
  }));
}

/** Creates an account through the public API and returns its session. */
async function registerViaAPI(email) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Audit', lastName: 'Tester', email, password: 'AuditTest123!' }),
  });
  const payload = await res.json();
  if (!payload?.data?.token) throw new Error(`register failed: ${JSON.stringify(payload).slice(0, 300)}`);
  return { token: payload.data.token, user: payload.data.user };
}

/** Marks onboarding complete so a fresh account can reach the app. */
async function completeOnboarding(token, data = {}) {
  const res = await fetch(`${API}/auth/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ experience: 'senior', languages: ['javascript'], securityFocus: ['A01'], ...data }),
  });
  const payload = await res.json();
  return payload?.data?.user || null;
}

// ---------------------------------------------------------------------------
// Control enumeration
// ---------------------------------------------------------------------------

/**
 * Runs in the page. Reports every visible control and whether React has
 * bound a handler to it.
 *
 * React stores the props of a DOM node under a `__reactProps$...` key.
 * Looking at that key tells us whether a button really has an onClick
 * behind it, which is how a control that cannot do anything gets found.
 */
async function enumerateControls(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };

    const reactProps = (el) => {
      const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      return key ? el[key] : null;
    };

    const cssPath = (el) => {
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 14) {
        if (node.id) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        let part = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
          const same = [...parent.children].filter((c) => c.tagName === node.tagName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };

    const describe = (el) => {
      const props = reactProps(el);
      const label =
        (el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.textContent ||
          el.getAttribute('placeholder') ||
          '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60) || '(unlabelled)';

      const tag = el.tagName.toLowerCase();
      const isLink = tag === 'a';
      const href = isLink ? el.getAttribute('href') || '' : '';
      const inForm = !!(el.form || el.closest('form'));
      const isSubmit = (el.getAttribute('type') || '').toLowerCase() === 'submit';

      const hasHandler = !!(
        props &&
        (props.onClick ||
          props.onMouseDown ||
          props.onMouseUp ||
          props.onKeyDown ||
          props.onChange ||
          props.onSubmit ||
          (isSubmit && inForm))
      );

      // A link with a real href does something even without an onClick.
      const linkDoesSomething = isLink && href && href !== '#' && !/^javascript:/i.test(href);

      const reactBound = !!props;

      return {
        tag,
        label,
        href,
        path: cssPath(el),
        disabled: !!el.disabled || props?.disabled === true,
        hasHandler,
        reactBound,
        linkDoesSomething,
        isSubmit,
        inForm,
        type: el.getAttribute('type') || '',
      };
    };

    const buttons = [...document.querySelectorAll('button, [role="button"], a[href]')]
      .filter(isVisible)
      .map(describe);

    const fields = [...document.querySelectorAll('input, textarea, select')]
      .filter(isVisible)
      .filter((el) => el.type !== 'hidden')
      .map((el) => {
        const props = reactProps(el);
        const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || el.type || '').trim();
        const bound = !!(props && (props.onChange || props.onInput || props.onBlur));
        const hasLabel =
          (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
          el.closest('label') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder');
        return {
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          label: label.slice(0, 50),
          bound,
          reactBound: !!props,
          hasLabel: !!hasLabel,
          disabled: !!el.disabled,
          path: cssPath(el),
        };
      });

    return { buttons, fields };
  });
}

// ---------------------------------------------------------------------------
// Phase: auth flows
// ---------------------------------------------------------------------------

async function phaseAuth() {
  console.log('\n=== PHASE 1: authentication flows ===');
  const results = {};

  // ---- 1a. empty submit shows validation errors --------------------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await sleep(600);
    await page.click('button[type="submit"]');
    await sleep(600);

    const text = await readText(page);
    const ok = /email is required/i.test(text) && /password is required/i.test(text);
    results.emptySubmit = ok;
    if (!ok) {
      addFinding('auth', '/login', 'error', 'validation', 'Empty login submit did not show field validation errors');
    }
    probe.detach();
    await context.close();
    console.log(`  empty submit validation ......... ${ok ? 'ok' : 'FAIL'}`);
  }

  // ---- 1b. wrong password shows an error --------------------------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await sleep(600);
    await page.type('input[type="email"]', 'demo@project-eric.com');
    await page.type('input[type="password"]', 'definitely-not-the-password');
    await page.click('button[type="submit"]');
    await page.waitForFunction(
      () => /invalid|incorrect|failed|wrong|not found|error/i.test(document.body.innerText),
      { timeout: 15000 }
    ).catch(() => {});
    await sleep(500);

    const text = await readText(page);
    const stillOnLogin = page.url().includes('/login');
    const hasMessage = /invalid|incorrect|failed|wrong|not found|error/i.test(text);
    results.badPassword = stillOnLogin && hasMessage;
    if (!results.badPassword) {
      addFinding(
        'auth',
        '/login',
        'error',
        'validation',
        `Wrong password was not rejected properly (stillOnLogin=${stillOnLogin}, message=${hasMessage})`
      );
    }
    probe.detach();
    await context.close();
    console.log(`  wrong password rejected ......... ${results.badPassword ? 'ok' : 'FAIL'}`);
  }

  // ---- 1c. correct password signs in ------------------------------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    const session = await loginViaUI(page, DEMO.email, DEMO.password);
    results.login = {
      ok: !!session.token && !page.url().includes('/login'),
      path: session.path,
      userId: session.user?.id,
    };
    if (!results.login.ok) {
      addFinding('auth', '/login', 'error', 'login', `Valid credentials did not start a session (ended on ${session.path})`);
    }
    probe.detach();
    await context.close();
    console.log(`  valid credentials sign in ........ ${results.login.ok ? 'ok' : 'FAIL'} (landed on ${session.path})`);
  }

  // ---- 1d. signup validation + registration -----------------------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await sleep(600);
    await page.click('button[type="submit"]');
    await sleep(600);

    const text = await readText(page);
    const validated = /required|valid|must|at least/i.test(text);
    results.signupValidation = validated;
    if (!validated) {
      addFinding('auth', '/signup', 'error', 'validation', 'Empty signup submit did not show validation errors');
    }
    probe.detach();
    await context.close();
    console.log(`  signup validation ................ ${validated ? 'ok' : 'FAIL'}`);
  }

  // ---- 1e. forgot password -----------------------------------------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    await page.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' });
    await sleep(900);
    const controls = await enumerateControls(page);
    const hasEmail = controls.fields.some((f) => f.type === 'email');
    results.forgotPassword = { hasEmail, buttons: controls.buttons.length };
    if (!hasEmail) {
      addFinding('auth', '/forgot-password', 'error', 'render', 'Forgot-password page has no email field');
    }
    probe.detach();
    await context.close();
    console.log(`  forgot password page ............. ${hasEmail ? 'ok' : 'FAIL'}`);
  }

  // ---- 1f. OAuth buttons hit the API ------------------------------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await sleep(900);
    const { buttons } = await enumerateControls(page);
    const oauth = buttons.filter((b) => /google|github/i.test(b.label));

    const oauthResults = [];
    for (const btn of oauth) {
      const seen = [];
      const onResponse = (res) => {
        if (/auth\/oauth/.test(res.url())) seen.push(`${res.status()} ${res.url()}`);
      };
      page.on('response', onResponse);
      try {
        await page.click(btn.path);
        await sleep(2500);
      } catch (err) {
        seen.push(`click failed: ${err.message}`);
      }
      page.off('response', onResponse);
      oauthResults.push({ provider: btn.label, calls: seen, path: page.url().replace(BASE, '') });
      if (!seen.length) {
        addFinding(
          'auth',
          '/login',
          'error',
          'feature',
          `The "${btn.label}" sign-in button never called the OAuth endpoint`
        );
      }
    }
    results.oauth = oauthResults;
    probe.detach();
    await context.close();
    console.log(`  OAuth buttons call the API ....... ${oauth.length} button(s), ${oauthResults.filter((r) => r.calls.length).length} reachable`);
  }

  // ---- 1g. the welcome tour can be started and finished -----------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    // No tour flag this time — the tour should open by itself.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await sleep(600);
    await page.type('input[type="email"]', DEMO.email);
    await page.type('input[type="password"]', DEMO.password);
    await page.click('button[type="submit"]');
    await sleep(2600);

    // The tour renders its step counter through a CSS `uppercase` class,
    // and `innerText` reflects that transform — so the text reads
    // "STEP 1 OF 8". The match has to be case-insensitive.
    const tourOpen = await page.evaluate(() => /step \d+ of \d+/i.test(document.body.innerText));
    let finished = false;
    if (tourOpen) {
      for (let i = 0; i < 12; i += 1) {
        const clicked = await page.evaluate(() => {
          const overlay = document.querySelector('.z-\\[60\\]');
          const scope = overlay || document;
          const btn = [...scope.querySelectorAll('button')].find((b) =>
            /start tour|next:|finish tour|got it/i.test(b.textContent || '')
          );
          if (btn) {
            btn.click();
            return true;
          }
          const skip = [...scope.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
          if (skip) {
            skip.click();
            return true;
          }
          return false;
        });
        if (!clicked) break;
        await sleep(800);
      }
      finished = !(await page.evaluate(() => /step \d+ of \d+/i.test(document.body.innerText)));
    }
    results.tour = { opened: tourOpen, finished };
    if (!tourOpen) {
      addFinding('auth', '/dashboard', 'error', 'feature', 'The welcome tour never opened for a first-time signed-in user');
    } else if (!finished) {
      addFinding('auth', '/dashboard', 'error', 'feature', 'The welcome tour could not be walked to the end');
    }
    probe.detach();
    await context.close();
    console.log(`  welcome tour opens & completes .... ${tourOpen ? (finished ? 'ok' : 'PARTIAL') : 'FAIL'}`);
  }

  reports.auth = results;
  return results;
}

// ---------------------------------------------------------------------------
// Phase: protected routes
// ---------------------------------------------------------------------------

async function phaseRoutes(session) {
  console.log('\n=== PHASE 2: route rendering, controls and errors ===');
  const routeReports = [];

  for (const route of ROUTES) {
    // The dev server can be stopped by a control on an earlier page. If it
    // is gone, every later route would report a wall of connection errors
    // that say nothing about the app, so check before starting.
    const alive = await devServerAlive();
    if (!alive) {
      addFinding(
        'routes',
        route.path,
        'error',
        'infrastructure',
        `The dev server was not answering when this route was audited (${BASE}) — this route was skipped`
      );
      routeReports.push({
        route: route.path,
        auth: route.auth,
        rendered: false,
        landedOn: null,
        heading: null,
        buttons: 0,
        dead: 0,
        fields: 0,
        unbound: 0,
        clicked: 0,
        skipped: 0,
        errors: 1,
        warnings: 0,
        note: 'dev server down',
      });
      console.log(`${route.path.padEnd(20)}SKIPPED (dev server down)`);
      continue;
    }

    const { context, page } = await newPage({
      seed: route.auth ? { token: session.token, user: session.user } : null,
    });
    const probe = instrument(page);

    process.stdout.write(`  ${route.path.padEnd(20)}`);

    let navOk = true;
    try {
      await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
      navOk = false;
      addFinding('routes', route.path, 'error', 'navigation', `Page load failed: ${err.message}`);
    }

    if (navOk) {
      // Wait until the route has actually painted something.
      await page
        .waitForFunction(
          (markers) => {
            const root = document.getElementById('root');
            const text = ((root && root.innerText) || '').replace(/\s+/g, ' ');
            return text.trim().length > 40 || markers.some((m) => text.includes(m));
          },
          { timeout: 15000 },
          route.markers
        )
        .catch(() => {});
      await sleep(1100);
    }

    const text = await readText(page);
    const markerFound = route.markers.some((m) => text.includes(m));
    const finalPath = page.url().replace(BASE, '') || '/';
    const heading = await page.evaluate(
      () => document.querySelector('h1, h2')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) || null
    );

    if (navOk && !markerFound) {
      addFinding(
        'routes',
        route.path,
        'error',
        'wrong-page',
        `Route did not render "${route.path}" — landed on ${finalPath}. Heading: ${heading}`,
        `text: ${text.slice(0, 200)}`
      );
    }
    if (navOk && text.length < 40) {
      addFinding('routes', route.path, 'error', 'render', `Page rendered almost nothing (${text.length} chars)`);
    }
    if (/Something went wrong|unexpected error/i.test(text)) {
      addFinding('routes', route.path, 'error', 'errorboundary', 'The error boundary caught an error', text.slice(0, 300));
    }

    // ---- control survey --------------------------------------------------
    let controls = { buttons: [], fields: [] };
    if (navOk) {
      controls = await enumerateControls(page);
    }

    const dead = controls.buttons.filter(
      (b) => !b.disabled && !b.hasHandler && !b.linkDoesSomething && !b.isSubmit
    );
    for (const d of dead) {
      addFinding(
        'routes',
        route.path,
        'error',
        'dead-control',
        `Control does nothing: <${d.tag}> "${d.label}" has no click handler and no link`,
        d.path
      );
    }

    const unbound = controls.fields.filter((f) => !f.bound && !f.disabled);
    for (const f of unbound) {
      addFinding(
        'routes',
        route.path,
        'warn',
        'unbound-field',
        `Form field "${f.label}" (${f.tag}/${f.type}) is not bound to React state`,
        f.path
      );
    }

    const unlabelled = controls.fields.filter((f) => !f.hasLabel);
    for (const f of unlabelled) {
      addFinding('routes', route.path, 'warn', 'unlabelled-field', `Form field "${f.label}" has no label`, f.path);
    }

    // ---- click every safe control ---------------------------------------
    const clicked = [];
    const skipped = [];
    for (const btn of controls.buttons) {
      if (btn.disabled) continue;
      if (SESSION_ENDING.test(btn.label)) continue;
      if (DESTRUCTIVE.test(btn.label)) continue;
      if (STACK_CONTROL.test(btn.label)) {
        skipped.push(btn.label);
        continue;
      }
      if (btn.tag === 'a' && btn.href && !btn.href.startsWith('/')) continue; // external
      if (btn.isSubmit) continue; // submitting would write data; covered in the destructive phase

      const before = probe.drain();
      const pathBefore = page.url();
      const toastBefore = await page.evaluate(() => document.querySelectorAll('[role="alert"]').length);

      try {
        await page.click(btn.path, { timeout: 6000 });
        await sleep(700);
      } catch (err) {
        clicked.push({ label: btn.label, result: 'not-clickable' });
        addFinding(
          'routes',
          route.path,
          'warn',
          'unreachable-control',
          `Control "${btn.label}" could not be clicked: ${err.message.split('\n')[0]}`,
          btn.path
        );
        continue;
      }

      const after = probe.drain();
      const toastAfter = await page.evaluate(() => document.querySelectorAll('[role="alert"]').length);
      const navigated = page.url() !== pathBefore;
      const toasted = toastAfter > toastBefore;

      for (const err of after) {
        addFinding('routes', route.path, err.severity, err.kind, `After clicking "${btn.label}": ${err.message}`, err.extra);
      }
      // Errors that were already queued before the click belong to the page.
      for (const err of before) {
        addFinding('routes', route.path, err.severity, err.kind, err.message, err.extra);
      }

      clicked.push({ label: btn.label, result: navigated ? 'navigated' : toasted ? 'toast' : 'clicked' });

      if (navigated) {
        // Put the app back where it was so the next control starts clean.
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(900);
      }
    }

    const errors = probe.drain();
    for (const e of errors) {
      addFinding('routes', route.path, e.severity, e.kind, e.message, e.extra);
    }

    routeReports.push({
      route: route.path,
      auth: route.auth,
      rendered: markerFound,
      landedOn: finalPath,
      heading,
      buttons: controls.buttons.length,
      dead: dead.length,
      fields: controls.fields.length,
      unbound: unbound.length,
      clicked: clicked.length,
      skipped: skipped.length,
      errors: errors.filter((e) => e.severity === 'error').length,
      warnings: errors.filter((e) => e.severity === 'warn').length,
    });

    console.log(
      `ok=${markerFound ? 'y' : 'N'} btn=${controls.buttons.length} dead=${dead.length} fields=${controls.fields.length} err=${errors.filter((e) => e.severity === 'error').length}`
    );

    probe.detach();
    await context.close();
  }

  reports.routes = routeReports;
  return routeReports;
}

// ---------------------------------------------------------------------------
// Phase: destructive flows (throwaway account)
// ---------------------------------------------------------------------------

async function phaseDestructive() {
  console.log('\n=== PHASE 3: write and delete flows ===');
  const results = {};

  const email = `audit.tester+${Date.now()}@project-eric.com`;
  let session;
  try {
    session = await registerViaAPI(email);
  } catch (err) {
    addFinding('destructive', '(api)', 'error', 'setup', `Could not create the throwaway account: ${err.message}`);
    return results;
  }
  results.account = email;

  const updated = await completeOnboarding(session.token);
  if (!updated) {
    addFinding('destructive', '(api)', 'error', 'setup', 'Could not complete onboarding for the throwaway account');
  }
  session.user = { ...session.user, ...(updated || {}), onboardingComplete: true };

  // ---- API key: create then delete --------------------------------------
  {
    const { context, page } = await newPage({
      seed: { token: session.token, user: session.user },
      promptValue: 'Audit Key',
    });
    const probe = instrument(page);
    await page.goto(`${BASE}/api-keys`, { waitUntil: 'domcontentloaded' });
    await sleep(1800);

    const before = await fetch(`${API}/api-keys`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => r.json())
      .catch(() => null);

    // The create control lives on the "AI API Keys" tab, and the page
    // opens on "Feature Overview", so the tab has to be switched first.
    const tabbed = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /AI API Keys/i.test(b.textContent || '')
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    await sleep(700);

    // Find the create control and drive it.
    const opened = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /add .*key|new key|create.*key|generate.*key/i.test(b.textContent || '')
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    await sleep(900);

    // The page asks for the key's name through a native prompt, which the
    // dialog handler above answers. There is no name field on the page,
    // so the audit does not fill one in.
    const inputFilled = true;
    await sleep(400);

    const submitted = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => /create|generate|confirm|save/i.test(b.textContent || '') && b.type !== 'button'
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    await sleep(2500);

    const after = await fetch(`${API}/api-keys`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => r.json())
      .catch(() => null);

    // The API wraps its payload in `data`, so the list is read from there.
    const keyCount = (payload) => {
      const list = payload?.data?.apiKeys || payload?.data?.keys || payload?.apiKeys || payload?.keys || [];
      return Array.isArray(list) ? list.length : 0;
    };
    const countBefore = keyCount(before);
    const countAfter = keyCount(after);

    results.apiKeyCreate = { tabbed, opened, inputFilled, submitted, countBefore, countAfter };
    if (!opened) {
      addFinding('destructive', '/api-keys', 'error', 'feature', 'The API-key create flow has no reachable create control');
    }
    if (countAfter <= countBefore) {
      addFinding('destructive', '/api-keys', 'error', 'feature', `Creating an API key did not store it (${countBefore} → ${countAfter})`);
    }

    const errs = probe.drain();
    for (const e of errs) {
      addFinding('destructive', '/api-keys', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
    console.log(`  API key create .................... ${countAfter > countBefore ? 'ok' : 'FAIL'} (${countBefore} → ${countAfter})`);
  }

  // ---- Notifications page renders the account's own list ----------------
  {
    const { context, page } = await newPage({ seed: { token: session.token, user: session.user } });
    const probe = instrument(page);
    await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const text = await readText(page);
    results.notifications = /Notifications/.test(text);
    const errs = probe.drain();
    for (const e of errs) {
      addFinding('destructive', '/notifications', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
    console.log(`  notifications page ............... ${results.notifications ? 'ok' : 'FAIL'}`);
  }

  // ---- Logout ends the session ------------------------------------------
  {
    const { context, page } = await newPage({ seed: { token: session.token, user: session.user } });
    const probe = instrument(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(1800);

    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /logout|sign out/i.test(b.textContent || ''));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    await sleep(2200);

    const tokenLeft = await page.evaluate(() => localStorage.getItem('token'));
    const userLeft = await page.evaluate(() => localStorage.getItem('project-eric_user'));
    results.logout = { clicked, tokenLeft: !!tokenLeft, userLeft: !!userLeft, path: page.url().replace(BASE, '') };

    if (!clicked) {
      addFinding('destructive', '/dashboard', 'error', 'feature', 'No logout control was found');
    } else if (tokenLeft) {
      addFinding('destructive', '/dashboard', 'error', 'feature', 'Logout left the session token in localStorage');
    }
    // The check is made against the path, not the whole URL.
    const endedOn = page.url().replace(BASE, '');
    if (clicked && !/^\/login/.test(endedOn)) {
      addFinding('destructive', '/dashboard', 'warn', 'feature', `Logout did not return to the login page (ended on ${endedOn})`);
    }

    const errs = probe.drain();
    for (const e of errs) {
      addFinding('destructive', '/dashboard', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
    console.log(`  logout clears the session ......... ${clicked && !tokenLeft ? 'ok' : 'FAIL'}`);
  }

  reports.destructive = results;
  return results;
}

// ---------------------------------------------------------------------------
// Phase: API sweep
// ---------------------------------------------------------------------------

async function phaseApi(session) {
  console.log('\n=== PHASE 4: API endpoint sweep ===');
  const endpoints = [
    ['GET', '/dashboard'],
    ['GET', '/projects'],
    ['GET', '/vulnerabilities'],
    ['GET', '/threats'],
    ['GET', '/scans'],
    ['GET', '/workspace'],
    ['GET', '/notifications'],
    ['GET', '/api-keys'],
    ['GET', '/audit-logs'],
    ['GET', '/integrations'],
    ['GET', '/profile'],
    ['GET', '/team/members'],
    ['GET', '/features'],
    ['GET', '/team'],
    ['GET', '/landing'],
    ['GET', '/auth/validate'],
  ];

  const results = [];
  for (const [method, endpoint] of endpoints) {
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const body = await res.text();
      let ok = false;
      try {
        const parsed = JSON.parse(body);
        ok = parsed && parsed.success !== false;
      } catch {
        ok = false;
      }
      results.push({ method, endpoint, status: res.status, ok });
      if (!res.ok || !ok) {
        addFinding(
          'api',
          endpoint,
          'error',
          'api',
          `${method} ${endpoint} answered HTTP ${res.status}`,
          body.slice(0, 300)
        );
      }
    } catch (err) {
      results.push({ method, endpoint, status: 0, ok: false, error: err.message });
      addFinding('api', endpoint, 'error', 'api', `${method} ${endpoint} could not be reached: ${err.message}`);
    }
  }

  reports.api = results;
  const bad = results.filter((r) => !r.ok);
  console.log(`  ${results.length - bad.length}/${results.length} endpoints healthy`);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const phase = process.argv[2] || 'all';
  fs.mkdirSync(OUT, { recursive: true });

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  });

  try {
    let session = null;

    if (phase === 'all' || phase === 'auth' || phase === 'routes' || phase === 'api') {
      const { context, page } = await newPage();
      session = await loginViaUI(page, DEMO.email, DEMO.password);
      await context.close();
      if (!session.token) throw new Error('Could not obtain a session token from the login form');
      console.log(`\nSigned in as ${session.user?.email} (id ${session.user?.id})`);
    }

    if (phase === 'all' || phase === 'auth') await phaseAuth();
    if (phase === 'all' || phase === 'routes') await phaseRoutes(session);
    if (phase === 'all' || phase === 'destructive') await phaseDestructive();
    if (phase === 'all' || phase === 'api') await phaseApi(session);
  } finally {
    await browser.close();
  }

  // ---- report -----------------------------------------------------------
  console.log('\n================ SUMMARY ================');
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');
  console.log(`errors: ${errors.length}, warnings: ${warns.length}`);

  const groups = new Map();
  for (const f of findings) {
    const key = `${f.kind}|${f.message.slice(0, 140)}`;
    if (!groups.has(key)) groups.set(key, { ...f, count: 0, routes: new Set() });
    const g = groups.get(key);
    g.count += 1;
    g.routes.add(f.route);
  }

  for (const g of groups.values()) {
    console.log(`\n[${g.severity.toUpperCase()}] ${g.kind} (x${g.count})  ${[...g.routes].join(', ')}`);
    console.log(`   ${g.message}`);
    if (g.extra) console.log(`   >> ${g.extra}`);
  }

  fs.writeFileSync(
    path.join(OUT, 'findings.json'),
    JSON.stringify({ findings, reports }, null, 2)
  );
  console.log(`\nSaved to ${path.join(OUT, 'findings.json')}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
