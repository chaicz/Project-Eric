/**
 * Project Eric — DOM, event and invalid-data audit.
 *
 * Drives a real Chrome through the whole application and reports what the
 * system does when it is given bad data or when its backend misbehaves.
 *
 *   Phase 1  census     Every route: DOM census, dead controls, unbound and
 *                        unlabelled fields, accessibility gaps, console
 *                        errors, failed requests, HTTP errors.
 *   Phase 2  newuser    What a brand-new account actually sees: signup
 *                        through the real form, the onboarding wizard, the
 *                        welcome tour, the empty states, data isolation and
 *                        logout.
 *   Phase 3  invalid    Every form fed wrong data: empty, whitespace, wrong
 *                        format, wrong type, oversized, unicode, SQL
 *                        injection and XSS payloads. Each case is classified
 *                        as client-validated, server-rejected, silently
 *                        accepted or crashed.
 *   Phase 4  faults     The API is made to fail: HTTP 500, HTTP 401, a
 *                        malformed body, and a dead connection. The page has
 *                        to degrade, not crash.
 *
 *   node scripts/dom-error-audit.cjs             # everything
 *   node scripts/dom-error-audit.cjs census      # one phase
 *   node scripts/dom-error-audit.cjs newuser invalid
 *
 * Results are written to logs/dom-error-audit/.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve(__dirname, '..', 'logs', 'dom-error-audit');

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
    message: String(message).slice(0, 700),
    extra: extra === undefined ? undefined : String(extra).slice(0, 700),
  });
}

const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /not wrapped in act/i,
  /React Router Future Flag/i,
  /\[vite\]/i,
  /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/i,
  /WebSocket connection to .* failed/i,
  /favicon/i,
];

const isNoise = (text) => IGNORE_CONSOLE.some((re) => re.test(text));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const ROUTES = [
  { path: '/landing', auth: false, markers: ['SECURE CODE'] },
  { path: '/terms-of-service', auth: false, markers: ['Terms of Service'] },
  { path: '/privacy-policy', auth: false, markers: ['Privacy Policy'] },
  { path: '/viewer', auth: false, markers: [] },
  { path: '/login', auth: false, markers: ['Sign in to your account'] },
  { path: '/signup', auth: false, markers: ['Create your account'] },
  { path: '/forgot-password', auth: false, markers: [] },
  { path: '/onboarding', auth: false, markers: [] },
  { path: '/dashboard', auth: true, markers: ['Quick Actions'] },
  { path: '/security', auth: true, markers: ['Security'] },
  { path: '/team', auth: true, markers: ['Invite'] },
  { path: '/about-team', auth: true, markers: ['About Developer Team'] },
  { path: '/api-keys', auth: true, markers: ['AI API Keys'] },
  { path: '/audit-logs', auth: true, markers: ['Audit Logs'] },
  { path: '/notifications', auth: true, markers: ['Notifications'] },
  { path: '/settings', auth: true, markers: ['Settings'] },
  { path: '/profile', auth: true, markers: ['Profile'] },
  { path: '/sandbox', auth: true, markers: ['sandbox'] },
  { path: '/owasp', auth: true, markers: ['OWASP'] },
  { path: '/owasp-analysis', auth: true, markers: ['OWASP'] },
  { path: '/ide', auth: true, markers: [] },
  // Catch-all route: an unknown URL has to fall back to the landing page.
  { path: '/this-route-does-not-exist', auth: false, markers: [], catchAll: true },
];

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

let browser;

async function newPage({ seed = null, viewport = { width: 1600, height: 1000 }, promptValue = null, tourSeen = true } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);

  if (seed) {
    await page.evaluateOnNewDocument(
      (s) => {
        try {
          localStorage.setItem('token', s.token);
          localStorage.setItem('project-eric_user', JSON.stringify(s.user));
          // The welcome tour is a first-run experience. A test that wants
          // to see it must not have this flag set.
          if (s.tourSeen) localStorage.setItem('eric_welcome_tour_seen', 'true');
          else localStorage.removeItem('eric_welcome_tour_seen');
        } catch {
          /* not a real origin yet */
        }
      },
      { token: seed.token, user: seed.user, tourSeen }
    );
  }

  page.on('dialog', async (d) => {
    if (d.type() === 'prompt' && promptValue !== null) {
      await d.accept(promptValue).catch(() => {});
      return;
    }
    await d.dismiss().catch(() => {});
  });

  page.on('popup', (p) => p.close().catch(() => {}));

  return { context, page };
}

/** Collect console errors, page errors, failed requests and HTTP errors. */
function instrument(page) {
  const bucket = [];
  const listeners = [];
  const requests = [];

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
  const onRequest = (req) => {
    requests.push({ method: req.method(), url: req.url(), type: req.resourceType() });
  };
  const onResponse = async (res) => {
    const url = res.url();
    const entry = { status: res.status(), url, method: res.request().method() };
    requests.push(entry);
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
    ['request', page.on('request', onRequest)],
    ['response', page.on('response', onResponse)]
  );

  return {
    bucket,
    requests,
    drain() {
      return bucket.splice(0, bucket.length);
    },
    /** API responses recorded since a given marker. */
    apiResponsesSince(marker) {
      return requests.slice(marker).filter((r) => r.status !== undefined);
    },
    detach() {
      listeners.forEach(([event, handler]) => page.off(event, handler));
    },
  };
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** Wait until React has mounted and taken over the document. */
async function waitForHydrated(page, timeout = 20000) {
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
  await sleep(400);
}

/** Set a React-controlled input's value so React sees the change. */
async function setReactInput(page, selector, value) {
  const ok = await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const proto =
        el instanceof window.HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : el instanceof window.HTMLSelectElement
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    selector,
    value
  );
  await sleep(200);
  return ok;
}

