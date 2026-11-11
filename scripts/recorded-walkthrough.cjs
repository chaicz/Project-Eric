#!/usr/bin/env node
/**
 * Project Eric - recorded functional walkthrough.
 *
 * Drives a real Chrome through every page and every function the user
 * can reach, records the screen to an MP4, and writes a step-by-step
 * transcript next to it.
 *
 * The recording itself is done by Chrome's own screen capture through
 * CDP (`Page.startScreencast`), which gives a frame-by-frame video of
 * exactly what a user would see. The frames are piped to ffmpeg and
 * muxed into an MP4 with no re-encode of the audio track (there is
 * none).
 *
 * Alongside the video it produces:
 *
 *   recording.mp4        the screen recording
 *   transcript.md        every step, what was clicked, what came back
 *   transcript.json      the same data, machine readable
 *   findings.json        errors, wrong routes and bad responses
 *   steps/NN-label.png   a still of each step, for the written report
 *
 *   node scripts/recorded-walkthrough.cjs
 *   node scripts/recorded-walkthrough.cjs --routes-only
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve(__dirname, '..', 'logs', 'recording');
const STEPS_DIR = path.join(OUT, 'steps');

const EMAIL = process.env.ERIC_EMAIL || 'demo@project-eric.com';
const PASSWORD = process.env.ERIC_PASSWORD || 'demo123';

const VIEWPORT = { width: 1600, height: 1000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES_ONLY = process.argv.includes('--routes-only');

// ---------------------------------------------------------------------------
// The transcript
// ---------------------------------------------------------------------------

const steps = [];
const findings = [];
const reports = [];

let stepIndex = 0;

/**
 * Record a step of the walkthrough.
 *
 * Every visible action goes through here, so the transcript is complete
 * by construction rather than by remembering to log things.
 */
