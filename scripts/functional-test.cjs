#!/usr/bin/env node
/**
 * Exercises the application's system functions one at a time in a real
 * browser.
 *
 * Each check drives the UI the way a person would — clicking a button,
 * typing into a field — and then asserts on what the app did: the
 * network calls it made, the text it rendered, the route it moved to.
 *
 * The mock API on port 5299 answers every endpoint, so a check fails
 * only when the front end misbehaves.
 *
 *   node scripts/functional-test.cjs             # every check
 *   node scripts/functional-test.cjs auth theme  # only the named groups
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const MOCK_API = 'http://127.0.0.1:5299/project-eric-api/api';
const OUT = path.resolve(__dirname, '..', 'logs', 'functional-tests');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

/** Every request the page makes, so a check can assert on the API use. */
class Recorder {
  constructor() {
    this.requests = [];
    this.errors = [];
  }
  /**
   * Redirects the API calls to the mock server.
   *
   * The app talks to `http://localhost/project-eric-api/api`, which is
   * the XAMPP path. There is no Apache in this environment, so the
   * requests are rewritten to the mock server instead.
   */
  async attach(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
        const rewritten = url.replace(
          /https?:\/\/localhost\/project-eric-api/,
          'http://127.0.0.1:5299/project-eric-api'
        );
        req.continue({ url: rewritten }).catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/project-eric-api/') || url.includes(':5299/')) {
        this.requests.push({
          method: req.method(),
          url: url
            .replace(MOCK_API, '/api')
            .replace(/^https?:\/\/127\.0\.0\.1:5299\/project-eric-api\/api/, '/api')
            .replace(/%20/g, ''),
        });
      }
    });
    page.on('pageerror', (e) => this.errors.push(String(e.message)));
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(m.text());
    });
  }
  paths(method) {
    return this.requests
      .filter((r) => !method || r.method === method)
      .map((r) => `${r.method} ${r.url}`);
  }
  called(pathFragment, method) {
    return this.requests.some(
      (r) => r.url.includes(pathFragment) && (!method || r.method === method)
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds a clickable element by its visible text.
 *
 * The app has no stable test ids, so the checks go through what a
 * person would use: the text on the button.
 */
const findByText = (text, selector = 'button, a, [role="button"], input[type="submit"]') =>
  `(() => {
    const wanted = ${JSON.stringify(text)}.toLowerCase();
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // Prefer an exact text match so "Sign in" does not land on the
    // "Sign in with a passkey" button above the form.
    const exact = nodes.find((el) => {
      if (el.disabled) return false;
      const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
      return t && t === wanted && visible(el);
    });
    const partial = nodes.find((el) => {
      if (el.disabled) return false;
      const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
      return t && t.includes(wanted) && visible(el);
    });
    const hit = exact || partial;
    if (!hit) return false;
    try {
      hit.scrollIntoView({ block: 'center' });
      hit.click();
      return true;
    } catch {
      return false;
    }
  })()`;

async function clickByText(page, text, selector) {
  return page.evaluate(findByText(text, selector)).catch(() => false);
}

/**
 * Fills a form field.
 *
 * The app's own inputs do not always carry a `type` attribute, so a
 * field is addressed by its id first and by its type second.
 *
 * The value is set through the native setter and an `input` event is
 * dispatched, because the fields are controlled React inputs: typing
 * character by character loses the focus whenever the component
 * re-renders, which happens as the floating label moves.
 */
async function fillField(page, selectors, value) {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (!element) continue;
    const ok = await element.evaluate((el, text) => {
      const proto =
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value === text;
    }, value);
    if (ok) {
      // Let React re-render before the next field is filled.
      await sleep(120);
      return true;
    }
  }
  return false;
}

const EMAIL_FIELDS = ['input#email', 'input[name="email"]', 'input[type="email"]', 'input[placeholder*="email" i]'];
const PASSWORD_FIELDS = ['input#password', 'input[name="password"]', 'input[type="password"]', 'input[placeholder*="password" i]'];
const TEXT_FIELDS = ['input[type="text"]', 'input:not([type])', 'input[placeholder*="name" i]'];

async function textPresent(page, needle) {
  return page.evaluate((n) => (document.body.innerText || '').includes(n), needle);
}

async function waitForText(page, needle, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await textPresent(page, needle)) return true;
    await sleep(150);
  }
  return false;
}

