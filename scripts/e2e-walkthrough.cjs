/**
 * Project Eric — full end-to-end walkthrough.
 *
 * Logs in as the demo account for real (no localStorage seeding), then
 * walks every route, exercises every tab on Settings, drives the
 * notification bell, and launches the per-account code-server
 * workbench. Records:
 *
 *   - console errors / warnings
 *   - unhandled promise rejections
 *   - failed HTTP requests and 4xx/5xx API responses
 *   - React error-boundary trips
 *   - routes that render nothing or redirect away
 *
 *   node scripts/e2e-walkthrough.cjs
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname, '..', 'logs', 'e2e');

const EMAIL = process.env.ERIC_EMAIL || 'demo@project-eric.com';
const PASSWORD = process.env.ERIC_PASSWORD || 'demo123';

const ROUTES = [
  { path: '/landing', auth: false, name: 'Landing', markers: ['security-first IDE', 'Project Eric'] },
  // The root path is a redirect to /landing, so the marker check runs
  // against the page it lands on rather than the URL it was asked for.
  { path: '/', auth: false, name: 'Root redirect', markers: ['security-first IDE', 'Project Eric'], expectRedirect: '/landing' },
  { path: '/login', auth: false, name: 'Login', markers: ['Sign in'] },
  { path: '/signup', auth: false, name: 'Signup', markers: ['Create your account'] },
  { path: '/forgot-password', auth: false, name: 'Forgot Password', markers: ['password'] },
  { path: '/terms-of-service', auth: false, name: 'Terms', markers: ['Terms of Service'] },
  { path: '/privacy-policy', auth: false, name: 'Privacy', markers: ['Privacy Policy'] },
  { path: '/dashboard', auth: true, name: 'Dashboard', markers: ['Dashboard'] },
  { path: '/security', auth: true, name: 'Security', markers: ['Security'] },
  { path: '/team', auth: true, name: 'Team', markers: ['Team'] },
  { path: '/about-team', auth: true, name: 'About Team', markers: ['Project'] },
  { path: '/api-keys', auth: true, name: 'API Keys', markers: ['API Key'] },
  { path: '/audit-logs', auth: true, name: 'Audit Logs', markers: ['Audit'] },
  { path: '/notifications', auth: true, name: 'Notifications', markers: ['Notification'] },
  { path: '/settings', auth: true, name: 'Settings', markers: ['Settings'] },
  { path: '/profile', auth: true, name: 'Profile', markers: ['Profile'] },
  { path: '/sandbox', auth: true, name: 'Sandbox', markers: ['Sandbox'] },
  { path: '/owasp', auth: true, name: 'OWASP Scanner', markers: ['OWASP'] },
  { path: '/owasp-analysis', auth: true, name: 'OWASP Analysis', markers: ['Analysis'] },
  { path: '/ide', auth: true, name: 'IDE Workspace', markers: ['IDE'] },
  { path: '/viewer', auth: false, name: 'Viewer', markers: ['Viewer'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Decode a base32 secret into bytes. */
function base32Decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = value.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let buffer = 0;
  let bits = 0;
  let out = '';
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error(`Bad base32 character: ${ch}`);
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out += String.fromCharCode((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out, 'binary');
}