/** Click a visible button or link whose text matches. */
async function clickText(page, selector, regex, { optional = true } = {}) {
  const clicked = await page.evaluate(
    (sel, src) => {
      const re = new RegExp(src, 'i');
      const node = [...document.querySelectorAll(sel)].find((n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (n.disabled) return false;
        const text = `${n.getAttribute('aria-label') || ''} ${n.textContent || ''}`.trim();
        return re.test(text);
      });
      if (!node) return false;
      node.click();
      return true;
    },
    selector,
    regex.source
  );
  if (!clicked && !optional) {
    throw new Error(`No visible ${selector} matching /${regex.source}/`);
  }
  return clicked;
}

/** Read the visible text of the app, with whitespace collapsed. */
async function readText(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    return ((root && root.innerText) || '').replace(/\s+/g, ' ').trim();
  });
}

/** Did the error boundary catch a render error? */
async function crashed(page) {
  return page.evaluate(() => /Something went wrong/i.test(document.body.innerText));
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

/** Close the welcome tour if it is open. */
async function dismissTour(page) {
  await clickText(page, 'button', /skip tour|close tour|got it/i);
  await sleep(300);
}

/** Sign in through the real login form. */
async function loginViaUI(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await sleep(600);
  await setReactInput(page, 'input[type="email"]', email);
  await setReactInput(page, 'input[type="password"]', password);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /sign in/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await page
    .waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 })
    .catch(() => {});
  await sleep(1200);
  return page.evaluate(() => ({
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('project-eric_user') || 'null'),
    path: location.pathname,
  }));
}

/** Create an account through the public API. */
async function registerViaAPI(email, password = 'AuditTest123!') {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Audit', lastName: 'Tester', email, password }),
  });
  const payload = await res.json().catch(() => null);
  if (!payload?.data?.token) {
    throw new Error(`register failed: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return { token: payload.data.token, user: payload.data.user };
}

/** Mark onboarding complete so a fresh account can reach the app. */
async function completeOnboarding(token, data = {}) {
  const res = await fetch(`${API}/auth/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      experience: 'Full-stack developer',
      languages: ['javascript'],
      securityFocus: 'Injection',
      ...data,
    }),
  });
  const payload = await res.json().catch(() => null);
  return payload?.data?.user || null;
}

// ---------------------------------------------------------------------------
// The DOM census — what is actually on each page
// ---------------------------------------------------------------------------