async function currentRoute(page) {
  return page.evaluate(() => location.pathname + location.search);
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const CHECKS = [];
const check = (group, name, fn) => CHECKS.push({ group, name, fn });

/**
 * Marks a check as needing a signed-out browser context.
 *
 * The auth pages redirect a signed-in visitor to the dashboard, so a
 * check that drives the sign-in form has to start with no session.
 */
const SIGNED_OUT = new Set();

/**
 * Marks a check as managing the stored theme itself.
 *
 * The seed hook runs again on every reload, so a check that writes a
 * theme value and reloads the page has to opt out of the seed.
 */
const MANAGED_THEME = new Set();

// -- Theme ------------------------------------------------------------------

check('theme', 'the theme toggle switches between light and dark', async (page, rec) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  const before = await page.evaluate(() => document.documentElement.className);
  const toggled = await page.evaluate(() => {
    const btn =
      document.querySelector('button[aria-label*="light mode" i], button[aria-label*="dark mode" i]') ||
      document.querySelector('button[title*="light mode" i], button[title*="dark mode" i]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!toggled) throw new Error('no theme toggle found');
  await sleep(900);

  const after = await page.evaluate(() => document.documentElement.className);
  const stored = await page.evaluate(() => localStorage.getItem('project-eric_theme'));
  if (before === after) throw new Error(`theme class did not change (${before} -> ${after})`);
  if (!stored) throw new Error('theme was not persisted to localStorage');
  return `class "${before}" -> "${after}", stored "${stored}"`;
});

check('theme', 'the theme choice survives a page reload', async (page) => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  // The stored value is written after the page has loaded, so the
  // reload is not overwritten by the seeded value.
  await page.evaluate(() => localStorage.setItem('project-eric_theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (!isDark) throw new Error('dark theme was not restored after reload');
  return 'dark theme restored after reload';
});
MANAGED_THEME.add('the theme choice survives a page reload');

// -- Authentication ---------------------------------------------------------

check('auth', 'signing in with valid credentials reaches the dashboard', async (page, rec) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  if (!(await fillField(page, EMAIL_FIELDS, 'developer@gmail.com'))) {
    throw new Error('no email field found');
  }
  if (!(await fillField(page, PASSWORD_FIELDS, 'Secret123!'))) {
    throw new Error('no password field found');
  }
  await clickByText(page, 'Sign in');
  await sleep(3000);

  const route = await currentRoute(page);
  if (!route.includes('/dashboard')) throw new Error(`expected /dashboard, landed on ${route}`);
  if (!rec.called('/auth/login', 'POST')) throw new Error('no POST /auth/login was made');
  return `signed in, landed on ${route}`;
});
SIGNED_OUT.add('signing in with valid credentials reaches the dashboard');

check('auth', 'signing in with an invalid email is rejected', async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  await fillField(page, EMAIL_FIELDS, 'not-an-email');
  await fillField(page, PASSWORD_FIELDS, 'Secret123!');
  await clickByText(page, 'Sign in');
  await sleep(1500);

  const route = await currentRoute(page);
  if (route.includes('/dashboard')) throw new Error('an invalid email was accepted');
  const body = await page.evaluate(() => document.body.innerText);
  if (!/valid email/i.test(body)) throw new Error('no validation message was shown');
  return 'rejected with a validation message';
});
SIGNED_OUT.add('signing in with an invalid email is rejected');

check('auth', 'signing in with an empty form is rejected', async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  await clickByText(page, 'Sign in');
  await sleep(1200);
  const route = await currentRoute(page);
  if (route.includes('/dashboard')) throw new Error('an empty form was accepted');
  const body = await page.evaluate(() => document.body.innerText);
  if (!/required/i.test(body)) throw new Error('no validation message was shown');
  return 'empty form rejected';
});
SIGNED_OUT.add('signing in with an empty form is rejected');

check('auth', 'the forgot-password page sends a reset link', async (page, rec) => {
  await page.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  await fillField(page, EMAIL_FIELDS, 'developer@gmail.com');
  await clickByText(page, 'Send Reset Link');
  await sleep(2500);
  const sent = await waitForText(page, 'Check your email', 5000);
  if (!sent) {
    const body = await page.evaluate(() => document.body.innerText);
    throw new Error(`the confirmation screen did not appear. Body: ${body.slice(0, 250)}`);
  }
  return 'reset link requested, confirmation shown';
});
SIGNED_OUT.add('the forgot-password page sends a reset link');

check('auth', 'signing out returns to the login page', async (page) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  const clicked = await page.evaluate(() => {
    const btn =
      [...document.querySelectorAll('button')].find((b) => /logout|sign out/i.test(b.innerText)) ||
      document.querySelector('button[title*="sign out" i], button[aria-label*="sign out" i]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('no sign-out button found');
  await sleep(2500);
  const route = await currentRoute(page);
  if (!route.includes('/login')) throw new Error(`expected /login after sign out, landed on ${route}`);
  return 'signed out, landed on /login';
});

// -- Dashboard --------------------------------------------------------------

check('dashboard', 'the dashboard loads its summary from the API', async (page, rec) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/dashboard')) throw new Error('no GET /dashboard was made');
  const body = await page.evaluate(() => document.body.innerText);
  if (!/projects|findings|score|vulnerab/i.test(body)) {
    throw new Error(`the summary did not render. Body: ${body.slice(0, 200)}`);
  }
  return 'summary loaded and rendered';
});

check('dashboard', 'the dashboard refresh button re-reads the figures', async (page, rec) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const before = rec.paths('GET').length;
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('button[title*="Refresh" i], button[aria-label*="Refresh" i]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('no refresh button found');
  await sleep(2000);
  const after = rec.paths('GET').length;
  if (after <= before) throw new Error('the refresh did not re-read the data');
  return `refresh re-read the data (${before} -> ${after} GETs)`;
});

// -- Security ---------------------------------------------------------------

check('security', 'the findings tab loads vulnerabilities', async (page, rec) => {
  await page.goto(`${BASE}/security?tab=findings`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/vulnerabilities')) {
    throw new Error(`no GET /vulnerabilities was made. Calls: ${rec.paths('GET').join(', ')}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/finding|A0\d|severity|injection/i.test(body)) {
    throw new Error(`the findings did not render. Body: ${body.slice(200, 420)}`);
  }
  return 'findings loaded and listed';
});

check('security', 'the threats tab shows the threat feed', async (page, rec) => {
  await page.goto(`${BASE}/security?tab=threats`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  // The threat feed is derived from the last scan rather than fetched
  // from its own endpoint, so the check is on the rendered view.
  const body = await page.evaluate(() => document.body.innerText);
  if (!/threat/i.test(body)) {
    throw new Error(`the threats view did not render. Body: ${body.slice(200, 420)}`);
  }
  const onThreats = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => (t.innerText || '').trim().toLowerCase().startsWith('threats')
    );
    return tab ? tab.getAttribute('aria-selected') : null;
  });
  if (onThreats !== 'true') throw new Error('the Threats tab is not the selected one');
  return 'threats view rendered and selected';
});

check('security', 'the reports tab shows the report history', async (page, rec) => {
  await page.goto(`${BASE}/security?tab=reports`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  // Reports are stored per account in local storage, not fetched from
  // an endpoint, so the check is on the rendered view.
  const body = await page.evaluate(() => document.body.innerText);
  if (!/report/i.test(body)) {
    throw new Error(`the reports view did not render. Body: ${body.slice(200, 420)}`);
  }
  const onReports = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => (t.innerText || '').trim().toLowerCase().startsWith('reports')
    );
    return tab ? tab.getAttribute('aria-selected') : null;
  });
  if (onReports !== 'true') throw new Error('the Reports tab is not the selected one');
  return 'reports view rendered and selected';
});

check('security', 'the security tabs can be switched', async (page) => {
  await page.goto(`${BASE}/security?tab=findings`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const clicked = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => (t.innerText || '').trim().toLowerCase().startsWith('threats')
    );
    if (!tab) return false;
    tab.click();
    return true;
  });
  if (!clicked) throw new Error('no Threats tab found');
  await sleep(1500);
  const route = await currentRoute(page);
  if (!route.includes('threats')) throw new Error(`the tab did not switch (route ${route})`);
  const selected = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => (t.innerText || '').trim().toLowerCase().startsWith('threats')
    );
    return tab ? tab.getAttribute('aria-selected') : null;
  });
  if (selected !== 'true') throw new Error('the Threats tab did not become selected');
  return `tab switched to ${route}`;
});

// -- Scanner ----------------------------------------------------------------

check('scanner', 'the scanner page loads its language list', async (page, rec) => {
  await page.goto(`${BASE}/owasp`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/php|javascript|python/i.test(text)) throw new Error('no languages were listed');
  return 'languages listed';
});

check('scanner', 'running a scan posts to the scans endpoint', async (page, rec) => {
  await page.goto(`${BASE}/owasp`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.innerText || '').trim().toLowerCase() === 'run owasp scan'
    );
    if (!btn || btn.disabled) return false;
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('no enabled scan button found');
  await sleep(5000);
  if (!rec.called('/scans', 'POST')) {
    throw new Error(`no POST /scans was made. Calls: ${rec.paths().join(', ')}`);
  }
  return 'scan started and recorded';
});

// -- API keys ---------------------------------------------------------------

check('api-keys', 'the API keys page loads its keys', async (page, rec) => {
  await page.goto(`${BASE}/api-keys`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/api-keys')) {
    throw new Error(`no GET /api-keys was made. Calls: ${rec.paths('GET').join(', ')}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/key/i.test(body)) throw new Error('the keys view did not render');
  return 'keys loaded';
});

check('api-keys', 'the key tabs can be switched', async (page) => {
  await page.goto(`${BASE}/api-keys`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const clicked = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find(
      (b) => (b.innerText || '').trim().toLowerCase() === 'sandbox config'
    );
    if (!tab) return false;
    tab.click();
    return true;
  });
  if (!clicked) throw new Error('no Sandbox Config tab found');
  await sleep(1500);
  const body = await page.evaluate(() => document.body.innerText);
  if (!/sandbox/i.test(body)) throw new Error('the sandbox tab did not render');
  return 'tab switched';
});

// -- Team -------------------------------------------------------------------

check('team', 'the team page lists members', async (page, rec) => {
  await page.goto(`${BASE}/team`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/team/members')) {
    throw new Error(`no GET /team/members was made. Calls: ${rec.paths('GET').join(', ')}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/developer@|member|admin/i.test(body)) {
    throw new Error(`the member list did not render. Body: ${body.slice(200, 420)}`);
  }
  return 'members loaded and listed';
});

check('team', 'the member search accepts a query', async (page) => {
  await page.goto(`${BASE}/team`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const search = await page.$('input[placeholder*="Search team" i]');
  if (!search) throw new Error('no member search field found');
  await search.type('Priya');
  await sleep(900);
  const value = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="Search team" i]');
    return input ? input.value : '';
  });
  if (value !== 'Priya') throw new Error('the search field did not accept the text');
  return 'search accepted the query';
});

// -- Notifications ----------------------------------------------------------

check('notifications', 'notifications are listed from the API', async (page, rec) => {
  await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/notifications')) {
    throw new Error(`no GET /notifications was made. Calls: ${rec.paths('GET').join(', ')}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/notification|alert|vulnerab/i.test(body)) {
    throw new Error(`the notifications did not render. Body: ${body.slice(200, 420)}`);
  }
  return 'notifications loaded and listed';
});

check('notifications', 'the notification filter pills work', async (page) => {
  await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.innerText || '').trim().toLowerCase() === 'unread'
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('no Unread filter found');
  await sleep(1500);
  const body = await page.evaluate(() => document.body.innerText);
  if (body.trim().length < 40) throw new Error('the page broke after filtering');
  return 'filter applied';
});

// -- Audit logs -------------------------------------------------------------

check('audit-logs', 'the audit log loads its events', async (page, rec) => {
  await page.goto(`${BASE}/audit-logs`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/audit-logs')) {
    throw new Error(`no GET /audit-logs was made. Calls: ${rec.paths('GET').join(', ')}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/scan|login|activity|event/i.test(body)) {
    throw new Error(`the log did not render. Body: ${body.slice(200, 420)}`);
  }
  return 'audit log loaded and listed';
});

// -- Settings ---------------------------------------------------------------

check('settings', 'the settings page loads its preferences', async (page, rec) => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/settings')) {
    throw new Error(`no GET /settings was made. Calls: ${rec.paths('GET').join(', ')}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/setting|appearance|notification/i.test(body)) {
    throw new Error(`the settings did not render. Body: ${body.slice(200, 420)}`);
  }
  return 'settings loaded';
});

check('settings', 'a settings preference can be toggled and saved', async (page, rec) => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
  await sleep(2500);

  // The notification switches live on the Notifications tab.
  const onNotifications = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find((b) =>
      (b.innerText || '').trim().toLowerCase() === 'notifications'
    );
    if (!tab) return false;
    tab.click();
    return true;
  });
  if (!onNotifications) throw new Error('no Notifications tab in settings');
  await sleep(1500);

  const toggled = await page.evaluate(() => {
    const sw = document.querySelector('button[role="switch"]');
    if (!sw) return false;
    const before = sw.getAttribute('aria-checked');
    sw.click();
    return before;
  });
  if (toggled === null || toggled === undefined) throw new Error('no settings switch found');
  await sleep(2500);

  const after = await page.evaluate(() => {
    const sw = document.querySelector('button[role="switch"]');
    return sw ? sw.getAttribute('aria-checked') : null;
  });
  if (after === toggled) throw new Error('the switch did not change state');
  if (!rec.called('/settings', 'PUT') && !rec.called('/settings', 'POST')) {
    throw new Error(`toggling a preference did not save it. Calls: ${rec.paths().join(', ')}`);
  }
  return `switch flipped ${toggled} -> ${after} and saved`;
});