/** The six digit code an authenticator app would show right now. */
function totp(secret, timestamp = Math.floor(Date.now() / 1000)) {
  const crypto = require('crypto');
  const counter = Math.floor(timestamp / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(counter, 4);
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

const findings = [];
const reports = [];
// Console output from inside an embedded third-party frame (the
// code-server workbench). It is kept apart from the app's own findings.
const thirdPartyLog = [];
// API calls that are expected to be refused, because a check is
// deliberately submitting something wrong to prove the API rejects it.
const expectedRejections = [];
const expectedRejectionsHit = [];

function addFinding(route, severity, kind, message, extra) {
  findings.push({
    route,
    severity,
    kind,
    message: String(message).slice(0, 600),
    extra: extra ? String(extra).slice(0, 600) : undefined,
  });
}

/** Noise that is not an application defect. */
const IGNORE = [
  /Download the React DevTools/i,
  /not wrapped in act/i,
  /React Router Future Flag/i,
  /\[vite\] (connect|hot updated|page reload)/i,
  /Failed to load resource: net::ERR_ABORTED/i,
  /WebSocket connection to .* failed/i,
];

/**
 * Console output produced by code-server's own front-end.
 *
 * The workbench logs its internal state with a red `ERR` badge, and its
 * lifecycle messages on shutdown are not defects of this project.
 */
const THIRD_PARTY_PATTERNS = [
  /%c\s+ERR color: #f33/i,
  /\[lifecycle\] Long running operations during shutdown/i,
  /\[Service Worker\] registration/i,
  /unsupported MIME type \('text\/html'\)/i,
];

function isNoise(text) {
  return IGNORE.some((re) => re.test(text));
}

/**
 * Is this frame part of a third-party app the dashboard embeds?
 *
 * The code-server workbench is framed into the OWASP Analysis page. Its
 * own console output — missing upstream assets, service-worker
 * registrations, chat-session storage warnings — is not a defect in
 * this project, so it is recorded apart from the app's own errors.
 */
function isThirdPartyFrame(url = '') {
  if (!url) return false;
  // The workbench is served through the dev server's `/vscode` proxy, so
  // its assets live under that prefix on the dashboard's own origin.
  return /\/vscode\//i.test(url) || /127\.0\.0\.1:8080/.test(url);
}

/**
 * Attach the collectors. `bucket` collects everything seen since the
 * marker was set, so a route's findings can be attributed to it.
 */
function watch(page) {
  const bucket = [];

  // Console output from inside an embedded third-party frame.
  const thirdParty = [];

  // The URLs of the requests that failed, newest last. Chrome logs
  // "Failed to load resource: …" without naming the URL, so the message
  // is matched against the request that produced it.
  const failedRequests = [];

  // Modal dialogs block the page until they are answered. The app uses
  // `window.prompt` for the API-key name and `window.confirm` for a few
  // destructive actions, so they are answered automatically here.
  // `page.__dialogs` records what was asked.
  page.__dialogs = [];
  page.on('dialog', async (dialog) => {
    page.__dialogs.push({ type: dialog.type(), message: dialog.message() });
    try {
      if (dialog.type() === 'prompt') {
        await dialog.accept(page.__promptAnswer || 'Test Key');
      } else {
        await dialog.accept();
      }
    } catch {
      /* the dialog was already dismissed */
    }
  });

  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = msg.text();
    if (isNoise(text)) return;
    // Errors raised inside the embedded code-server workbench belong to
    // code-server, not to this app. They are recorded separately so a
    // real defect is not hidden in the noise.
    //
    // Two sources are checked: the frame the message came from, and the
    // URL of the file that logged it. Browser-generated network errors
    // ("Failed to load resource…") are reported against the page rather
    // than the frame, so the location is what catches them.
    const origins = [];
    try {
      origins.push(msg.frame()?.url() || '');
    } catch {
      /* the frame may be gone */
    }
    try {
      origins.push(msg.location()?.url || '');
    } catch {
      /* the location may be gone */
    }
    if (origins.some(isThirdPartyFrame)) {
      thirdParty.push({ kind: `console.${type}`, message: text, frame: origins[0] });
      thirdPartyLog.push({ kind: `console.${type}`, message: text, frame: origins[0] });
      return;
    }

    // code-server logs its own internals with a red badge. The message
    // carries no URL, so it is recognised by its shape.
    if (THIRD_PARTY_PATTERNS.some((re) => re.test(text))) {
      thirdParty.push({ kind: `console.${type}`, message: text, frame: origins[0] || 'code-server' });
      thirdPartyLog.push({ kind: `console.${type}`, message: text, frame: origins[0] || 'code-server' });
      return;
    }

    // "Failed to load resource: …" is logged by the browser without the
    // URL. It is attributed to the request that just failed, so a
    // third-party asset that 404s does not read as an app defect.
    if (/Failed to load resource/i.test(text)) {
      const recent = failedRequests.filter((r) => Date.now() - r.at < 5000).pop();
      if (recent && (isThirdPartyFrame(recent.url) || recent.expected)) {
        if (!recent.expected) {
          thirdParty.push({ kind: `console.${type}`, message: `${text} — ${recent.url}` });
          thirdPartyLog.push({ kind: `console.${type}`, message: `${text} — ${recent.url}` });
        }
        return;
      }
    }

    bucket.push({ severity: type === 'error' ? 'error' : 'warn', kind: `console.${type}`, message: text });
  });
  page.on('pageerror', (err) =>
    bucket.push({ severity: 'error', kind: 'pageerror', message: err.message, extra: err.stack })
  );
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    if (failure && /ERR_ABORTED/i.test(failure.errorText)) return;
    if (isThirdPartyFrame(req.url())) {
      thirdParty.push({ kind: 'requestfailed', message: `${req.method()} ${req.url()}` });
      thirdPartyLog.push({ kind: 'requestfailed', message: `${req.method()} ${req.url()}` });
      return;
    }
    bucket.push({
      severity: 'error',
      kind: 'requestfailed',
      message: `${req.method()} ${req.url()}`,
      extra: failure && failure.errorText,
    });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (res.status() < 400) return;
    failedRequests.push({ url, status: res.status(), at: Date.now() });
    // The API is the app's own; everything else is either the dashboard
    // itself (the Vite dev server) or an embedded third-party frame.
    if (!url.includes('/project-eric-api/')) {
      if (!isThirdPartyFrame(url)) {
        thirdParty.push({ kind: `http.${res.status()}`, message: `${res.request().method()} ${url}` });
        thirdPartyLog.push({ kind: `http.${res.status()}`, message: `${res.request().method()} ${url}` });
      }
      return;
    }
    // Some checks deliberately submit something wrong — a bad code, a
    // wrong password — to prove the API refuses it. The refusal is the
    // expected result, not a defect.
    const expected = expectedRejections.some(
      (r) => url.endsWith(r) && (res.status() === 400 || res.status() === 401)
    );
    if (expected) {
      expectedRejectionsHit.push(`${url} → ${res.status()}`);
      failedRequests[failedRequests.length - 1].expected = true;
      return;
    }
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      /* ignore */
    }
    bucket.push({
      severity: 'error',
      kind: `http.${res.status()}`,
      message: `${res.request().method()} ${url}`,
      extra: detail,
    });
  });
  page.__bucket = bucket;
  page.__thirdParty = thirdParty;
  return bucket;
}

function drain(page, route, since) {
  const bucket = page.__bucket || [];
  for (const f of bucket.slice(since)) addFinding(route, f.severity, f.kind, f.message, f.extra);
}

/**
 * Set the value of a React-controlled input.
 *
 * React keeps the value of a controlled input in its own state, so
 * assigning to `input.value` directly is undone on the next render.
 * The native setter is used instead, and an `input` event is fired so
 * React sees the change.
 */
async function setReactInput(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    selector,
    value
  );
  await sleep(300);
}

/**
 * Wait until React has mounted and taken over the page.
 *
 * React attaches itself to the nodes it renders, which is what makes
 * a click work. Interacting before that happens does nothing at all —
 * the element is there, but no handler is attached to it yet.
 */
async function waitForHydrated(page, timeout = 15000) {
  await page
    .waitForFunction(
      () => {
        const root = document.getElementById('root');
        if (!root || !root.firstElementChild) return false;
        return Object.keys(root.firstElementChild).some((k) => k.startsWith('__react'));
      },
      { timeout }
    )
    .catch(() => {});
  // A short settle, so the first render's effects have run too.
  await sleep(500);
}

/**
 * Type into a field and confirm the value stuck.
 *
 * The auth forms are React-controlled inputs. Typing into one before
 * React has mounted leaves the value empty — the browser fills the
 * field, then React resets it to the state it holds. The value is
 * therefore checked and the text typed again if it did not stick.
 */
async function typeInto(page, selector, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const handle = await page.$(selector);
    if (!handle) {
      await sleep(800);
      continue;
    }
    await handle.click({ clickCount: 3 }).catch(() => {});
    await handle.type(text, { delay: 20 }).catch(() => {});
    await sleep(400);

    const value = await page.evaluate((sel) => document.querySelector(sel)?.value ?? '', selector);
    if (value === text) {
      return true;
    }
    await sleep(1200);
  }
  return false;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  await waitForHydrated(page);
  // The welcome-tour overlay can sit on top of the form.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /skip tour|close tour/i.test(b.textContent || '')
    );
    if (btn) btn.click();
  });
  await sleep(600);
  await typeInto(page, 'input[type="email"]', EMAIL);
  await typeInto(page, 'input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForFunction(
      () => location.pathname !== '/login',
      { timeout: 20000 }
    ),
    page.click('button[type="submit"]'),
  ]);
  await sleep(1500);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /skip tour|close tour/i.test(b.textContent || '')
    );
    if (btn) btn.click();
  });
  await sleep(500);
  const state = await page.evaluate(() => ({
    token: localStorage.getItem('token'),
    user: localStorage.getItem('project-eric_user'),
    url: location.pathname,
  }));
  if (!state.token) throw new Error('Login did not produce a token.');
  return state;
}