async function census(page) {
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

    const labelOf = (el) =>
      (el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent ||
        el.getAttribute('placeholder') ||
        el.getAttribute('name') ||
        el.id ||
        '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70) || '(unlabelled)';

    const describeControl = (el) => {
      const props = reactProps(el);
      const tag = el.tagName.toLowerCase();
      const isLink = tag === 'a';
      const href = isLink ? el.getAttribute('href') || '' : '';
      const inForm = !!(el.form || el.closest('form'));
      const type = (el.getAttribute('type') || '').toLowerCase();
      const isSubmit = type === 'submit' || (inForm && tag === 'button' && !type);

      const hasHandler = !!(
        props &&
        (props.onClick || props.onMouseDown || props.onMouseUp || props.onKeyDown ||
          props.onChange || props.onSubmit || props.onInput || props.onBlur)
      );

      // A link with a real href does something even without an onClick.
      const linkDoesSomething = isLink && href && href !== '#' && !/^javascript:/i.test(href);

      return {
        tag,
        label: labelOf(el),
        href,
        path: cssPath(el),
        disabled: !!el.disabled || (props && props.disabled === true),
        hasHandler,
        reactBound: !!props,
        linkDoesSomething,
        isSubmit,
        inForm,
        type,
        // A button inside a form with no explicit type submits the form
        // when it is pressed.
        implicitSubmit: inForm && tag === 'button' && !type,
      };
    };

    const controls = [...document.querySelectorAll('button, [role="button"], a[href]')]
      .filter(isVisible)
      .map(describeControl);

    const fields = [...document.querySelectorAll('input, textarea, select')]
      .filter(isVisible)
      .filter((el) => el.type !== 'hidden')
      .map((el) => {
        const props = reactProps(el);
        const bound = !!(props && (props.onChange || props.onInput || props.onBlur));
        const id = el.id;
        const hasLabel =
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          el.closest('label') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.getAttribute('placeholder');
        return {
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          label: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || id || el.type || '').trim().slice(0, 60),
          bound,
          reactBound: !!props,
          hasLabel: !!hasLabel,
          required: !!el.required,
          minLength: el.minLength ?? null,
          maxLength: el.maxLength ?? null,
          pattern: el.getAttribute('pattern'),
          disabled: !!el.disabled,
          path: cssPath(el),
        };
      });

    // Accessibility and markup problems.
    const a11y = [];

    // An icon-only button with no accessible name.
    document.querySelectorAll('button, [role="button"], a[href]').forEach((el) => {
      if (!isVisible(el)) return;
      const name =
        (el.getAttribute('aria-label') || '').trim() ||
        (el.getAttribute('title') || '').trim() ||
        (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name) {
        a11y.push({ kind: 'no-accessible-name', path: cssPath(el), detail: el.outerHTML.slice(0, 160) });
      }
    });

    // An image with no alt attribute.
    document.querySelectorAll('img').forEach((el) => {
      if (!el.getAttribute('alt')) {
        a11y.push({ kind: 'img-missing-alt', path: cssPath(el), detail: (el.getAttribute('src') || '').slice(0, 120) });
      }
    });

    // A form with no submit control of any kind.
    document.querySelectorAll('form').forEach((el) => {
      const hasSubmit = [...el.querySelectorAll('button, input')].some(
        (b) => (b.getAttribute('type') || '').toLowerCase() === 'submit' || b.type === 'submit'
      );
      if (!hasSubmit) {
        a11y.push({ kind: 'form-without-submit', path: cssPath(el), detail: el.outerHTML.slice(0, 160) });
      }
    });

    // A duplicated id attribute.
    const seenIds = new Map();
    document.querySelectorAll('[id]').forEach((el) => {
      const id = el.id;
      if (!id) return;
      if (seenIds.has(id)) {
        a11y.push({ kind: 'duplicate-id', path: cssPath(el), detail: id });
      } else {
        seenIds.set(id, true);
      }
    });

    // A label pointing at an id that does not exist.
    document.querySelectorAll('label[for]').forEach((el) => {
      const target = el.getAttribute('for');
      if (target && !document.getElementById(target)) {
        a11y.push({ kind: 'label-for-missing-target', path: cssPath(el), detail: target });
      }
    });

    // A field with no programmatic label at all.
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.type === 'hidden') return;
      if (!isVisible(el)) return;
      const id = el.id;
      const named =
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        el.closest('label') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title');
      if (!named) {
        a11y.push({ kind: 'field-without-label', path: cssPath(el), detail: `${el.tagName}[${el.type || ''}]` });
      }
    });

    // A focusable element that cannot be reached by keyboard.
    const focusables = document.querySelectorAll(
      'a[href], button, input, textarea, select, [tabindex]'
    );
    let unreachable = 0;
    focusables.forEach((el) => {
      if (!isVisible(el)) return;
      const tabindex = el.getAttribute('tabindex');
      if (tabindex !== null && Number(tabindex) < 0) unreachable += 1;
    });

    // A horizontal overflow — a layout bug that shows up on smaller screens.
    const overflow = Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );

    return {
      title: document.title,
      heading: document.querySelector('h1, h2')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || null,
      controls,
      fields,
      a11y,
      focusables: focusables.length,
      unreachable,
      overflow,
      domNodes: document.getElementsByTagName('*').length,
      textLength: (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' ').trim().length,
    };
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — census
// ---------------------------------------------------------------------------

async function phaseCensus(session) {
  console.log('\n=== PHASE 1: DOM census ===');
  const routeReports = [];

  for (const route of ROUTES) {
    if (!(await devServerAlive())) {
      addFinding('census', route.path, 'error', 'infrastructure', 'The dev server stopped answering; route skipped');
      continue;
    }

    const { context, page } = await newPage({
      seed: route.auth ? { token: session.token, user: session.user } : null,
    });
    const probe = instrument(page);

    process.stdout.write(`  ${route.path.padEnd(30)}`);

    let navOk = true;
    try {
      await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
      navOk = false;
      addFinding('census', route.path, 'error', 'navigation', `Page load failed: ${err.message}`);
    }

    if (navOk) {
      await page
        .waitForFunction(
          () => {
            const root = document.getElementById('root');
            const text = ((root && root.innerText) || '').replace(/\s+/g, ' ');
            return text.trim().length > 40;
          },
          { timeout: 15000 }
        )
        .catch(() => {});
      await waitForHydrated(page);
      await dismissTour(page);
      await sleep(700);
    }

    const text = await readText(page);
    const finalPath = page.url().replace(BASE, '') || '/';

    // The catch-all route has to land on the landing page.
    if (route.catchAll && finalPath !== '/landing') {
      addFinding('census', route.path, 'error', 'routing', `An unknown URL landed on ${finalPath} instead of /landing`);
    }

    // A route that renders nothing at all.
    if (navOk && text.length < 40) {
      addFinding('census', route.path, 'error', 'render', `The page rendered almost nothing (${text.length} characters)`);
    }

    if (await crashed(page)) {
      addFinding('census', route.path, 'error', 'errorboundary', 'The error boundary caught a render error', text.slice(0, 300));
    }

    // A protected route must not be reachable without a session.
    if (route.auth === false && route.path === '/dashboard') {
      // (not used, kept for clarity)
    }

    const c = navOk ? await census(page) : { controls: [], fields: [], a11y: [], overflow: 0 };

    // Dead controls: nothing behind them.
    const dead = c.controls.filter(
      (x) => !x.disabled && !x.hasHandler && !x.linkDoesSomething && !x.isSubmit && !x.implicitSubmit
    );
    for (const d of dead) {
      addFinding('census', route.path, 'error', 'dead-control', `Control does nothing: <${d.tag}> "${d.label}" has no click handler and no link`, d.path);
    }

    // A button inside a form with no type submits the form by accident.
    const implicit = c.controls.filter((x) => x.implicitSubmit && !/submit|save|continue|next|confirm|sign|create|invite|send|run|start|add/i.test(x.label));
    for (const d of implicit) {
      addFinding('census', route.path, 'warn', 'implicit-submit', `A <button> inside a form has no type="button", so "${d.label}" submits the form when clicked`, d.path);
    }

    // Fields that are not wired to React state.
    const unbound = c.fields.filter((f) => !f.bound && !f.disabled);
    for (const f of unbound) {
      addFinding('census', route.path, 'warn', 'unbound-field', `Form field "${f.label}" (${f.tag}/${f.type}) is not bound to React state`, f.path);
    }

    // Accessibility problems.
    for (const a of c.a11y) {
      const severity = a.kind === 'no-accessible-name' ? 'warn' : 'warn';
      addFinding('census', route.path, severity, `a11y.${a.kind}`, `${a.kind}: ${a.detail}`, a.path);
    }

    // Horizontal overflow.
    if (c.overflow > 4) {
      addFinding('census', route.path, 'warn', 'layout-overflow', `The page overflows horizontally by ${c.overflow}px`);
    }

    const errors = probe.drain();
    for (const e of errors) {
      addFinding('census', route.path, e.severity, e.kind, e.message, e.extra);
    }

    routeReports.push({
      route: route.path,
      landedOn: finalPath,
      heading: c.heading,
      domNodes: c.domNodes,
      controls: c.controls.length,
      fields: c.fields.length,
      dead: dead.length,
      unbound: unbound.length,
      a11y: c.a11y.length,
      overflow: c.overflow,
      errors: errors.filter((e) => e.severity === 'error').length,
      warnings: errors.filter((e) => e.severity === 'warn').length,
    });

    console.log(
      `ok=y nodes=${String(c.domNodes).padStart(5)} ctl=${String(c.controls.length).padStart(3)} fld=${String(c.fields.length).padStart(2)} dead=${dead.length} a11y=${c.a11y.length} err=${errors.filter((e) => e.severity === 'error').length}`
    );

    probe.detach();
    await context.close();
  }

  reports.census = routeReports;
  return routeReports;
}