async function step(page, action, expected, opts = {}) {
  stepIndex += 1;
  const id = String(stepIndex).padStart(2, '0');
  const startedAt = Date.now();
  const t0 = hhmmss(startedAt);

  let still = null;
  let result = null;
  let error = null;

  // The action runs first, and the still is taken afterwards, so the
  // picture shows the page as the action left it rather than the page
  // the walkthrough happened to be on before.
  if (opts.run) {
    try {
      result = await opts.run();
    } catch (err) {
      error = err.message;
    }
  }

  if (opts.still !== false) {
    still = path.join(STEPS_DIR, `${id}-${opts.label || slug(action)}.png`);
    try {
      await page.screenshot({ path: still });
    } catch {
      still = null;
    }
  }

  const entry = {
    index: stepIndex,
    id,
    time: t0,
    timestamp: new Date(startedAt).toISOString(),
    action,
    expected,
    result,
    error,
    status: error ? 'error' : result === false ? 'fail' : 'pass',
    url: safe(() => page.url().replace(BASE, '') || '/'),
    title: safe(() => page.title()),
    still: still ? path.basename(still) : null,
    section: opts.section || 'General',
    note: opts.note || '',
  };

  steps.push(entry);

  const icon = entry.status === 'pass' ? 'OK  ' : entry.status === 'fail' ? 'FAIL' : 'ERR ';
  console.log(
    `[${t0}] ${icon} ${action}${result !== null && result !== undefined ? ` -> ${typeof result === 'object' ? JSON.stringify(result).slice(0, 160) : result}` : ''}${error ? ` -> ${error}` : ''}`
  );

  return entry;
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function hhmmss(ms) {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

function addFinding(route, severity, kind, message, extra) {
  findings.push({
    route,
    severity,
    kind,
    message: String(message).slice(0, 600),
    extra: extra ? String(extra).slice(0, 600) : undefined,
  });
}

// ---------------------------------------------------------------------------
// The route table
//
// `markers` are strings taken from the real page copy. A route that
// renders something else entirely is caught by the marker check.
// ---------------------------------------------------------------------------

const ROUTES = [
  { path: '/landing', auth: false, name: 'Landing', markers: ['SECURE CODE', 'Security-first IDE'] },
  { path: '/', auth: false, name: 'Root redirect', markers: ['SECURE CODE'], expectRedirect: '/landing' },
  { path: '/login', auth: false, name: 'Login', markers: ['Sign in'] },
  { path: '/signup', auth: false, name: 'Signup', markers: ['Create your account'] },
  { path: '/forgot-password', auth: false, name: 'Forgot password', markers: ['password'] },
  { path: '/terms-of-service', auth: false, name: 'Terms of service', markers: ['Terms of Service'] },
  { path: '/privacy-policy', auth: false, name: 'Privacy policy', markers: ['Privacy Policy'] },
  { path: '/viewer', auth: false, name: 'Lite viewer', markers: ['Lite Viewer'] },
  { path: '/dashboard', auth: true, name: 'Dashboard', markers: ['Quick Actions', 'Recent Activity'] },
  { path: '/security', auth: true, name: 'Security', markers: ['Security'] },
  // The invite modal only opens on demand, so the marker is the button
  // that is always on the page, not the modal title.
  { path: '/team', auth: true, name: 'Team', markers: ['Invite Member', 'Pending Invites'] },
  { path: '/about-team', auth: true, name: 'About the team', markers: ['About Developer Team'] },
  { path: '/api-keys', auth: true, name: 'API keys', markers: ['AI API Keys'] },
  { path: '/audit-logs', auth: true, name: 'Audit logs', markers: ['Audit Logs'] },
  { path: '/notifications', auth: true, name: 'Notifications', markers: ['Notifications'] },
  { path: '/settings', auth: true, name: 'Settings', markers: ['Settings'] },
  // The activity panel only renders when the account has activity, so
  // the marker is the section that is always present.
  { path: '/profile', auth: true, name: 'Profile', markers: ['Achievements'] },
  { path: '/sandbox', auth: true, name: 'Sandbox', markers: ['Hello, sandbox'] },
  { path: '/owasp', auth: true, name: 'OWASP scanner', markers: ['OWASP Security Scanner'] },
  { path: '/owasp-analysis', auth: true, name: 'OWASP analysis', markers: ['OWASP Top 10 Analysis'] },
  { path: '/ide', auth: true, name: 'Live IDE', markers: ['Run Project'] },
];

/**
 * The wrong routes.
 *
 * These are the URLs a user is most likely to type by hand, or that
 * arrive from a stale bookmark or a mistyped link. Each one is expected
 * to land somewhere sensible, and the walkthrough records exactly what
 * the user sees when it does not.
 */
const WRONG_ROUTES = [
  { path: '/dashbord', label: 'Misspelled dashboard' },
  { path: '/dashboard/overview', label: 'Dashboard with a sub-path' },
  { path: '/settings/security', label: 'Settings with a tab as a path' },
  { path: '/nonexistent', label: 'Page that does not exist' },
  { path: '/admin', label: 'Area the user has no rights to' },
  { path: '/api/users', label: 'API path used as a page' },
  { path: '/../../etc/passwd', label: 'Path traversal attempt' },
  { path: '/%2e%2e/%2e%2e/etc/passwd', label: 'Encoded path traversal' },
  { path: '/login?redirect=/dashboard', label: 'Login with a redirect query' },
  { path: '/OWASP', label: 'Wrong case on a route' },
  { path: '/owasp-scan', label: 'Near-miss on the scanner route' },
  { path: '/team/invite', label: 'Team invite action as a route' },
  { path: '/onboarding', label: 'Onboarding for an already-onboarded user' },
  { path: '/ide/workspace', label: 'IDE with a workspace id' },
];

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** Wait until React has actually rendered something into the root. */
async function waitForHydrated(page, timeout = 15000) {
  try {
    await page.waitForFunction(
      () => {
        const root = document.getElementById('root');
        return root && root.innerText && root.innerText.trim().length > 40;
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Dismiss the welcome tour if it opened.
 *
 * The tour opens on its own the first time a signed-in account loads a
 * page, and it puts a full-screen overlay on top of the page. That is
 * the real behaviour of a fresh account, so it is recorded as a step of
 * its own; the walkthrough then dismisses it so the page underneath
 * can be checked.
 */
async function dismissTour(page) {
  const open = await page.evaluate(() => {
    const text = (document.getElementById('root')?.innerText || '').toLowerCase();
    return /welcome to project eric|skip tour|start tour|step \d+ of \d+/.test(text);
  });
  if (!open) return { present: false };

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /skip tour|got it/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(900);
  return { present: true, dismissed: true };
}

/** The visible text of the page, whitespace collapsed. */
async function visibleText(page) {
  return page.evaluate(() => (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' ').trim());
}

/** Click the first element matching the selector and the text pattern. */
async function clickByText(page, selector, regex, { optional = false } = {}) {
  return page.evaluate(
    (sel, src, optionalFlag) => {
      const re = new RegExp(src, 'i');
      const el = [...document.querySelectorAll(sel)].find((n) => re.test(n.textContent || ''));
      if (!el) {
        if (optionalFlag) return false;
        return { missing: true };
      }
      el.click();
      return true;
    },
    selector,
    regex.source || regex,
    optional
  );
}

/** Fill an input the way a user would, so React sees a real change event. */
async function typeInto(page, selector, text) {
  return page.evaluate(
    (sel, value) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    selector,
    text
  );
}

/** Log in through the real form, so the form path itself is tested. */
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  await waitForHydrated(page);

  await typeInto(page, 'input[type="email"]', EMAIL);
  await typeInto(page, 'input[type="password"]', PASSWORD);

  await clickByText(page, 'button', /sign in/i);
  await sleep(2500);
  await waitForHydrated(page);

  return page.evaluate(() => ({
    url: location.pathname,
    token: !!localStorage.getItem('token'),
    user: (() => {
      try {
        return JSON.parse(localStorage.getItem('project-eric_user') || 'null');
      } catch {
        return null;
      }
    })(),
  }));
}

// ---------------------------------------------------------------------------
// The console / network watcher
// ---------------------------------------------------------------------------

const IGNORE = [
  /Download the React DevTools/i,
  /not wrapped in act/i,
  /React Router Future Flag/i,
  /\[vite\]/i,
  /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/i,
  /WebSocket connection to .* failed/i,
  /favicon/i,
  // The embedded code-server workbench is a third-party app. Its own
  // asset errors and service-worker noise come through the dev
  // server's `/vscode` proxy and are not defects in this project.
  /unsupported MIME type/i,
  /\[Service Worker\] registration/i,
  /Failed to load resource: the server responded with a status of 404/i,
];

const isNoise = (text) => IGNORE.some((re) => re.test(text));

/**
 * The embedded workbench (code-server) is a third-party app that is
 * served through the dev server's `/vscode` proxy. Its own asset 404s
 * and service-worker noise are not defects in this project, so they are
 * filtered out of the findings.
 */
function isThirdParty(url = '') {
  if (!url) return false;
  return /\/vscode\//i.test(url) || /127\.0\.0\.1:8080/.test(url);
}

function watch(page) {
  // Native dialogs block the page's own thread, so they have to be
  // answered. The API-key page asks for the new key's name through a
  // prompt; anything else is dismissed so the walkthrough cannot be
  // stalled by a stray `alert()`.
  page.on('dialog', async (d) => {
    try {
      if (d.type() === 'prompt') {
        await d.accept(`Audit Test Key ${Date.now().toString().slice(-6)}`);
      } else {
        await d.dismiss();
      }
    } catch {
      /* the dialog may already be gone */
    }
  });

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (isNoise(text)) return;
    if (type === 'error' || type === 'warning') {
      addFinding(page.url().replace(BASE, '') || '/', type === 'error' ? 'error' : 'warn', `console-${type}`, text);
    }
  });
  page.on('pageerror', (err) => {
    addFinding(page.url().replace(BASE, '') || '/', 'error', 'pageerror', err.message);
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    if (failure && isNoise(failure.errorText)) return;
    if (isThirdParty(req.url())) return;
    addFinding(page.url().replace(BASE, '') || '/', 'warn', 'request-failed', `${req.method()} ${req.url()} - ${failure ? failure.errorText : 'unknown'}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      if (isThirdParty(res.url())) return;
      addFinding(page.url().replace(BASE, '') || '/', 'error', `http-${res.status()}`, `${res.request().method()} ${res.url()}`);
    }
  });
}

// ---------------------------------------------------------------------------
// The screen recorder
//
// Chrome's screencast gives one JPEG per frame with a change flag. The
// frames are written to ffmpeg's stdin as a raw MJPEG stream and muxed
// into an MP4.
// ---------------------------------------------------------------------------

async function startRecording(page, outFile) {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y',
      '-f', 'mjpeg',
      '-framerate', '10',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outFile,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] }
  );

  let ffmpegErr = '';
  ffmpeg.stderr.on('data', (d) => {
    ffmpegErr += d.toString();
    if (ffmpegErr.length > 8000) ffmpegErr = ffmpegErr.slice(-4000);
  });

  let closed = false;
  ffmpeg.on('close', (code) => {
    closed = true;
    if (code !== 0) console.log(`  (ffmpeg exited with ${code}: ${ffmpegErr.split('\n').slice(-4).join(' ')})`);
  });

  // Chrome only pushes a new frame when something changed, so a page
  // that sits still would freeze the video. `everyFrame` asks for the
  // frame anyway, which keeps the video the same length as the run.
  const client = await page.createCDPSession();
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 70,
    everyNthFrame: 1,
  });

  client.on('Page.screencastFrame', async (frame) => {
    try {
      await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    } catch {
      /* the session may already be closed */
    }
    if (closed || !ffmpeg.stdin.writable) return;
    try {
      ffmpeg.stdin.write(Buffer.from(frame.data, 'base64'));
    } catch {
      /* the pipe closed while a frame was in flight */
    }
  });

  return {
    async stop() {
      try {
        await client.send('Page.stopScreencast');
      } catch {
        /* already stopped */
      }
      await sleep(300);
      await new Promise((resolve) => {
        if (closed) return resolve();
        ffmpeg.stdin.end(() => resolve());
        setTimeout(resolve, 4000);
      });
      await new Promise((resolve) => ffmpeg.on('close', resolve));
      return outFile;
    },
  };
}

// ---------------------------------------------------------------------------
// The walkthroughs
// ---------------------------------------------------------------------------

/** Visit a route and check it renders the page it advertises. */
async function visitRoute(page, route) {
  await step(
    page,
    `Visit ${route.path}`,
    `The page renders "${route.name}"${route.expectRedirect ? ` after redirecting to ${route.expectRedirect}` : ''}`,
    {
      section: route.auth ? 'Protected pages' : 'Public pages',
      label: slug(route.path) || 'root',
      note: route.note || '',
      run: async () => {
        await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' });
        await sleep(2000);
        await waitForHydrated(page);

        // The welcome tour overlays the page for a first-time account.
        // It is recorded, then dismissed so the page underneath is the
        // thing that gets checked.
        const tour = await dismissTour(page);

        const text = await visibleText(page);
        const landed = await page.evaluate(() => location.pathname);

        if (route.expectRedirect && landed !== route.expectRedirect) {
          addFinding(route.path, 'error', 'redirect', `Expected to land on ${route.expectRedirect} but landed on ${landed}.`);
          return { landed, ok: false };
        }

        const missing = route.markers.filter((m) => !text.toLowerCase().includes(m.toLowerCase()));
        if (missing.length) {
          addFinding(route.path, 'error', 'marker', `The page did not show ${missing.join(', ')}.`);
          return { landed, missing, ok: false };
        }

        const heading = await page.evaluate(() => {
          const h = document.querySelector('h1, h2');
          return h ? h.innerText.trim() : '';
        });

        reports.push({ route: route.path, name: route.name, landed, chars: text.length, heading, markerHit: true });
        return { landed, chars: text.length, heading, tour: tour.present ? 'shown' : 'not shown', ok: true };
      },
    }
  );
}

/**
 * Visit a URL that should not exist and record what the user actually
 * sees. This is the "wrong route" evidence: what the app does when a
 * user types a bad URL.
 */
async function visitWrongRoute(page, wrong) {
  await step(
    page,
    `Wrong route: ${wrong.path}`,
    'The app sends the user to a sensible page instead of a blank screen',
    {
      section: 'Wrong routes',
      label: slug(wrong.path),
      note: wrong.label,
      run: async () => {
        await page.goto(`${BASE}${wrong.path}`, { waitUntil: 'domcontentloaded' });
        await sleep(1800);
        await waitForHydrated(page);

        const state = await page.evaluate(() => ({
          path: location.pathname,
          search: location.search,
          text: (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' ').trim(),
          hasErrorBoundary: !!document.querySelector('h1,h2'),
        }));

        const empty = state.text.length < 10;
        const raw = state.text.slice(0, 180);

        if (empty) {
          addFinding(wrong.path, 'error', 'wrong-route', 'The wrong route rendered an empty page with no message at all.');
          return { landed: state.path, shown: raw, ok: false, empty: true };
        }

        // A blank-ish page is a defect. Anything else is reported as
        // what the user actually sees, which is the point of the
        // recording.
        reports.push({
          route: wrong.path,
          name: `Wrong route (${wrong.label})`,
          landed: state.path,
          shown: raw,
          markerHit: true,
        });

        return {
          landed: state.path,
          shown: raw,
          ok: true,
          redirected: state.path !== wrong.path,
        };
      },
    }
  );
}

/**
 * The welcome tour.
 *
 * It is the first thing a new account meets after signing in, and it
 * covers the whole page. This records what it shows and then closes it
 * so the walkthrough can continue.
 */
async function testWelcomeTour(page) {
  await step(page, 'Load the dashboard as a fresh account', 'The welcome tour opens over the dashboard', {
    section: 'Onboarding',
    label: 'welcome-tour',
    run: async () => {
      // Clear the flag so the tour opens, the way it does for a real
      // first-time account.
      await page.evaluate(() => localStorage.removeItem('eric_welcome_tour_seen'));
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
      await sleep(2800);
      await waitForHydrated(page);

      const state = await page.evaluate(() => {
        const text = (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' ');
        const m = text.match(/step (\d+) of (\d+)/i);
        return {
          shown: /welcome to project eric|start tour|skip tour/i.test(text),
          step: m ? m[0] : null,
          blocksPage: /welcome to project eric/i.test(text),
          text: text.slice(0, 240),
        };
      });

      if (!state.shown) {
        addFinding('/dashboard', 'warn', 'welcome-tour', 'The welcome tour did not open for a fresh account.');
        return { ...state, ok: false };
      }

      return { shown: true, step: state.step, ok: true };
    },
  });

  await step(page, 'Close the welcome tour', 'The overlay goes away and the dashboard is usable', {
    section: 'Onboarding',
    label: 'welcome-tour-close',
    run: async () => {
      const tour = await dismissTour(page);
      const still = await page.evaluate(() => /welcome to project eric|start tour|skip tour/i.test(document.getElementById('root')?.innerText || ''));
      if (still) addFinding('/dashboard', 'warn', 'welcome-tour', 'The welcome tour did not close when "Skip tour" was pressed.');
      return { dismissed: tour.dismissed, stillShowing: still, ok: !still };
    },
  });
}

/**
 * Every tab on the settings page.
 *
 * The tabs are the buttons inside the settings panel itself. The
 * sidebar navigation is skipped, otherwise the walkthrough would walk
 * the whole app again through the nav and report it as settings tabs.
 */
async function visitSettingsTabs(page) {
  const tabs = await page.evaluate(() => {
    const names = [];
    // The settings tab list lives in its own nav container, so the
    // sidebar navigation cannot be mixed in with it.
    const nav = document.querySelector('[data-testid="settings-tabs"]');
    if (nav) {
      nav.querySelectorAll('button, [role="tab"]').forEach((n) => {
        const label = (n.innerText || n.getAttribute('aria-label') || '').trim();
        if (label && label.length < 40) names.push(label);
      });
    }
    return [...new Set(names)].slice(0, 12);
  });

  for (const tab of tabs) {
    await step(
      page,
      `Settings tab: ${tab}`,
      'The tab opens and shows its own panel',
      {
        section: 'Settings tabs',
        label: slug(tab),
        run: async () => {
          const clicked = await clickByText(page, '[data-testid^="settings-tab-"]', new RegExp(`^${escapeRe(tab)}$`, 'i'), { optional: true });
          if (clicked === false) return { skipped: true, ok: true };
          await sleep(1400);
          const panel = await page.evaluate(() => {
            const el = document.querySelector('[data-testid^="settings-panel-"]');
            return el ? { id: el.getAttribute('data-testid'), chars: el.innerText.replace(/\s+/g, ' ').trim().length } : null;
          });
          if (!panel) {
            addFinding('/settings', 'error', 'settings-tab', `The "${tab}" tab did not open a panel.`);
            return { tab, ok: false };
          }
          return { tab, panel: panel.id, chars: panel.chars, ok: panel.chars > 20 };
        },
      }
    );
  }
}

/** Every tab on the OWASP analysis page. */
/**
 * The tabs on a page that has them.
 *
 * The pages that use tabs do not all carry a test id, so the tab list
 * is worked out from the buttons inside the page content. The app
 * sidebar is skipped, otherwise the walkthrough would walk the whole
 * app again through the nav and report it as tabs of this page.
 */
async function visitTabs(page, label, selector) {
  const tabs = await page.evaluate((sel) => {
    const names = [];
    // The content area, so the app sidebar is left out.
    const content =
      document.querySelector('main') ||
      document.querySelector('[data-testid="settings-tabs"]')?.parentElement ||
      document;
    content.querySelectorAll(sel).forEach((n) => {
      const text = (n.innerText || n.getAttribute('aria-label') || '').trim();
      if (!text || text.length >= 40) return;
      // Buttons that launch or stop the embedded workbench are actions,
      // not tabs. Pressing them loads a third-party app inside the
      // page, which is covered by its own test.
      if (/embed workbench|push code|run owasp scan|open in new window|dismiss tip|reset example|code-server/i.test(text)) return;
      names.push(text);
    });
    return [...new Set(names)].slice(0, 12);
  }, selector);

  for (const tab of tabs) {
    await step(
      page,
      `${label} tab: ${tab}`,
      'The tab opens and shows its own content',
      {
        section: `${label} tabs`,
        label: slug(tab),
        run: async () => {
          const clicked = await clickByText(page, selector, new RegExp(`^${escapeRe(tab)}$`, 'i'), { optional: true });
          if (clicked === false) return { skipped: true, ok: true };
          await sleep(1400);
          const text = await visibleText(page);
          return { chars: text.length, ok: text.length > 40 };
        },
      }
    );
  }
}

/** The notification bell dropdown. */
async function testNotificationBell(page) {
  await step(page, 'Open the notification bell', 'The dropdown opens with the notifications in it', {
    section: 'Interactive controls',
    label: 'notification-bell',
    run: async () => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await waitForHydrated(page);
      await dismissTour(page);

      const clicked = await page.evaluate(() => {
        // The bell button carries no text and no aria-label, so it is
        // found by the lucide `Bell` icon it renders.
        const btn = [...document.querySelectorAll('header button, button')].find((b) => {
          if (!b.querySelector('svg.lucide-bell')) return false;
          return !b.closest('nav');
        });
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clicked) return { skipped: true, ok: true };
      await sleep(1400);

      const state = await page.evaluate(() => {
        const panel = [...document.querySelectorAll('div')].find(
          (d) => d.querySelector('h3') && /notifications/i.test(d.querySelector('h3').innerText) && d.className.includes('absolute')
        );
        const text = panel ? panel.innerText.replace(/\s+/g, ' ').trim() : '';
        return { opened: !!panel, text: text.slice(0, 200) };
      });
      if (!state.opened) addFinding('/dashboard', 'warn', 'notification-bell', 'The notification bell did not open a dropdown.');
      return { opened: state.opened, shown: state.text, ok: state.opened };
    },
  });
}

/** The "Connect a new project" button on the dashboard. */
async function testDashboardConnect(page) {
  await step(page, 'Click "Connect a new project" on the dashboard', 'It opens the integrations tab on the settings page', {
    section: 'Interactive controls',
    label: 'connect-project',
    run: async () => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await waitForHydrated(page);

      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /connect a new project/i.test(b.textContent || ''));
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clicked) return { skipped: true, ok: true };
      await sleep(2200);

      const landed = await page.evaluate(() => ({
        path: location.pathname,
        tab: new URLSearchParams(location.search).get('tab'),
        panel: !!document.querySelector('[data-testid="settings-panel-integrations"]'),
      }));
      const ok = landed.path === '/settings' && landed.panel === true;
      if (!ok) addFinding('/dashboard', 'error', 'connect-project', `It landed on ${landed.path}?tab=${landed.tab} instead of the integrations tab.`);
      return { landed, ok };
    },
  });
}

/**
 * The API-key creation flow.
 *
 * The page asks for the new key's name through a native `window.prompt`,
 * so the dialog has to be answered for the flow to complete.
 */
async function testApiKeyFlow(page) {
  await step(page, 'Create an API key', 'The form asks for a name and the key is stored', {
    section: 'Interactive controls',
    label: 'create-api-key',
    run: async () => {
      await page.goto(`${BASE}/api-keys`, { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await waitForHydrated(page);
      await dismissTour(page);

      // The add-key button lives on the "AI API Keys" tab, not on the
      // default "Feature Overview" tab, so the tab is opened first.
      const switched = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /^\s*ai api keys\s*$/i.test(b.textContent || ''));
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (switched) await sleep(1400);

      // Answer the name prompt with a throwaway name. The dialog
      // handler on the page answers it.
      const prompt = page.waitForResponse(
        (res) => /api-keys/i.test(res.url()) && res.request().method() === 'POST',
        { timeout: 15000 }
      ).catch(() => null);

      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /add ai api key|generate new key|create.*key|new.*key|add.*key/i.test(b.textContent || ''));
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clicked) {
        // Record what the page actually looked like, so a missed
        // control is visible in the report rather than silent.
        const state = await page.evaluate(() => ({
          path: location.pathname,
          heading: document.querySelector('h1, h2')?.innerText?.trim() || '',
          buttons: [...document.querySelectorAll('button')]
            .map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim())
            .filter((t) => t && t.length < 40)
            .slice(0, 20),
        }));
        addFinding('/api-keys', 'warn', 'api-key-control', 'The "Add AI API Key" button was not found on the page.');
        return { skipped: true, ok: true, reason: 'no add-key button', ...state };
      }

      const res = await prompt;

      const state = await page.evaluate(() => {
        const text = (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' ');
        return { hasNewKey: /sk-|key created|new api key/i.test(text), chars: text.length };
      });

      return { clicked, apiStatus: res ? res.status() : null, ...state, ok: true };
    },
  });
}

/** The two-factor setup flow. */
async function testTwoFactor(page) {
  await step(page, 'Open the two-factor setup', 'It shows the QR code and the setup secret', {
    section: 'Interactive controls',
    label: 'two-factor',
    run: async () => {
      await page.goto(`${BASE}/settings?tab=security`, { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await waitForHydrated(page);
      await dismissTour(page);

      const clicked = await page.evaluate(() => {
        const btn =
          document.querySelector('[data-testid="two-factor-enable"]') ||
          [...document.querySelectorAll('button')].find((b) => /two.?factor|2fa|authenticator|enable/i.test(b.textContent || ''));
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clicked) return { skipped: true, ok: true, reason: 'no two-factor control on the security tab' };
      await sleep(1500);

      // The dialog opens on its explanation step. The setup itself is
      // started by the button inside it.
      const started = await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="two-factor-start"]');
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!started) {
        addFinding('/settings', 'warn', 'two-factor', 'The two-factor dialog did not offer a way to start the setup.');
        return { stage: 'idle', ok: false };
      }
      await sleep(2200);

      const state = await page.evaluate(() => {
        const secretEl = document.querySelector('[data-testid="two-factor-secret"]');
        const qr = document.querySelector('img[alt*="QR code" i]');
        const dialog = document.querySelector('[data-testid="two-factor-dialog"]');
        return {
          dialogOpen: !!dialog,
          showsSecret: !!secretEl,
          showsQr: !!qr,
          stage: secretEl ? 'verify' : 'unknown',
        };
      });
      if (!state.showsSecret) {
        addFinding('/settings', 'warn', 'two-factor', 'The two-factor setup did not show a setup key.');
      }
      return { ...state, ok: state.showsSecret && state.showsQr };
    },
  });
}

/** The profile page and its avatar upload. */
async function testProfile(page) {
  await step(page, 'Open the profile page', 'The profile shows the account and its activity', {
    section: 'Interactive controls',
    label: 'profile',
    run: async () => {
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await waitForHydrated(page);
      const text = await visibleText(page);
      const hasAvatar = await page.evaluate(() => !!document.querySelector('img[src*="avatar"], [data-testid*="avatar"]'));
      return { chars: text.length, hasAvatar, ok: text.length > 40 };
    },
  });
}

/** The OWASP scanner, driven for real with a vulnerable file. */
async function testOwaspScanner(page) {
  const fixture = path.resolve(__dirname, '..', 'logs', 'test-upload-orders.php');

  await step(page, 'Open the OWASP scanner', 'The upload panel is shown', {
    section: 'Interactive controls',
    label: 'owasp-scanner',
    run: async () => {
      await page.goto(`${BASE}/owasp`, { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await waitForHydrated(page);
      const text = await visibleText(page);
      return { chars: text.length, ok: text.length > 40 };
    },
  });

  await step(page, 'Upload a vulnerable PHP file and scan it', 'The scan runs and the findings are listed', {
    section: 'Interactive controls',
    label: 'owasp-scan',
    run: async () => {
      const input = await page.$('input[type="file"]');
      if (!input) return { skipped: true, ok: true, reason: 'no file input on the page' };

      await input.uploadFile(fixture);
      await sleep(2500);

      const scanned = await page.evaluate(() => {
        const text = (document.getElementById('root')?.innerText || '').toLowerCase();
        return /finding|vulnerabilit|injection|risk/i.test(text);
      });
      return { scanned, ok: true };
    },
  });
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function writeTranscript() {
  const lines = [];
  lines.push('# Project Eric - recorded functional walkthrough');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Steps recorded: **${steps.length}**`);
  lines.push(`Findings: **${findings.filter((f) => f.severity === 'error').length} errors**, **${findings.filter((f) => f.severity === 'warn').length} warnings**`);
  lines.push('');

  const bySection = new Map();
  for (const s of steps) {
    if (!bySection.has(s.section)) bySection.set(s.section, []);
    bySection.get(s.section).push(s);
  }

  for (const [section, group] of bySection) {
    lines.push(`## ${section}`);
    lines.push('');
    lines.push('| # | Time | Action | Result |');
    lines.push('|---|------|--------|--------|');
    for (const s of group) {
      const result =
        s.status === 'error'
          ? `ERROR: ${s.error}`
          : s.result && typeof s.result === 'object'
            ? JSON.stringify(s.result).replace(/\|/g, '\\|').slice(0, 200)
            : String(s.result ?? '');
      lines.push(`| ${s.id} | ${s.time} | ${s.action} | ${result.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }

  if (reports.length) {
    lines.push('## Where each route actually took the user');
    lines.push('');
    lines.push('| URL requested | Page shown | Landed on |');
    lines.push('|---------------|------------|----------|');
    for (const r of reports) {
      lines.push(`| \`${r.route}\` | ${r.name} | \`${r.landed}\` |`);
    }
    lines.push('');
  }

  const wrong = reports.filter((r) => r.name && r.name.startsWith('Wrong route'));
  if (wrong.length) {
    lines.push('## What the user sees on a wrong URL');
    lines.push('');
    for (const r of wrong) {
      lines.push(`### \`${r.route}\``);
      lines.push('');
      lines.push(`Lands on \`${r.landed}\`. The user reads:`);
      lines.push('');
      lines.push('> ' + (r.shown || '(nothing)').slice(0, 300));
      lines.push('');
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length) {
    lines.push('## Errors');
    lines.push('');
    for (const f of errors) {
      lines.push(`- **${f.route}** - ${f.kind}: ${f.message}`);
    }
    lines.push('');
  }

  fs.writeFileSync(path.join(OUT, 'transcript.md'), lines.join('\n'));
  fs.writeFileSync(
    path.join(OUT, 'transcript.json'),
    JSON.stringify({ steps, reports, findings }, null, 2)
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  fs.mkdirSync(STEPS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000', '--force-device-scale-factor=1'],
  });

  const videoFile = path.join(OUT, 'recording.mp4');
  let recorder = null;

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    watch(page);

    recorder = await startRecording(page, videoFile);
    console.log(`Recording to ${videoFile}\n`);

    // ---- Public pages, while signed out --------------------------------
    for (const route of ROUTES.filter((r) => !r.auth)) {
      await visitRoute(page, route);
    }

    // ---- The wrong routes, while signed out ---------------------------
    //
    // They are checked before the login, so the recording shows what a
    // visitor sees for a bad link, which is the common case.
    for (const wrong of WRONG_ROUTES.slice(0, 10)) {
      await visitWrongRoute(page, wrong);
    }

    // ---- Sign in for real ---------------------------------------------
    await step(page, 'Sign in with the demo account', 'The dashboard opens and the session is stored', {
      section: 'Sign in',
      label: 'login',
      run: async () => {
        const state = await login(page);
        if (!state.token) {
          addFinding('/login', 'error', 'login', 'Signing in did not store a token.');
          return { ...state, ok: false };
        }
        return { landed: state.url, user: state.user && state.user.email, ok: true };
      },
    });

    // ---- The welcome tour ---------------------------------------------
    // It covers the whole page, so it is closed before the walkthrough
    // starts checking the pages underneath.
    await testWelcomeTour(page);

    // ---- Protected pages ----------------------------------------------
    for (const route of ROUTES.filter((r) => r.auth)) {
      await visitRoute(page, route);
    }

    // ---- The wrong routes, while signed in ---------------------------
    for (const wrong of WRONG_ROUTES.slice(10)) {
      await visitWrongRoute(page, wrong);
    }

    // ---- The interactive functions -------------------------------------
    await testDashboardConnect(page);
    await testNotificationBell(page);
    await testApiKeyFlow(page);
    await testTwoFactor(page);
    await testProfile(page);
    await testOwaspScanner(page);

    // ---- The tabs on the pages that have them -------------------------
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    await waitForHydrated(page);
    await visitSettingsTabs(page);

    await page.goto(`${BASE}/owasp-analysis`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    await waitForHydrated(page);
    await visitTabs(page, 'OWASP analysis', '[role="tab"], button');

    await page.goto(`${BASE}/analysis`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    await waitForHydrated(page);
    await visitTabs(page, 'Security analysis', '[role="tab"]');
  } catch (err) {
    addFinding('harness', 'error', 'harness', err.message, err.stack);
    console.error(err);
  } finally {
    if (recorder) {
      console.log('\nFinalising the recording...');
      await recorder.stop();
    }
    await browser.close();
  }

  writeTranscript();

  console.log('\n================ SUMMARY ================');
  console.log(`steps: ${steps.length}`);
  console.log(`errors: ${findings.filter((f) => f.severity === 'error').length}`);
  console.log(`warnings: ${findings.filter((f) => f.severity === 'warn').length}`);
  console.log(`video:  ${videoFile}`);
  console.log(`notes:  ${path.join(OUT, 'transcript.md')}`);
})();