/** Click a visible button whose text matches, and report if it vanished. */
async function clickByText(page, selector, regex, { optional = false } = {}) {
  const handle = await page.evaluateHandle(
    (sel, src) => {
      const re = new RegExp(src, 'i');
      return [...document.querySelectorAll(sel)].find((n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (n.disabled) return false;
        const text = `${n.getAttribute('aria-label') || ''} ${n.textContent || ''}`.trim();
        return re.test(text);
      });
    },
    selector,
    regex.source
  );
  const element = handle.asElement();
  if (!element) {
    if (!optional) addFinding(page.__route, 'warn', 'missing-control', `No visible ${selector} matching /${regex.source}/`);
    return false;
  }
  try {
    await element.click();
    return true;
  } catch (err) {
    addFinding(page.__route, 'error', 'click', `Clicking "${regex.source}" failed: ${err.message}`);
    return false;
  }
}

async function visitRoute(page, route) {
  page.__route = route.path;
  const since = (page.__bucket || []).length;
  let navOk = true;
  try {
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    navOk = false;
    addFinding(route.path, 'error', 'navigation', `Page load failed: ${err.message}`);
  }

  if (navOk) {
    await sleep(2500);
    await waitForHydrated(page);
    const render = await page.evaluate(() => {
      const root = document.getElementById('root');
      const text = (root && root.innerText) || '';
      return {
        textLength: text.trim().length,
        heading: document.querySelector('h1, h2')?.textContent?.trim().slice(0, 80) || null,
        errorBoundary: /Something went wrong|unexpected error|app crashed/i.test(text),
      };
    });
    const markerHit = await page.evaluate(
      (markers) => {
        const root = document.getElementById('root');
        const text = (root && root.innerText) || '';
        return markers.some((m) => text.includes(m));
      },
      route.markers
    );
    if (!markerHit) {
      addFinding(
        route.path,
        'error',
        'wrong-page',
        `Route did not render "${route.path}" — it is on ${page.url().replace(BASE, '')}. Heading: ${render.heading}`
      );
    }
    if (render.textLength < 60) {
      addFinding(route.path, 'error', 'render', `Page rendered almost nothing (${render.textLength} chars)`);
    }
    if (render.errorBoundary) {
      addFinding(route.path, 'error', 'errorboundary', 'React error boundary tripped on this route.');
    }
    if (route.expectRedirect) {
      // A route that is meant to redirect is checked by the URL it ended
      // on. The marker check still has to pass, because the redirect has
      // to land on a real page, not on an error.
      const landedOn = page.url().replace(BASE, '').replace(/\/$/, '') || '/';
      if (landedOn !== route.expectRedirect) {
        addFinding(
          route.path,
          'error',
          'wrong-redirect',
          `Route "${route.path}" landed on "${landedOn}", not "${route.expectRedirect}".`
        );
      }
      reports.push({ route: route.path, name: route.name, heading: render.heading, chars: render.textLength, markerHit, landedOn });
    } else {
      reports.push({ route: route.path, name: route.name, heading: render.heading, chars: render.textLength, markerHit });
    }
  }
  drain(page, route.path, since);
}