// ---------------------------------------------------------------------------
// Phase 2 — the new-user journey
// ---------------------------------------------------------------------------

async function phaseNewUser() {
  console.log('\n=== PHASE 2: the new-user journey ===');
  const results = { steps: [] };
  const stamp = Date.now();
  const email = `dom.audit+${stamp}@project-eric.test`;
  const password = 'Str0ng-Passw0rd!23';

  const step = (name, ok, detail) => {
    results.steps.push({ name, ok, detail });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) addFinding('newuser', name, 'error', 'journey', detail || 'The step did not behave as expected');
  };

  // ---- signup through the real form --------------------------------------
  {
    const { context, page } = await newPage();
    const probe = instrument(page);
    await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email', { timeout: 15000 });
    await waitForHydrated(page);

    // Empty submit has to be refused with a message.
    await page.evaluate(() => {
      const b = document.querySelector('button[type="submit"]');
      if (b) b.click();
    });
    await sleep(700);
    const emptyText = await readText(page);
    const emptyRejected = /required/i.test(emptyText) && page.url().includes('/signup');
    step('signup rejects an empty form', emptyRejected, emptyRejected ? '' : 'no validation message appeared');

    // A mismatched password has to be refused.
    await setReactInput(page, '#name', 'DOM Audit');
    await setReactInput(page, '#email', email);
    await setReactInput(page, '#password', password);
    await setReactInput(page, '#confirmPassword', 'Different-Passw0rd!9');
    await page.evaluate(() => {
      const b = document.querySelector('button[type="submit"]');
      if (b) b.click();
    });
    await sleep(700);
    const mismatchText = await readText(page);
    const mismatchRejected = /do not match/i.test(mismatchText) && page.url().includes('/signup');
    step('signup rejects mismatched passwords', mismatchRejected, mismatchRejected ? '' : 'the mismatch was not reported');

    // Accept the terms and register for real. The confirm field still holds
    // the mismatching value from the check above, so it is corrected first.
    await setReactInput(page, '#confirmPassword', password);
    await clickText(page, 'button', /I agree to the/i);
    await sleep(300);
    await page.evaluate(() => {
      const b = document.querySelector('button[type="submit"]');
      if (b) b.click();
    });
    await page
      .waitForFunction(() => !location.pathname.startsWith('/signup'), { timeout: 25000 })
      .catch(() => {});
    await sleep(1500);
    const landed = page.url().replace(BASE, '');
    const session = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      user: JSON.parse(localStorage.getItem('project-eric_user') || 'null'),
    }));
    step(
      'signup creates a session and lands on onboarding',
      !!session.token && landed === '/onboarding',
      `landed on ${landed}, token=${!!session.token}`
    );
    results.account = email;
    results.session = { token: session.token, user: session.user };

    for (const e of probe.drain()) {
      addFinding('newuser', '/signup', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
  }

  const session = results.session;
  if (!session?.token) {
    addFinding('newuser', '(setup)', 'error', 'setup', 'Could not create a new account; the rest of the journey was skipped');
    reports.newuser = results;
    return results;
  }

  // ---- onboarding wizard --------------------------------------------------
  {
    // The wizard is behind the auth guard, so the new account's session is
    // seeded before the page loads.
    const { context, page } = await newPage({ seed: { token: session.token, user: session.user } });
    const probe = instrument(page);
    await page.goto(`${BASE}/onboarding`, { waitUntil: 'domcontentloaded' });
    await waitForHydrated(page);
    await sleep(900);

    const sawSteps = [];
    for (let i = 0; i < 8; i += 1) {
      const heading = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h1, h2, h3')]
          .map((x) => (x.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        return h[0] || null;
      });
      if (heading) sawSteps.push(heading);
      const done = await clickText(page, 'button', /get started/i);
      if (done) break;
      const next = await clickText(page, 'button', /^next$/i);
      if (!next) break;
      await sleep(900);
    }

    await sleep(1500);
    const landed = page.url().replace(BASE, '');
    step('the onboarding wizard can be walked to the end', landed === '/dashboard', `landed on ${landed}`);
    results.onboardingSteps = sawSteps;

    for (const e of probe.drain()) {
      addFinding('newuser', '/onboarding', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
  }

  // The onboarding flag has to be on the server too, or a refresh throws the
  // user back into the wizard.
  const updatedUser = await completeOnboarding(session.token);
  const persisted = updatedUser?.onboardingComplete === true;
  step('the onboarding flag is persisted on the server', persisted, persisted ? '' : 'the API did not report onboardingComplete');
  if (updatedUser) session.user = { ...session.user, ...updatedUser, onboardingComplete: true };

  // ---- the welcome tour ----------------------------------------------------
  {
    // `tourSeen: false` leaves the first-run flag unset, which is what a
    // brand-new account actually looks like.
    const { context, page } = await newPage({
      seed: { token: session.token, user: session.user },
      tourSeen: false,
    });
    const probe = instrument(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await waitForHydrated(page);
    await sleep(2200);
    const tourOpen = await page.evaluate(() => /step \d+ of \d+/i.test(document.body.innerText));
    let finished = false;
    if (tourOpen) {
      for (let i = 0; i < 14; i += 1) {
        const clicked = await page.evaluate(() => {
          const scope = document.querySelector('.z-\\[60\\]') || document;
          const btn = [...scope.querySelectorAll('button')].find((b) =>
            /start tour|next:|finish tour|got it/i.test(b.textContent || '')
          );
          if (btn) { btn.click(); return true; }
          const skip = [...scope.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
          if (skip) { skip.click(); return true; }
          return false;
        });
        if (!clicked) break;
        await sleep(700);
      }
      finished = !(await page.evaluate(() => /step \d+ of \d+/i.test(document.body.innerText)));
    }
    step('the welcome tour opens for a first-time user', tourOpen, tourOpen ? '' : 'the tour never appeared');
    step('the welcome tour can be walked to the end', tourOpen ? finished : false, tourOpen && !finished ? 'the tour would not finish' : '');

    for (const e of probe.drain()) {
      addFinding('newuser', '/dashboard', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
  }

  // ---- the empty states and data isolation ---------------------------------
  {
    const { context, page } = await newPage({ seed: { token: session.token, user: session.user } });
    const probe = instrument(page);

    const isolationChecks = [
      { route: '/dashboard', label: 'the dashboard shows no seeded project', pattern: /Payments API|Project Alpha|E-commerce/i },
      { route: '/security', label: 'the security page starts empty', pattern: /SQL Injection in User Login|Cross-Site Scripting/i },
      { route: '/security?tab=threats', label: 'the threats view starts empty', pattern: /Ransomware Attack|SQL Injection/i },
      { route: '/security?tab=reports', label: 'the reports view starts empty', pattern: /Security Assessment Report.*2024/i },
    ];

    for (const check of isolationChecks) {
      await page.goto(BASE + check.route, { waitUntil: 'domcontentloaded' });
      await waitForHydrated(page);
      await dismissTour(page);
      await sleep(1800);
      const text = await readText(page);
      const leaked = check.pattern.test(text);
      step(check.label, !leaked, leaked ? `the page showed ${check.pattern}` : '');
    }

    // The account's own API data has to be empty too.
    const apiChecks = await Promise.all(
      ['/projects', '/vulnerabilities', '/scans', '/notifications', '/api-keys'].map(async (ep) => {
        const res = await fetch(`${API}${ep}`, { headers: { Authorization: `Bearer ${session.token}` } });
        const body = await res.json().catch(() => null);
        return { ep, status: res.status, body };
      })
    );
    results.apiIsolation = apiChecks.map((c) => ({ ep: c.ep, status: c.status }));

    // The new account sees exactly one team member: itself.
    const teamRes = await fetch(`${API}/team/members`, { headers: { Authorization: `Bearer ${session.token}` } });
    const teamBody = await teamRes.json().catch(() => null);
    const members = teamBody?.data?.members || [];
    const invitations = teamBody?.data?.invitations || [];
    const onlySelf = members.length === 1 && String(members[0].email).toLowerCase() === email.toLowerCase();
    step('a new account sees only itself on the team', onlySelf, `members=${members.length}, invitations=${invitations.length}`);
    step('a new account has no pending invitations', invitations.length === 0, `invitations=${invitations.length}`);

    for (const e of probe.drain()) {
      addFinding('newuser', '(pages)', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
  }

  // ---- logout --------------------------------------------------------------
  {
    const { context, page } = await newPage({ seed: { token: session.token, user: session.user } });
    const probe = instrument(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await waitForHydrated(page);
    await dismissTour(page);
    await sleep(1200);

    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /logout|sign out/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await sleep(2500);
    const after = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      userRaw: localStorage.getItem('project-eric_user'),
      // The app stores the user as JSON, so a signed-out session holds the
      // literal string "null". What matters is that it parses to nothing.
      user: (() => {
        try {
          return JSON.parse(localStorage.getItem('project-eric_user') || 'null');
        } catch {
          return 'unparseable';
        }
      })(),
      path: location.pathname,
    }));
    step('logout clears the session token', clicked && !after.token, clicked ? 'the token survived' : 'no logout control was found');
    step('logout clears the cached user', clicked && !after.user, clicked ? `the cached user survived (${after.userRaw})` : '');
    step('logout returns to the landing page', clicked && /^\/(landing|login)/.test(after.path), `ended on ${after.path}`);

    for (const e of probe.drain()) {
      addFinding('newuser', '/dashboard', e.severity, e.kind, e.message, e.extra);
    }
    probe.detach();
    await context.close();
  }

  reports.newuser = results;
  return results;
}

// ---------------------------------------------------------------------------
// Phase 3 — invalid data
// ---------------------------------------------------------------------------

const XSS_PAYLOAD = '<img src=x onerror="window.__xssFired=1">';
const SQLI_PAYLOAD = "' OR '1'='1' --";

/**
 * Each form under test.
 *
 *   fill     the values to type into the fields, by selector
 *   submit   the control that submits the form
 *   setup    optional preparation (open a modal, switch a tab)
 */
const FORM_SPECS = [
  {
    id: 'login',
    route: '/login',
    auth: false,
    submit: 'button[type="submit"]',
    cases: [
      { name: 'empty', fill: {}, expect: 'validation' },
      { name: 'malformed email', fill: { 'input[type="email"]': 'not-an-email' }, expect: 'validation' },
      { name: 'email with only a domain', fill: { 'input[type="email"]': '@example.com' }, expect: 'validation' },
      { name: 'whitespace-only email', fill: { 'input[type="email"]': '    ' }, expect: 'validation' },
      { name: 'short password', fill: { 'input[type="email"]': 'a@b.co', 'input[type="password"]': 'x' }, expect: 'validation' },
      { name: 'email with SQL injection', fill: { 'input[type="email"]': `${SQLI_PAYLOAD}@example.com` }, expect: 'validation' },
      { name: 'email with an XSS payload', fill: { 'input[type="email"]': `${XSS_PAYLOAD}@example.com` }, expect: 'validation' },
      { name: 'oversized email', fill: { 'input[type="email"]': `${'a'.repeat(5000)}@example.com` }, expect: 'validation' },
      { name: 'unicode email', fill: { 'input[type="email"]': '用户@example.com' }, expect: 'validation' },
      { name: 'password containing an XSS payload', fill: { 'input[type="email"]': 'a@b.co', 'input[type="password"]': XSS_PAYLOAD }, expect: 'server-reject' },
    ],
  },
  {
    id: 'signup',
    route: '/signup',
    auth: false,
    submit: 'button[type="submit"]',
    setup: async (page) => {
      await clickText(page, 'button', /I agree to the/i);
      await sleep(200);
    },
    cases: [
      { name: 'empty', fill: {}, expect: 'validation' },
      { name: 'a one-character name', fill: { '#name': 'A' }, expect: 'validation' },
      { name: 'a whitespace-only name', fill: { '#name': '   ' }, expect: 'validation' },
      { name: 'a malformed email', fill: { '#email': 'nope' }, expect: 'validation' },
      { name: 'a short password', fill: { '#password': 'Ab1!' }, expect: 'validation' },
      { name: 'mismatched passwords', fill: { '#password': 'Abcdefg1!', '#confirmPassword': 'Abcdefg2!' }, expect: 'validation' },
      { name: 'a name with an XSS payload', fill: { '#name': XSS_PAYLOAD }, expect: 'validation' },
      { name: 'a name with a SQL injection payload', fill: { '#name': SQLI_PAYLOAD }, expect: 'validation' },
      { name: 'an oversized name', fill: { '#name': 'A'.repeat(4000) }, expect: 'validation' },
      { name: 'a name in a non-Latin script', fill: { '#name': 'ユーザー名' }, expect: 'validation' },
    ],
  },
  {
    id: 'forgot-password',
    route: '/forgot-password',
    auth: false,
    submit: 'button[type="submit"]',
    cases: [
      { name: 'empty', fill: {}, expect: 'validation' },
      { name: 'a malformed email', fill: { 'input[type="email"]': 'not-an-email' }, expect: 'validation' },
      { name: 'a whitespace-only email', fill: { 'input[type="email"]': '   ' }, expect: 'validation' },
    ],
  },
  {
    id: 'team-invite',
    route: '/team',
    auth: true,
    submit: 'form button[type="submit"]',
    setup: async (page) => {
      await clickText(page, 'button', /invite member/i);
      await sleep(700);
    },
    cases: [
      { name: 'an empty address', fill: {}, expect: 'validation' },
      { name: 'a malformed address', fill: { 'input[placeholder*="colleague"]': 'not-an-email' }, expect: 'server-reject' },
      { name: 'an address with SQL injection', fill: { 'input[placeholder*="colleague"]': SQLI_PAYLOAD }, expect: 'server-reject' },
      { name: 'an address with an XSS payload', fill: { 'input[placeholder*="colleague"]': XSS_PAYLOAD }, expect: 'server-reject' },
      { name: 'an oversized address', fill: { 'input[placeholder*="colleague"]': `${'a'.repeat(3000)}@example.com` }, expect: 'server-reject' },
    ],
  },
  {
    id: 'settings-password',
    route: '/settings',
    auth: true,
    submit: null,
    setup: async (page) => {
      await page.click('[data-testid="settings-tab-security"]');
      await sleep(900);
      await clickText(page, 'button', /change password/i);
      await sleep(700);
    },
    submitText: /update password|change password/i,
    cases: [
      { name: 'an empty current password', fill: {}, expect: 'validation' },
      { name: 'a short new password', fill: { 'input[type="password"]' : null }, expect: 'validation' },
      { name: 'mismatched new passwords', fill: {}, expect: 'validation' },
      { name: 'a wrong current password', fill: {}, expect: 'server-reject' },
    ],
  },
  {
    id: 'cve-search',
    route: '/security?tab=threats',
    auth: true,
    submit: 'form button[type="submit"]',
    cases: [
      { name: 'an empty query', fill: {}, expect: 'validation' },
      { name: 'a query that is not a CVE id', fill: { 'input[placeholder*="CVE"]': 'hello world' }, expect: 'validation' },
      { name: 'a query with an XSS payload', fill: { 'input[placeholder*="CVE"]': XSS_PAYLOAD }, expect: 'validation' },
    ],
  },
];

/**
 * Classify what the system did with the input.
 *
 *   client-validated  the form refused it before any request was made
 *   server-rejected   the request went out and the API answered 4xx
 *   accepted         neither — the bad data went through
 *   crashed          the page broke
 */
async function classify(page, probe, marker, beforeText) {
  const afterText = await readText(page);
  const newText = afterText.replace(beforeText, '').trim();
  const responses = probe.apiResponsesSince(marker).filter((r) => /project-eric-api/.test(r.url));
  const status = responses.length ? responses[responses.length - 1].status : null;

  const feedback = /required|invalid|must|at least|do not match|valid|failed|incorrect|error|already|not found|try again|does not/i.test(newText);
  const toast = await page.evaluate(() => {
    const el = document.querySelector('[role="alert"]');
    return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  });

  if (await crashed(page)) return { outcome: 'crashed', status, feedback, toast };

  if (status === null && feedback) return { outcome: 'client-validated', status, feedback, toast };
  if (status && status >= 400 && status < 500) return { outcome: 'server-rejected', status, feedback, toast };
  if (status === null && !feedback) return { outcome: 'accepted', status, feedback, toast };
  return { outcome: status ? 'server-rejected' : 'client-validated', status, feedback, toast };
}

async function phaseInvalid(session) {
  console.log('\n=== PHASE 3: invalid data ===');
  const results = [];

  for (const spec of FORM_SPECS) {
    console.log(`\n  -- ${spec.id} (${spec.route})`);

    for (const testCase of spec.cases) {
      const { context, page } = await newPage({
        seed: spec.auth ? { token: session.token, user: session.user } : null,
      });
      const probe = instrument(page);

      let label = `${spec.id}: ${testCase.name}`;
      let outcome = 'error';
      let detail = '';

      try {
        await page.goto(BASE + spec.route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await waitForHydrated(page);
        await dismissTour(page);
        await sleep(900);

        if (spec.setup) await spec.setup(page);

        // Type the values.
        for (const [selector, value] of Object.entries(testCase.fill || {})) {
          if (value === null) continue;
          const found = await setReactInput(page, selector, value);
          if (!found) {
            detail = `the field ${selector} was not on the page`;
            outcome = 'field-missing';
          }
        }

        const beforeText = await readText(page);
        const marker = probe.requests.length;

        // Submit.
        if (spec.submitText) {
          await clickText(page, 'button', spec.submitText);
        } else if (spec.submit) {
          const clicked = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            el.click();
            return true;
          }, spec.submit);
          if (!clicked) {
            detail = `the submit control ${spec.submit} was not on the page`;
            outcome = 'field-missing';
          }
        }

        await sleep(2200);

        // The multi-field cases need the fields filled one at a time.
        if (spec.id === 'settings-password') {
          const inputs = await page.$$('input[type="password"]');
          if (inputs.length >= 3) {
            const values =
              testCase.name === 'a short new password'
                ? ['Correct-Horse-1!', 'Ab1', 'Ab1']
                : testCase.name === 'mismatched new passwords'
                  ? ['Correct-Horse-1!', 'Abcdefg1!', 'Abcdefg2!']
                  : testCase.name === 'a wrong current password'
                    ? ['Wrong-Password-9!', 'Abcdefg1!', 'Abcdefg1!']
                    : ['', '', ''];
            for (let i = 0; i < 3; i += 1) {
              await inputs[i].click({ clickCount: 3 }).catch(() => {});
              await inputs[i].type(values[i], { delay: 5 }).catch(() => {});
            }
            await sleep(300);
            await clickText(page, 'button', /update password|change password/i);
            await sleep(2500);
          }
        }

        const c = await classify(page, probe, marker, beforeText);
        outcome = c.outcome;
        detail = `status=${c.status} feedback=${c.feedback} toast=${c.toast ? `"${c.toast}"` : 'none'}`;

        // XSS must never execute.
        const xssFired = await page.evaluate(() => !!window.__xssFired);
        if (xssFired) {
          addFinding('invalid', spec.route, 'error', 'xss', `An injected script executed on ${spec.route}`);
        }

        // The expectation has to be met.
        const ok =
          (testCase.expect === 'validation' && (c.outcome === 'client-validated' || c.outcome === 'server-rejected')) ||
          (testCase.expect === 'server-reject' && (c.outcome === 'server-rejected' || c.outcome === 'client-validated'));
        if (!ok) {
          addFinding(
            'invalid',
            spec.route,
            outcome === 'accepted' ? 'error' : outcome === 'crashed' ? 'error' : 'warn',
            `invalid-data.${outcome}`,
            `${label}: the system ${outcome === 'accepted' ? 'accepted the bad data without complaint' : outcome}`,
            detail
          );
        }
      } catch (err) {
        outcome = 'harness-error';
        detail = err.message.split('\n')[0];
        addFinding('invalid', spec.route, 'error', 'harness', `${label}: the harness failed — ${detail}`);
      }

      results.push({ form: spec.id, case: testCase.name, expected: testCase.expect, outcome, detail });
      console.log(`     ${String(outcome).padEnd(16)} ${testCase.name}${detail ? `  (${detail})` : ''}`);

      const errs = probe.drain();
      for (const e of errs) {
        // A 4xx is the expected answer for a rejected value, so it is only
        // reported when it is a 5xx or a page-level crash.
        if (e.kind.startsWith('http.4')) continue;
        addFinding('invalid', spec.route, e.severity, e.kind, `${label}: ${e.message}`, e.extra);
      }

      probe.detach();
      await context.close();
    }
  }

  reports.invalid = results;
  return results;
}

// ---------------------------------------------------------------------------
// Phase 4 — the backend misbehaves
// ---------------------------------------------------------------------------

const FAULTS = [
  { id: 'http-500', mode: 'respond', status: 500, body: JSON.stringify({ success: false, error: 'Internal server error' }) },
  { id: 'http-401', mode: 'respond', status: 401, body: JSON.stringify({ success: false, error: 'Invalid or expired token' }) },
  { id: 'malformed-json', mode: 'respond', status: 200, body: '<html><body>Apache error page</body></html>' },
  { id: 'network-down', mode: 'abort', status: 0, body: '' },
];

async function phaseFaults(session) {
  console.log('\n=== PHASE 4: backend faults ===');
  const results = [];

  for (const fault of FAULTS) {
    for (const route of ['/dashboard', '/team', '/notifications', '/reports']) {
      const { context, page } = await newPage({ seed: { token: session.token, user: session.user } });

      // Every API call is made to fail in the same way.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (!/project-eric-api/.test(req.url())) {
          req.continue().catch(() => {});
          return;
        }
        if (fault.mode === 'abort') {
          req.abort('failed').catch(() => {});
          return;
        }
        req.respond({
          status: fault.status,
          contentType: 'application/json',
          body: fault.body,
        }).catch(() => {});
      });

      const probe = instrument(page);
      let outcome = 'error';
      let detail = '';

      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await waitForHydrated(page);
        await sleep(2500);

        const text = await readText(page);
        const isCrashed = await crashed(page);
        const redirectedAway = !page.url().includes(route);

        if (isCrashed) {
          outcome = 'crashed';
          detail = 'the error boundary caught a render error';
          addFinding('faults', route, 'error', 'fault.crashed', `${fault.id}: the page crashed when the API failed`, text.slice(0, 300));
        } else if (text.length < 40) {
          outcome = 'blank';
          detail = 'the page rendered nothing';
          addFinding('faults', route, 'error', 'fault.blank', `${fault.id}: the page rendered nothing when the API failed`);
        } else if (redirectedAway && route !== '/dashboard') {
          outcome = 'redirected';
          detail = `the page navigated to ${page.url().replace(BASE, '')}`;
        } else {
          outcome = 'degraded';
          detail = `the page still rendered (${text.length} characters)`;
        }

        // A failed request must not produce an uncaught exception.
        const errs = probe.drain().filter((e) => e.kind === 'pageerror');
        for (const e of errs) {
          addFinding('faults', route, 'error', 'fault.pageerror', `${fault.id}: an uncaught exception escaped — ${e.message}`, e.extra);
        }
      } catch (err) {
        outcome = 'harness-error';
        detail = err.message.split('\n')[0];
      }

      results.push({ fault: fault.id, route, outcome, detail });
      console.log(`  ${fault.id.padEnd(16)} ${route.padEnd(16)} ${outcome}${detail ? ` — ${detail}` : ''}`);

      probe.detach();
      await context.close();
    }
  }

  reports.faults = results;
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
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  });

  try {
    // Every phase needs a session. A throwaway account is used so the run
    // never touches the demo account's data.
    let session = null;
    if (phase === 'all' || phase === 'census' || phase === 'invalid' || phase === 'faults') {
      const email = `dom.audit.session+${Date.now()}@project-eric.test`;
      session = await registerViaAPI(email);
      const updated = await completeOnboarding(session.token);
      session.user = { ...session.user, ...(updated || {}), onboardingComplete: true };
      console.log(`\nSession account: ${email} (id ${session.user?.id})`);
    }

    if (phase === 'all' || phase === 'census') await phaseCensus(session);
    if (phase === 'all' || phase === 'newuser') await phaseNewUser();
    if (phase === 'all' || phase === 'invalid') await phaseInvalid(session);
    if (phase === 'all' || phase === 'faults') await phaseFaults(session);
  } finally {
    await browser.close();
  }

  // ---- report --------------------------------------------------------------
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
    JSON.stringify({ generatedAt: new Date().toISOString(), findings, reports }, null, 2)
  );
  console.log(`\nSaved to ${path.join(OUT, 'findings.json')}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