// -- Profile ----------------------------------------------------------------

check('profile', 'the profile page loads the profile', async (page, rec) => {
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  if (!rec.called('/profile')) {
    throw new Error(`no GET /profile was made. Calls: ${rec.paths('GET').join(', ')}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  if (!/profile|vulnerabilit|scanned|contribution/i.test(body)) {
    throw new Error(`the profile did not render. Body: ${body.slice(200, 420)}`);
  }
  return 'profile loaded and rendered';
});

check('profile', 'the profile can be opened for editing', async (page) => {
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.innerText || '').trim().toLowerCase() === 'edit profile'
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('no Edit Profile button found');
  await sleep(1800);
  const body = await page.evaluate(() => document.body.innerText);
  if (!/cancel|save|done/i.test(body)) {
    throw new Error(`the edit mode did not open. Body: ${body.slice(200, 400)}`);
  }
  return 'edit mode opened';
});

// -- Sandbox ----------------------------------------------------------------

check('sandbox', 'the sandbox page loads its file tree', async (page) => {
  await page.goto(`${BASE}/sandbox`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  const text = await page.evaluate(() => document.body.innerText);
  if (text.trim().length < 50) throw new Error('the sandbox rendered nothing');
  return 'sandbox rendered';
});

// -- Command palette --------------------------------------------------------

check('navigation', 'the command palette opens and lists actions', async (page) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(900);
  const open = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) return true;
    return /search|command/i.test(document.body.innerText);
  });
  if (!open) throw new Error('the command palette did not open');
  return 'command palette opened';
});

check('navigation', 'the sidebar navigates between pages', async (page) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  const clicked = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => {
      const t = (a.innerText || '').trim().toLowerCase();
      return t === 'security' || t.startsWith('security\n');
    });
    if (!link) return false;
    link.click();
    return true;
  });
  if (!clicked) throw new Error('no Security link in the sidebar');
  await sleep(2500);
  const route = await currentRoute(page);
  if (!route.includes('/security')) throw new Error(`expected /security, landed on ${route}`);
  return `navigated to ${route}`;
});

// ---------------------------------------------------------------------------

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });

  const wanted = process.argv.slice(2);
  const selected = wanted.length
    ? CHECKS.filter((c) => wanted.some((w) => c.group === w || c.name.includes(w)))
    : CHECKS;

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const item of selected) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    // The auth pages redirect a signed-in visitor to the dashboard, so
    // the checks that drive those forms start with no session at all.
    if (!SIGNED_OUT.has(item.name)) {
      await page.evaluateOnNewDocument((user, token, theme) => {
        try {
          localStorage.setItem('token', token);
          localStorage.setItem('project-eric_user', JSON.stringify(user));
          localStorage.setItem('eric_welcome_tour_seen', 'true');
          // The theme is only seeded when the check does not manage it
          // itself — this hook runs again on every reload.
          if (theme) localStorage.setItem('project-eric_theme', theme);
        } catch { /* ignore */ }
      }, SEED_USER, 'mock-token', MANAGED_THEME.has(item.name) ? null : 'dark');
    } else {
      await page.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem('eric_welcome_tour_seen', 'true');
          localStorage.setItem('project-eric_theme', 'dark');
        } catch { /* ignore */ }
      });
    }

    const rec = new Recorder();
    await rec.attach(page);

    const started = Date.now();
    let status = 'PASS';
    let detail = '';
    try {
      detail = (await item.fn(page, rec)) || '';
      passed += 1;
    } catch (err) {
      status = 'FAIL';
      detail = err.message;
      failed += 1;
      await page
        .screenshot({ path: path.join(OUT, `fail-${item.group}-${item.name.replace(/\W+/g, '-')}.png`) })
        .catch(() => {});
    }
    const ms = Date.now() - started;
    const jsErrors = rec.errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED/i.test(e));

    console.log(
      `[${status}] ${item.group}/${item.name} ${detail ? '— ' + detail : ''}` +
        (jsErrors.length ? `  (${jsErrors.length} js error(s): ${jsErrors[0].slice(0, 90)})` : '')
    );
    results.push({ group: item.group, name: item.name, status, detail, ms, jsErrors });

    await context.close();
  }

  await browser.close();

  fs.writeFileSync(
    path.join(OUT, 'results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
  );

  console.log(`\n${'='.repeat(70)}`);
  console.log(`passed ${passed}, failed ${failed}, total ${selected.length}`);
  console.log(`report: ${path.join(OUT, 'results.json')}`);
  if (failed) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