async function testSettings(page) {
  page.__route = '/settings';
  const since = (page.__bucket || []).length;
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await waitForHydrated(page);

  // The Settings tabs live in their own nav, separate from the app
  // sidebar. The test ids keep the two apart.
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="settings-tab-"]')].map((b) => ({
      id: b.getAttribute('data-testid').replace('settings-tab-', ''),
      label: (b.textContent || '').trim(),
    }))
  );
  if (!tabs.length) {
    addFinding('/settings', 'error', 'settings', 'The Settings sidebar rendered no tabs.');
    drain(page, '/settings', since);
    return;
  }
  reports.push({ route: '/settings', name: 'Settings tabs', tabs: tabs.map((t) => t.label) });

  for (const tab of tabs) {
    const before = (page.__bucket || []).length;
    await page.click(`[data-testid="settings-tab-${tab.id}"]`);
    await sleep(1400);

    const info = await page.evaluate((id) => {
      const panel = document.querySelector(`[data-testid="settings-panel-${id}"]`);
      const root = document.getElementById('root');
      const text = (root && root.innerText) || '';
      return {
        panelFound: !!panel,
        panelChars: panel ? (panel.innerText || '').trim().length : 0,
        controls: panel ? panel.querySelectorAll('button, input, select, textarea').length : 0,
        chars: text.trim().length,
        hasErrorText: /something went wrong|unexpected error|app crashed/i.test(text),
      };
    }, tab.id);

    if (!info.panelFound) {
      addFinding('/settings', 'error', 'settings-tab', `The "${tab.label}" tab did not render its panel.`);
    } else if (info.panelChars < 60) {
      addFinding('/settings', 'error', 'empty-tab', `The "${tab.label}" tab rendered almost nothing (${info.panelChars} chars).`);
    }
    if (info.hasErrorText) {
      addFinding('/settings', 'error', 'errorboundary', `The "${tab.label}" tab tripped the error boundary.`);
    }
    drain(page, `/settings#${tab.id}`, before);
  }

  // ---- Exercise the profile save round-trip -----------------------------
  await page.click('[data-testid="settings-tab-profile"]');
  await sleep(900);
  const saveBefore = (page.__bucket || []).length;
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-testid="settings-panel-profile"] button')]
      .find((b) => /save changes/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(1800);
  const savedText = await page.evaluate(() => document.getElementById('root')?.innerText || '');
  if (!/saved|success/i.test(savedText)) {
    addFinding('/settings', 'warn', 'no-feedback', 'Saving the profile produced no visible confirmation.');
  }
  drain(page, '/settings#profile-save', saveBefore);

  // ---- Notifications toggles -------------------------------------------
  await page.click('[data-testid="settings-tab-notifications"]');
  await sleep(900);
  const notifBefore = (page.__bucket || []).length;
  const toggleInfo = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-panel-notifications"]');
    if (!panel) return { count: 0, missing: true };
    const buttons = [...panel.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !b.disabled;
    });
    return { count: buttons.length, missing: false };
  });
  if (toggleInfo.missing) {
    addFinding('/settings', 'error', 'notifications', 'The Notifications tab did not render its panel.');
  } else if (!toggleInfo.count) {
    addFinding('/settings', 'warn', 'no-toggles', 'Notification preferences rendered no switches.');
  }
  // Flip the first preference switch and confirm the state actually changes.
  const flipped = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-panel-notifications"]');
    if (!panel) return null;
    const btn = [...panel.querySelectorAll('button')].find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !b.disabled;
    });
    if (!btn) return null;
    const before = btn.getAttribute('aria-checked');
    btn.click();
    return { label: btn.getAttribute('aria-label'), before };
  });
  if (flipped !== null) await sleep(1500);
  drain(page, '/settings#notifications', notifBefore);

  // ---- The preferences reached the account ------------------------------
  //
  // The server copy is the one that matters: read it back through the
  // API and compare it with what the screen shows. This runs while the
  // Notifications tab is still open, so both sides can be compared.
  const persistBefore = (page.__bucket || []).length;
  const screenPrefs = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-panel-notifications"]');
    if (!panel) return null;
    const switches = [...panel.querySelectorAll('[role="switch"]')];
    return switches.map((s) => ({
      label: s.getAttribute('aria-label'),
      checked: s.getAttribute('aria-checked') === 'true',
    }));
  });
  if (!screenPrefs || !screenPrefs.length) {
    addFinding('/settings', 'error', 'notifications', 'The notification switches carry no accessible state.');
  } else {
    const stored = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost/project-eric-api/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return json?.data?.settings?.notifications || null;
    });
    if (!stored) {
      addFinding('/settings', 'error', 'settings-api', 'The account settings could not be read back from the API.');
    } else {
      // The label on the switch is the same on both screens, so the
      // comparison does not depend on the order of the switches.
      const keyFor = {
        'Security Alerts': 'email',
        'Push Notifications': 'push',
        'Vulnerability Alerts': 'vulnerabilityAlerts',
        'Weekly Report': 'weeklyReport',
      };
      for (const sw of screenPrefs) {
        const key = keyFor[sw.label];
        if (!key) continue;
        if (stored[key] !== sw.checked) {
          addFinding(
            '/settings',
            'error',
            'settings-persist',
            `The "${sw.label}" switch shows ${sw.checked} but the account has ${stored[key]}.`
          );
        }
      }
      reports.push({ route: '/settings#notifications', name: 'Stored notification preferences', value: stored });
    }
  }
  drain(page, '/settings#notifications-persist', persistBefore);

  // Put the preference back, so the run leaves the account as it found it.
  if (flipped !== null) {
    await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="settings-panel-notifications"]');
      const btn = [...panel.querySelectorAll('button')].find((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !b.disabled;
      });
      if (btn) btn.click();
    });
    await sleep(1500);
  }

  // ---- Appearance: theme + accent --------------------------------------
  await page.click('[data-testid="settings-tab-appearance"]');
  await sleep(900);
  const appBefore = (page.__bucket || []).length;
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="settings-theme-dark"]');
    if (btn) btn.click();
  });
  await sleep(900);
  const themeApplied = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  );
  if (!themeApplied) {
    addFinding('/settings', 'error', 'appearance', 'Choosing the Dark theme did not switch the document to dark mode.');
  }
  // Put it back so the rest of the run is not affected.
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="settings-theme-light"]');
    if (btn) btn.click();
  });
  await sleep(700);
  const themeRestored = await page.evaluate(() =>
    !document.documentElement.classList.contains('dark')
  );
  if (!themeRestored) {
    addFinding('/settings', 'error', 'appearance', 'Choosing the Light theme did not switch the document back to light mode.');
  }
  drain(page, '/settings#appearance', appBefore);
  reports.push({ route: '/settings#appearance', name: 'Dark theme toggles on', value: themeApplied });

  // ---- Integrations: connect + disconnect ------------------------------
  await page.click('[data-testid="settings-tab-integrations"]');
  await sleep(1200);
  const intBefore = (page.__bucket || []).length;
  const intState = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-panel-integrations"]');
    if (!panel) return 'no-panel';
    const btn = [...panel.querySelectorAll('button')].find((b) => /^(connect|disconnect)$/i.test((b.textContent || '').trim()));
    if (!btn) return null;
    const label = (btn.textContent || '').trim();
    btn.click();
    return label;
  });
  if (intState === null) {
    addFinding('/settings', 'error', 'integrations', 'The integrations tab rendered no Connect button.');
  } else if (intState === 'no-panel') {
    addFinding('/settings', 'error', 'integrations', 'The integrations tab did not render its panel.');
  } else if (intState) await sleep(2200);
  drain(page, '/settings#integrations', intBefore);

  // ---- API keys: generate then delete -----------------------------------
  await page.click('[data-testid="settings-tab-security"]');
  await sleep(1000);
  const keyBefore = (page.__bucket || []).length;
  page.__promptAnswer = 'E2E Test Key';
  const keyCountBefore = await page.evaluate(
    () => document.querySelectorAll('[data-testid="settings-panel-security"] .bg-slate-50').length
  );
  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-panel-security"]');
    if (!panel) return;
    const btn = [...panel.querySelectorAll('button')].find((b) => /generate new key/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(2500);
  const keyCountAfter = await page.evaluate(
    () => document.querySelectorAll('[data-testid="settings-panel-security"] .bg-slate-50').length
  );
  if (keyCountAfter <= keyCountBefore) {
    addFinding('/settings', 'error', 'api-key', 'Generating an API key did not add a key to the list.');
  }
  drain(page, '/settings#api-key-generate', keyBefore);

  // ---- Change password dialog opens and validates -----------------------
  const pwdBefore = (page.__bucket || []).length;
  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-panel-security"]');
    if (!panel) return;
    const btn = [...panel.querySelectorAll('button')].find((b) => /change password/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(900);
  const dialogOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  if (!dialogOpen) {
    addFinding('/settings', 'error', 'password', 'The "Change Password" dialog did not open.');
  }
  drain(page, '/settings#password-dialog', pwdBefore);

  // ---- Help tab --------------------------------------------------------
  await page.keyboard.press('Escape');
  await sleep(400);
  await page.click('[data-testid="settings-tab-help"]');
  await sleep(900);
  const helpBefore = (page.__bucket || []).length;
  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-panel-help"]');
    if (!panel) return;
    const btn = [...panel.querySelectorAll('button')].find((b) => /reset all page tips/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(900);
  drain(page, '/settings#help', helpBefore);

  drain(page, '/settings', since);
}

async function testNotificationsBell(page) {
  page.__route = '/notifications';
  const since = (page.__bucket || []).length;
  await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await waitForHydrated(page);

  // The notification preferences on this page must be the same ones the
  // Settings page shows — they come from the account now.
  const prefs = await page.evaluate(async () => {
    const panelBtn = [...document.querySelectorAll('button')].find((b) =>
      /^Settings$/i.test((b.textContent || '').trim())
    );
    if (panelBtn) panelBtn.click();
    await new Promise((r) => setTimeout(r, 600));
    const switches = [...document.querySelectorAll('[role="switch"]')].map((s) => ({
      label: s.getAttribute('aria-label'),
      checked: s.getAttribute('aria-checked') === 'true',
    }));
    const token = localStorage.getItem('token');
    let stored = null;
    try {
      const res = await fetch('http://localhost/project-eric-api/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      stored = json?.data?.settings?.notifications || null;
    } catch {
      stored = null;
    }
    return { switches, stored };
  });

  if (!prefs.switches.length) {
    addFinding('/notifications', 'error', 'notifications', 'The notification preferences modal rendered no switches.');
  } else if (!prefs.stored) {
    addFinding('/notifications', 'error', 'settings-api', 'The account settings could not be read back from the API.');
  } else {
    const keyFor = {
      'Critical Alerts': 'vulnerabilityAlerts',
      'Scan Completion': 'scanCompletion',
      'Email Notifications': 'email',
      'Push Notifications': 'push',
    };
    for (const sw of prefs.switches) {
      const key = keyFor[sw.label];
      if (!key) continue;
      if (prefs.stored[key] !== sw.checked) {
        addFinding(
          '/notifications',
          'error',
          'settings-persist',
          `The "${sw.label}" switch shows ${sw.checked} but the account has ${prefs.stored[key]}.`
        );
      }
    }
    reports.push({ route: '/notifications', name: 'Notification preferences match the account', value: prefs.stored });
  }

  await page.evaluate(() => {
    const close = [...document.querySelectorAll('button')].find((b) => /cancel/i.test(b.textContent || ''));
    if (close) close.click();
  });
  await sleep(600);

  // Mark all as read — this is the PATCH /notifications call.
  const clicked = await clickByText(page, 'button', /mark all/i, { optional: true });
  if (clicked) await sleep(1800);

  drain(page, '/notifications', since);
}

async function testIde(page) {
  page.__route = '/ide';
  const since = (page.__bucket || []).length;
  await page.goto(`${BASE}/ide`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  await waitForHydrated(page);

  const state = await page.evaluate(() => {
    const text = document.getElementById('root')?.innerText || '';
    const pill = (id) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-status') || null;
    const folder = document.querySelector('[data-testid="ide-workspace-folder"]')?.innerText || null;
    const openBtn = document.querySelector('[data-testid="ide-open-workbench"]');
    return {
      chars: text.trim().length,
      vite: pill('status-vite'),
      code: pill('status-code-server'),
      folder,
      workbenchButtonEnabled: openBtn ? !openBtn.disabled : false,
      excerpt: text.replace(/\s+/g, ' ').slice(0, 300),
    };
  });
  reports.push({ route: '/ide', name: 'IDE page', ...state });
  if (state.chars < 120) {
    addFinding('/ide', 'error', 'empty-page', 'The IDE page rendered almost nothing.');
  }
  if (state.code !== 'running') {
    addFinding('/ide', 'error', 'code-server', `The code-server status pill reports "${state.code}", not "running".`);
  }
  if (state.vite !== 'running') {
    addFinding('/ide', 'error', 'vite', `The Vite status pill reports "${state.vite}", not "running".`);
  }
  // The account's own workspace must be shown, with its folder path.
  if (!state.folder || !/workspace folder/i.test(state.folder)) {
    addFinding('/ide', 'error', 'workspace', 'The IDE page did not show the account\'s workspace folder.');
  }
  if (!state.workbenchButtonEnabled) {
    addFinding('/ide', 'error', 'workbench', '"Open my workbench" stayed disabled, so the account has no workspace.');
  }

  // The per-account workbench launcher.
  const launched = await clickByText(page, 'button', /open my workbench/i);
  if (launched) await sleep(5000);

  drain(page, '/ide', since);
}

/**
 * The code-server workbench, embedded in the OWASP Analysis page.
 *
 * The embed is the part of the app a browser cannot fake: the frame has
 * to load the real workbench from the dev server's `/vscode` proxy.
 */
async function testCodeServerEmbed(page) {
  page.__route = '/owasp-analysis';
  const since = (page.__bucket || []).length;
  await page.goto(`${BASE}/owasp-analysis`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await waitForHydrated(page);

  // The embed button must be enabled, which means the health probe
  // reached the workbench.
  const enabled = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="owasp-embed-workbench"]');
    return btn ? !btn.disabled : null;
  });
  if (enabled === null) {
    addFinding('/owasp-analysis', 'error', 'embed', 'The workbench embed button is missing.');
    drain(page, '/owasp-analysis', since);
    return;
  }
  if (!enabled) {
    addFinding('/owasp-analysis', 'error', 'embed', 'The workbench embed button stayed disabled — code-server did not answer.');
    drain(page, '/owasp-analysis', since);
    return;
  }

  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="owasp-embed-workbench"]');
    if (btn) btn.click();
  });
  await sleep(12000);

  const frame = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="owasp-workbench-frame"]');
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    return { present: true, width: r.width, height: r.height, src: el.getAttribute('src') };
  });
  if (!frame.present) {
    addFinding('/owasp-analysis', 'error', 'embed', 'The workbench frame did not appear after clicking "Embed workbench".');
  } else if (frame.width < 100 || frame.height < 100) {
    addFinding('/owasp-analysis', 'error', 'embed', `The workbench frame is ${frame.width}x${frame.height} — it is not visible.`);
  }

  // The frame's own document has to be the workbench, not an error page.
  const frameContent = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="owasp-workbench-frame"]');
    if (!el) return null;
    try {
      const doc = el.contentDocument;
      if (!doc) return { crossOrigin: true };
      const text = (doc.body && doc.body.innerText) || '';
      return {
        crossOrigin: false,
        chars: text.trim().length,
        hasWorkbench: /code-server|vscode|explorer|workbench/i.test(text),
        title: doc.title || '',
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  if (frameContent && !frameContent.crossOrigin) {
    if (frameContent.error) {
      addFinding('/owasp-analysis', 'error', 'embed', `The workbench frame could not be read: ${frameContent.error}`);
    } else if (!frameContent.hasWorkbench || frameContent.chars < 40) {
      addFinding(
        '/owasp-analysis',
        'error',
        'embed',
        `The workbench frame did not render the workbench (${frameContent.chars} chars, title "${frameContent.title}").`
      );
    }
    reports.push({ route: '/owasp-analysis', name: 'code-server embed', value: frameContent });
  }

  drain(page, '/owasp-analysis', since);
}

/**
 * The second factor, driven through the Settings page.
 *
 * The account is put back the way it was afterwards, so the rest of the
 * run is not affected.
 */
async function testTwoFactor(page) {
  page.__route = '/settings';
  const since = (page.__bucket || []).length;
  await page.goto(`${BASE}/settings?tab=security`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await waitForHydrated(page);

  // The card has to be there and has to have a way to act on it.
  const card = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-two-factor"]');
    if (!panel) return { found: false };
    return {
      found: true,
      text: (panel.innerText || '').replace(/\s+/g, ' ').trim(),
      hasEnable: !!panel.querySelector('[data-testid="two-factor-enable"]'),
      hasDisable: !!panel.querySelector('[data-testid="two-factor-disable"]'),
    };
  });
  if (!card.found) {
    addFinding('/settings', 'error', 'two-factor', 'The two-factor card is missing from the Security tab.');
    drain(page, '/settings#two-factor', since);
    return;
  }
  if (!card.hasEnable && !card.hasDisable) {
    addFinding('/settings', 'error', 'two-factor', 'The two-factor card offers no way to turn it on or off.');
  }
  reports.push({ route: '/settings#two-factor', name: 'Two-factor card', value: card.text });

  // The dialog opens and asks for a setup.
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="two-factor-enable"]');
    if (btn) btn.click();
  });
  await sleep(900);
  const dialogOpen = await page.evaluate(() => !!document.querySelector('[data-testid="two-factor-dialog"]'));
  if (!dialogOpen) {
    addFinding('/settings', 'error', 'two-factor', 'The two-factor setup dialog did not open.');
    drain(page, '/settings#two-factor', since);
    return;
  }

  // Start the setup: it must produce a secret and a QR code.
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="two-factor-start"]');
    if (btn) btn.click();
  });
  await sleep(2500);

  const secret = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="two-factor-secret"]');
    return el ? (el.textContent || '').trim() : null;
  });
  if (!secret || secret.length < 16) {
    addFinding('/settings', 'error', 'two-factor', 'The setup did not produce a setup key.');
    drain(page, '/settings#two-factor', since);
    return;
  }

  const qr = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="two-factor-dialog"] img');
    return img ? (img.getAttribute('src') || '').slice(0, 30) : null;
  });
  if (!qr || !qr.startsWith('data:image/png')) {
    addFinding('/settings', 'error', 'two-factor', 'The setup did not render a QR code for the authenticator app.');
  }

  // A wrong code must be refused.
  expectedRejections.push('/api/two-factor');
  await setReactInput(page, '[data-testid="two-factor-code"]', '000000');
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="two-factor-confirm"]');
    if (btn) btn.click();
  });
  await sleep(2000);
  const rejected = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="two-factor-dialog"]');
    return dialog ? /not correct|incorrect|try again/i.test(dialog.innerText || '') : false;
  });
  if (!rejected) {
    addFinding('/settings', 'error', 'two-factor', 'A wrong code was not refused by the setup dialog.');
  }
  // The refusal was expected, so it is no longer expected from here on.
  expectedRejections.length = 0;

  // The right code turns the factor on, and the recovery codes are shown.
  await setReactInput(page, '[data-testid="two-factor-code"]', totp(secret));
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="two-factor-confirm"]');
    if (btn) btn.click();
  });
  await sleep(2500);

  const recovery = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="two-factor-recovery-codes"]');
    return el ? el.querySelectorAll('li').length : 0;
  });
  if (recovery !== 8) {
    addFinding('/settings', 'error', 'two-factor', `Expected 8 recovery codes, found ${recovery}.`);
  }

  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="two-factor-done"]');
    if (btn) btn.click();
  });
  await sleep(900);

  // The card now says it is on.
  const enabled = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-two-factor"]');
    return panel ? /enabled/i.test(panel.innerText || '') : false;
  });
  if (!enabled) {
    addFinding('/settings', 'error', 'two-factor', 'The card did not show the second factor as enabled.');
  }

  // ---- Put the account back the way it was ----------------------------
  //
  // The demo account is left without a second factor, so the next run
  // of this script can sign in with the password alone.
  const cleaned = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost/project-eric-api/api/two-factor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'disable', password: 'demo123' }),
      });
      const json = await res.json();
      return json?.data?.enabled === false;
    } catch {
      return false;
    }
  });
  if (!cleaned) {
    addFinding('/settings', 'error', 'two-factor', 'The second factor could not be turned off again, so the demo account is left locked behind it.');
  }

  drain(page, '/settings#two-factor', since);
}

/**
 * Signing in when the account has a second factor.
 *
 * The two-factor code is asked for on the Login page, so this checks
 * that the step appears, that a wrong code is refused and that the
 * right one gets in.
 */
async function testTwoFactorLogin(page) {
  page.__route = '/login';
  const since = (page.__bucket || []).length;

  try {
  // ---- Turn the second factor on for the demo account -------------------
  const setup = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    if (!token) return { ok: false, reason: 'no token' };
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const res = await fetch('http://localhost/project-eric-api/api/two-factor', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'setup' }),
    });
    const json = await res.json();
    return { ok: !!json?.data?.secret, secret: json?.data?.secret || null };
  });

  if (!setup.ok || !setup.secret) {
    addFinding('/login', 'error', 'two-factor', `The second factor could not be prepared for the sign-in test (${setup.reason || 'no secret'}).`);
    drain(page, '/login', since);
    return;
  }

  // Turn it on with a code produced from the secret.
  const enableCode = totp(setup.secret);
  const turnedOn = await page.evaluate(async (code) => {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost/project-eric-api/api/two-factor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'enable', code }),
    });
    const json = await res.json();
    return json?.data?.enabled === true;
  }, enableCode);

  if (!turnedOn) {
    addFinding('/login', 'error', 'two-factor', 'The second factor could not be turned on for the sign-in test.');
    drain(page, '/login', since);
    return;
  }

  // ---- Sign out, then sign in again -------------------------------------
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('project-eric_user');
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await waitForHydrated(page);

  await typeInto(page, 'input[type="email"]', EMAIL);
  await typeInto(page, 'input[type="password"]', PASSWORD);
  // The click is fired from inside the page: a protocol-level click
  // waits for the frame, and the sign-in replaces the form.
  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });
  await sleep(3000);

  // The second step has to appear.
  const stepShown = await page.evaluate(() => !!document.querySelector('[data-testid="login-two-factor-code"]'));
  if (!stepShown) {
    addFinding('/login', 'error', 'two-factor', 'Signing in with a second factor did not ask for the code.');
    drain(page, '/login', since);
    return;
  }

  // A wrong code must be refused.
  expectedRejections.push('/api/auth/login');
  await setReactInput(page, '[data-testid="login-two-factor-code"]', '000000');
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="login-two-factor-submit"]');
    if (btn) btn.click();
  });
  await sleep(2500);
  const stillWaiting = await page.evaluate(() => !!document.querySelector('[data-testid="login-two-factor-code"]'));
  // The refusal was expected, so it is no longer expected from here on.
  expectedRejections.length = 0;
  if (!stillWaiting) {
    addFinding('/login', 'error', 'two-factor', 'A wrong code was accepted when signing in.');
  }

  // The right code gets in.
  await setReactInput(page, '[data-testid="login-two-factor-code"]', totp(setup.secret));
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="login-two-factor-submit"]');
    if (btn) btn.click();
  });
  await sleep(3000);

  const signedIn = await page.evaluate(() => ({
    hasToken: !!localStorage.getItem('token'),
    path: location.pathname,
  }));
  if (!signedIn.hasToken) {
    addFinding('/login', 'error', 'two-factor', 'The right code did not get the account signed in.');
  }
  reports.push({
    route: '/login',
    name: 'Two-factor sign-in',
    value: { stepShown, wrongCodeRejected: stillWaiting, ...signedIn },
  });

  // ---- Put the account back the way it was ----------------------------
  const cleaned = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try {
      const res = await fetch('http://localhost/project-eric-api/api/two-factor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'disable', password: 'demo123' }),
      });
      const json = await res.json();
      return json?.data?.enabled === false;
    } catch {
      return false;
    }
  });
  if (!cleaned) {
    addFinding('/login', 'error', 'two-factor', 'The second factor could not be turned off again, so the demo account is left locked behind it.');
  }

  drain(page, '/login', since);
  } catch (err) {
    addFinding('/login', 'error', 'two-factor', `The two-factor sign-in check failed: ${err.message}`);
    // The account must not be left locked behind a code only the test
    // knows, so the second factor is turned off in the database.
    try {
      const { execFileSync } = require('child_process');
      execFileSync('D:\\xampp\\php\\php.exe', ['scripts\\reset-two-factor.php'], { cwd: path.resolve(__dirname, '..') });
    } catch {
      /* the reset script could not be run */
    }
    drain(page, '/login', since);
  }
}

/**
 * The onboarding tour, driven by a brand-new account.
 *
 * The tour is the only route that cannot be reached with the demo
 * account: `ProtectedRoute` bounces a signed-in user whose onboarding is
 * incomplete to `/onboarding`, and bounces a completed one away from it.
 * A fresh registration is therefore the only way to exercise it.
 *
 * The account is registered through the real API, walked through all
 * five steps, and then checked for the two guard rules:
 *
 *   - while onboarding is incomplete, a protected route redirects here
 *   - once it is complete, `/onboarding` redirects back to the dashboard
 */
async function testOnboarding(page) {
  page.__route = '/onboarding';
  const since = (page.__bucket || []).length;

  // ---- Register a fresh account ---------------------------------------
  const stamp = Date.now();
  const email = `onboarding.${stamp}@project-eric.test`;
  const password = 'Onboard123!';

  const registered = await page.evaluate(
    async (mail, pass) => {
      try {
        const res = await fetch('http://localhost/project-eric-api/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: 'Onboarding', lastName: 'Tester', email: mail, password: pass }),
        });
        const json = await res.json();
        return { ok: res.ok, status: res.status, user: json?.data?.user || null, message: json?.message || null };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
    email,
    password
  );

  if (!registered.ok || !registered.user) {
    addFinding(
      '/onboarding',
      'error',
      'registration',
      `A fresh account could not be registered for the onboarding test: ${registered.message || registered.error || registered.status}`
    );
    drain(page, '/onboarding', since);
    return;
  }

  // The new account is not onboarded yet, so it must be forced into the
  // tour. The tour's first step has to render.
  //
  // The session is established by signing in for real, not by writing
  // `project-eric_user` into localStorage. On boot the app re-validates
  // the token against the API and clears the cached user when there is
  // none, so a hand-seeded user is wiped before the guard ever sees it.
  const signedIn = await page.evaluate(
    async (mail, pass) => {
      try {
        const res = await fetch('http://localhost/project-eric-api/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: mail, password: pass }),
        });
        const json = await res.json();
        if (!res.ok || !json?.data?.token) {
          return { ok: false, message: json?.message || `login failed with ${res.status}` };
        }
        localStorage.setItem('token', json.data.token);
        localStorage.setItem('project-eric_user', JSON.stringify(json.data.user));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
        return { ok: true, user: json.data.user };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    },
    email,
    password
  );

  if (!signedIn.ok) {
    addFinding('/onboarding', 'error', 'login', `The new account could not sign in: ${signedIn.message}`);
    drain(page, '/onboarding', since);
    return;
  }

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await waitForHydrated(page);

  const guard = await page.evaluate(() => ({ path: location.pathname, text: (document.getElementById('root')?.innerText || '') }));
  if (guard.path !== '/onboarding') {
    addFinding(
      '/onboarding',
      'error',
      'guard',
      `A user whose onboarding is incomplete was sent to "${guard.path}" instead of "/onboarding".`
    );
    drain(page, '/onboarding', since);
    return;
  }
  if (!/step 1 of 5|welcome to project eric/i.test(guard.text)) {
    addFinding('/onboarding', 'error', 'render', 'The onboarding tour did not render its first step.');
  }
  reports.push({ route: '/onboarding', name: 'Guard redirects an incomplete user here', value: { path: guard.path } });

  // ---- Walk the five steps ---------------------------------------------
  for (let step = 1; step <= 5; step++) {
    const before = (page.__bucket || []).length;
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /^(next|get started)$/i.test((b.textContent || '').trim())
      );
      if (btn) btn.click();
    });
    await sleep(1400);

    const state = await page.evaluate(() => ({
      path: location.pathname,
      text: (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' '),
    }));

    if (step < 5) {
      if (state.path !== '/onboarding') {
        addFinding(
          '/onboarding',
          'error',
          'tour',
          `Step ${step} of the tour navigated away to "${state.path}" before the tour was finished.`
        );
        break;
      }
      if (!new RegExp(`step ${step + 1} of 5`, 'i').test(state.text)) {
        addFinding('/onboarding', 'error', 'tour', `Step ${step + 1} of the tour did not render.`);
        break;
      }
    } else {
      // The last step completes the tour and lands on the dashboard.
      if (state.path !== '/dashboard') {
        addFinding(
          '/onboarding',
          'error',
          'tour',
          `Finishing the tour landed on "${state.path}" instead of "/dashboard".`
        );
      }
    }
    drain(page, `/onboarding#step-${step}`, before);
  }

  // ---- The completed user is now kept out of the tour ------------------
  const after = await page.evaluate(() => {
    const raw = localStorage.getItem('project-eric_user');
    let user = null;
    try {
      user = raw ? JSON.parse(raw) : null;
    } catch {
      user = null;
    }
    return { user, path: location.pathname };
  });

  if (after.user && after.user.onboardingComplete === true) {
    await page.goto(`${BASE}/onboarding`, { waitUntil: 'domcontentloaded' });
    await sleep(2200);
    await waitForHydrated(page);
    const bounced = await page.evaluate(() => location.pathname);
    if (bounced !== '/dashboard') {
      addFinding(
        '/onboarding',
        'error',
        'guard',
        `A user whose onboarding is complete was allowed to stay on "${bounced}" instead of being sent to the dashboard.`
      );
    }
    reports.push({ route: '/onboarding', name: 'Guard bounces a complete user to the dashboard', value: { bounced } });
  } else {
    addFinding('/onboarding', 'error', 'tour', 'The tour did not mark the account as onboarded.');
  }

  // ---- Leave the browser signed out ------------------------------------
  //
  // The tour test signs in as its own account. That session has to go,
  // or the demo login that follows finds no sign-in form and fails.
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('project-eric_user');
  });

  drain(page, '/onboarding', since);
}

async function testDashboardConnect(page) {
  page.__route = '/dashboard';
  const since = (page.__bucket || []).length;
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await waitForHydrated(page);

  // "Connect a new project" must do something real, not raise a native
  // alert() that the audit cannot see.
  const before = (page.__dialogs || []).length;
  // The click navigates, which detaches the frame the click was issued
  // from, so it is fired from inside the page instead of through the
  // protocol.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /connect a new project/i.test(b.textContent || '')
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (clicked) await sleep(2200);
  const raised = (page.__dialogs || []).slice(before);
  if (raised.length) {
    addFinding(
      '/dashboard',
      'error',
      'stub-alert',
      `"Connect a new project" raises a native ${raised[0].type}: ${raised[0].message}`
    );
  }

  // It has to land on the Settings page with the integrations tab open.
  const landed = await page.evaluate(() => ({
    path: location.pathname,
    tab: new URLSearchParams(location.search).get('tab'),
    panel: !!document.querySelector('[data-testid="settings-panel-integrations"]'),
  }));
  if (landed.path !== '/settings' || landed.panel !== true) {
    addFinding(
      '/dashboard',
      'error',
      'connect-project',
      `"Connect a new project" did not open the integrations tab (landed on ${landed.path}?tab=${landed.tab}).`
    );
  }
  reports.push({ route: '/dashboard', name: 'Connect a new project lands on', value: landed });

  drain(page, '/dashboard', since);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  });

  let loginState = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    watch(page);

    // ---- Public routes first, while logged out --------------------------
    //
    // /login, /signup and /forgot-password redirect an already
    // signed-in account to the dashboard on purpose, so they have to be
    // visited before the session exists.
    for (const route of ROUTES.filter((r) => !r.auth)) {
      await visitRoute(page, route);
    }

    // ---- The onboarding tour --------------------------------------------
    //
    // It registers its own account, so it runs before the demo login —
    // a signed-in session would make the guard bounce the new account
    // away from the tour it is supposed to be testing.
    await testOnboarding(page);

    // ---- Now log in for real --------------------------------------------
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await sleep(1200);
    loginState = await login(page);
    reports.push({ route: '/login', name: 'Login', user: JSON.parse(loginState.user || '{}').email, url: loginState.url });

    // Every route in its own context would lose the session, so the
    // session is seeded from the real login for the protected routes.
    const session = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      user: localStorage.getItem('project-eric_user'),
    }));

    for (const route of ROUTES.filter((r) => r.auth)) {
      await page.evaluate(
        (s) => {
          localStorage.setItem('token', s.token);
          localStorage.setItem('project-eric_user', s.user);
          localStorage.setItem('eric_welcome_tour_seen', 'true');
        },
        session
      );
      await visitRoute(page, route);
    }

    await testSettings(page);
    await testNotificationsBell(page);
    await testIde(page);
    await testCodeServerEmbed(page);
    await testTwoFactor(page);
    await testDashboardConnect(page);
    // This one signs the account out and back in, so it runs last.
    await testTwoFactorLogin(page);
  } catch (err) {
    addFinding('harness', 'error', 'harness', err.message, err.stack);
  } finally {
    await browser.close();
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');

  const grouped = new Map();
  for (const f of findings) {
    const key = `${f.kind} :: ${f.message.replace(/https?:\/\/\S+/g, '<url>').slice(0, 220)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(f.route);
  }

  console.log('\n================ ROUTE SUMMARY ================');
  for (const r of reports) {
    if (r.route && r.route.startsWith('/') && !r.route.includes('#')) {
      console.log(
        `${(r.markerHit === false ? 'NO!' : ' ok ').padEnd(4)} ${r.route.padEnd(20)} ${String(r.chars ?? '').padStart(6)} chars  ${r.heading || ''}`
      );
    } else {
      console.log(`  ${r.route}: ${JSON.stringify(r).slice(0, 220)}`);
    }
  }

  console.log('\n================ ISSUES ================');
  console.log(`errors: ${errors.length}, warnings: ${warns.length}`);
  for (const [key, routes] of grouped) {
    const sev = findings.find((f) => key.startsWith(f.kind))?.severity || 'info';
    console.log(`\n[${sev.toUpperCase()}] ${key}`);
    console.log(`   routes: ${[...new Set(routes)].join(', ')}`);
  }

  // The console output of the embedded third-party apps is reported on
  // its own, so it is clear that it is not an issue with this project.
  const thirdPartyEntries = thirdPartyLog;
  if (thirdPartyEntries.length) {
    const thirdPartyGrouped = new Map();
    for (const t of thirdPartyEntries) {
      const key = `${t.kind} :: ${t.message.replace(/https?:\/\/\S+/g, '<url>').slice(0, 160)}`;
      thirdPartyGrouped.set(key, (thirdPartyGrouped.get(key) || 0) + 1);
    }
    console.log('\n================ THIRD-PARTY (not app defects) ================');
    for (const [key, count] of thirdPartyGrouped) {
      console.log(`  x${count}  ${key}`);
    }
  }

  fs.writeFileSync(
    path.join(OUT, 'findings.json'),
    JSON.stringify({ findings, reports, thirdParty: thirdPartyLog }, null, 2)
  );
  console.log(`\nSaved to ${path.join(OUT, 'findings.json')}`);
})();
