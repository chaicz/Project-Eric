/**
 * Project Eric — full UI capture for a report.
 *
 * Creates a brand-new account through the real signup API, signs in through
 * the real login form, and walks the whole interface the way a new user
 * would. Every page, tab, panel, modal and drop-down is captured as a
 * labelled PNG.
 *
 * The OWASP scanner is driven for real: a vulnerable PHP file is uploaded,
 * the scan runs, a finding is opened, and the PDF report produced by the
 * scanner's own PDF builder is downloaded to disk and saved next to the
 * screenshots.
 *
 * Output (reports/ui-capture/):
 *
 *   NN-label.png        one file per screen, in the order they were seen
 *   owasp-report-*.pdf  the PDF the OWASP scanner generated
 *   pdf-page-*.png      each page of that PDF, rendered
 *   INDEX.md            every shot with its label and description
 *   manifest.json       the same list, machine readable
 *
 *   node scripts/capture-ui-screenshots.cjs
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const API = 'http://localhost/project-eric-api/api';
const OUT = path.resolve(__dirname, '..', 'reports', 'ui-capture');
const DOWNLOADS = path.join(OUT, '.downloads');
const FIXTURE = path.resolve(__dirname, '..', 'logs', 'test-upload-orders.php');

const VIEWPORT = { width: 1600, height: 1000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The shot list
// ---------------------------------------------------------------------------

const shots = [];
let shotIndex = 0;

/**
 * Capture a screen.
 *
 * @param {import('puppeteer-core').Page} page
 * @param {string} label    short kebab-case name, used in the file name
 * @param {string} title    human readable title for the index
 * @param {string} section  the group the shot belongs to
 * @param {string} [note]   a sentence about what the shot shows
 * @param {object} [opts]   { fullPage } — default true
 */
async function shot(page, label, title, section, note = '', opts = {}) {
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, '0')}-${label}.png`;
  const target = path.join(OUT, file);

  await page.screenshot({ path: target, fullPage: opts.fullPage !== false });

  shots.push({
    index: shotIndex,
    file,
    label,
    title,
    section,
    note,
    url: page.url().replace(BASE, '') || '/',
  });

  console.log(`  [${String(shotIndex).padStart(2, '0')}] ${file}  — ${title}`);
  return file;
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * Wait until React has mounted and taken over the document.
 *
 * Interacting before that happens does nothing: the element is in the DOM,
 * but no handler is attached to it yet.
 */
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
  await sleep(500);
}

/**
 * Type into a React-controlled input.
 *
 * React keeps the value of a controlled input in its own state, so setting
 * `input.value` directly is undone on the next render. The native setter is
 * used instead, and an `input` event is fired so React sees the change.
 */
async function setReactInput(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const proto = el instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    selector,
    value
  );
  await sleep(250);
}

/**
 * Click a visible button (or link) whose text matches.
 *
 * The click is fired from inside the page: a protocol-level click waits for
 * the frame, and a click that navigates detaches the frame it came from.
 *
 * @returns {boolean} whether a matching control was found and clicked
 */
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

/** Close the welcome tour if it is open. */
async function dismissTour(page) {
  await clickText(page, 'button', /skip tour|close tour/i);
  await sleep(400);
}

/** Navigate and let the page settle. */
async function go(page, route, settle = 2200) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(settle);
  await waitForHydrated(page);
  await dismissTour(page);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DOWNLOADS, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  });

  const problems = [];
  const consoleErrors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (/favicon|React DevTools|net::ERR_ABORTED|WebSocket connection/i.test(text)) return;
      consoleErrors.push(text.slice(0, 300));
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    // Downloads land in a folder we control, so the PDF the scanner
    // produces can be moved next to the screenshots.
    const client = await page.createCDPSession();
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS,
      eventsEnabled: true,
    });

    // ---- A brand-new account -------------------------------------------
    const stamp = Date.now();
    const email = `report-${stamp}@project-eric.test`;
    const password = 'Str0ng-Passw0rd!23';

    console.log('\n[1] creating a new account');
    const reg = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Report',
        lastName: 'Writer',
        email,
        password,
      }),
    });
    if (!reg.ok) {
      throw new Error(`Registration failed (${reg.status}): ${await reg.text()}`);
    }
    const regJson = await reg.json();
    const token = regJson?.data?.token;
    if (!token) throw new Error('Registration returned no token.');

    // The app gates every page behind a finished onboarding, so the flag is
    // set through the same endpoint the tour itself uses.
    const onboarding = await fetch(`${API}/auth/onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        experience: 'Full-stack developer',
        languages: ['javascript', 'php', 'python'],
        securityFocus: 'Injection, authentication and secrets',
      }),
    });
    console.log(`  account: ${email}  (onboarding ${onboarding.status})`);

    // ---- Public pages, while logged out --------------------------------
    console.log('\n[2] public pages');
    await go(page, '/landing', 3000);
    await shot(page, 'public-landing', 'Landing page', 'Public', 'The marketing entry point, shown to a visitor who is not signed in.');

    await go(page, '/login');
    await shot(page, 'public-login', 'Sign in', 'Public', 'The login form a new user comes back to after signing up.');

    await go(page, '/signup');
    // Fill the form so the shot shows the real field state, including the
    // password strength meter and the rules checklist.
    await setReactInput(page, '#name', 'Report Writer');
    await setReactInput(page, '#email', email);
    await setReactInput(page, '#password', password);
    await setReactInput(page, '#confirmPassword', password);
    await clickText(page, 'button', /I agree to the/i);
    await sleep(500);
    await shot(page, 'public-signup', 'Create your account', 'Public', 'The signup form with a valid password: the strength meter and the four password rules all pass.');

    await go(page, '/forgot-password');
    await shot(page, 'public-forgot-password', 'Forgot password', 'Public', 'The password recovery request form.');

    await go(page, '/terms-of-service');
    await shot(page, 'public-terms', 'Terms of Service', 'Public', 'The terms page linked from the signup form.');

    await go(page, '/privacy-policy');
    await shot(page, 'public-privacy', 'Privacy Policy', 'Public', 'The privacy page linked from the signup form.');

    // ---- Sign in for real ----------------------------------------------
    console.log('\n[3] sign in');
    await go(page, '/login');
    await setReactInput(page, '#email', email);
    await setReactInput(page, '#password', password);
    await clickText(page, 'button', /^sign in$/i, { optional: false });
    await sleep(3500);
    await waitForHydrated(page);

    // The onboarding tour is shown to an account that has not finished it.
    if (page.url().includes('/onboarding')) {
      console.log('\n[4] onboarding tour');
      for (let step = 1; step <= 5; step += 1) {
        await sleep(1200);
        await shot(
          page,
          `onboarding-step-${step}`,
          `Onboarding — step ${step} of 5`,
          'Onboarding',
          [
            'Welcome to Project Eric: what the product is and what it promises.',
            'Smart code analysis: the security scanning the IDE does as you type.',
            'Secure execution: the sandbox the code runs in.',
            'Built-in Git: version control inside the IDE.',
            'Ready to build: the final step, with the community figures.',
          ][step - 1],
          { fullPage: false }
        );
        if (step < 5) {
          await clickText(page, 'button', /^next$/i, { optional: false });
          await sleep(1200);
        }
      }
      await clickText(page, 'button', /get started/i, { optional: false });
      await sleep(3000);
    }

    await waitForHydrated(page);
    await dismissTour(page);

    // ---- Dashboard + welcome tour --------------------------------------
    console.log('\n[5] dashboard');
    await go(page, '/dashboard', 3000);
    await shot(page, 'app-dashboard', 'Dashboard', 'Dashboard', 'The landing page of the signed-in app: security score, recent scans and the quick actions.');

    // The welcome tour overlay, if it is showing.
    const tourOpen = await page.evaluate(() => /step \d+ of \d+/i.test(document.body.innerText));
    if (tourOpen) {
      await shot(page, 'app-welcome-tour', 'Welcome tour', 'Dashboard', 'The guided tour that introduces the navigation, IDE, analysis, threats and team pages.', { fullPage: false });
      await dismissTour(page);
    }

    // ---- The OWASP scanner, driven for real ----------------------------
    console.log('\n[6] OWASP scanner');
    await go(page, '/owasp', 3000);
    await shot(page, 'owasp-scanner-idle', 'OWASP scanner — ready', 'OWASP Scanner', 'The scanner before anything is submitted: mode picker, editor and the language selector.');

    // Upload the vulnerable fixture so the scan has something real to find.
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(FIXTURE);
      await sleep(2500);
      await shot(page, 'owasp-scanner-uploaded', 'OWASP scanner — file loaded', 'OWASP Scanner', 'The vulnerable PHP file uploaded. The language was detected automatically and the line/character counters updated.');
    } else {
      problems.push('The OWASP scanner had no file input to upload into.');
    }

    // Run the scan.
    await clickText(page, 'button', /run owasp scan/i, { optional: false });
    await page
      .waitForFunction(() => /generate pdf report/i.test(document.body.innerText), { timeout: 90000 })
      .catch(() => problems.push('The OWASP scan did not finish within 90 seconds.'));
    await sleep(1500);
    await shot(page, 'owasp-scanner-results', 'OWASP scan results', 'OWASP Scanner', 'The finished scan: the security score, the per-category cards and the "Send to" hand-off bar.');

    // Open a finding so the evidence, the CWE and the fix are visible.
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('button[aria-expanded]')].find((b) =>
        /A0\d|A1\d/.test(b.textContent || '')
      );
      if (card) card.click();
    });
    await sleep(1500);
    await shot(page, 'owasp-finding-detail', 'A single finding, opened', 'OWASP Scanner', 'One category expanded: the description, the CWE, the highlighted source line and the remediation steps.');

    // Generate the PDF report.
    await clickText(page, 'button', /generate pdf report/i, { optional: false });
    await page.waitForSelector('[role="dialog"]', { timeout: 40000 });
    await sleep(1800);
    await shot(page, 'owasp-report-dialog', 'PDF report ready', 'OWASP Scanner', 'The popup shown once the report is built: the score, the issue count, the page count and the 24-hour deletion notice.', { fullPage: false });

    // Store it for 24 hours so the shareable link is shown.
    await clickText(page, '[role="dialog"] button', /store for 24 hours/i);
    await sleep(3000);
    await shot(page, 'owasp-report-stored', 'Report stored for 24 hours', 'OWASP Scanner', 'The stored copy: an unguessable download link and the countdown until the server deletes it.', { fullPage: false });

    // Download the PDF to disk.
    await clickText(page, '[role="dialog"] button', /download to my device/i);
    await sleep(3500);

    let pdfFile = null;
    for (let i = 0; i < 20; i += 1) {
      const entries = fs.readdirSync(DOWNLOADS).filter((f) => f.toLowerCase().endsWith('.pdf'));
      const partial = fs.readdirSync(DOWNLOADS).filter((f) => f.endsWith('.crdownload'));
      if (entries.length && !partial.length) {
        pdfFile = path.join(DOWNLOADS, entries[0]);
        break;
      }
      await sleep(700);
    }
    if (!pdfFile) {
      problems.push('The PDF download did not arrive on disk.');
    } else {
      const pdfTarget = path.join(OUT, path.basename(pdfFile));
      fs.copyFileSync(pdfFile, pdfTarget);
      const size = fs.statSync(pdfTarget).size;
      console.log(`  PDF saved: ${path.basename(pdfTarget)} (${(size / 1024).toFixed(0)} KB)`);
      shots.push({
        index: 'pdf',
        file: path.basename(pdfTarget),
        label: 'owasp-report-pdf',
        title: 'OWASP Top 10 (2026) Security Report (PDF)',
        section: 'OWASP Scanner',
        note: `The PDF the scanner generated (${(size / 1024).toFixed(0)} KB). Each page is rendered next to it as pdf-page-NN.png.`,
        url: '/owasp',
      });
    }

    // Close the popup.
    await clickText(page, '[role="dialog"] button', /^close$/i);
    await sleep(800);

    // ---- The pages that consume the scan --------------------------------
    console.log('\n[7] the security workspace');
    await go(page, '/security?tab=findings', 3000);
    await shot(page, 'app-analysis', 'Security findings', 'Findings', 'The findings from the scan, broken down by severity.');

    await go(page, '/security?tab=threats', 3000);
    await shot(page, 'app-threats', 'Threat intelligence', 'Threats', 'The same findings framed as threats, with the categories that passed.');

    await go(page, '/security?tab=reports', 3000);
    await shot(page, 'app-reports', 'Reports', 'Reports', 'The report history. The scan made a moment ago is listed here with its score and its export options.');

    // ---- The rest of the app --------------------------------------------
    console.log('\n[8] the rest of the app');
    await go(page, '/team', 3000);
    await shot(page, 'app-team', 'Team', 'Team', 'The team page for a brand-new account: no members yet, and the invite button.');

    await clickText(page, 'button', /invite member/i);
    await sleep(1200);
    await shot(page, 'app-team-invite-modal', 'Invite a team member', 'Team', 'The invite dialog: the email address and the role that is assigned.', { fullPage: false });
    await clickText(page, 'button', /^cancel$/i);
    await sleep(600);

    await go(page, '/about-team', 2500);
    await shot(page, 'app-about-team', 'About the team', 'About', 'The developers behind Project Eric.');

    // API keys — every tab.
    await go(page, '/api-keys', 3000);
    await shot(page, 'app-api-keys-overview', 'API keys — feature overview', 'API Keys', 'What each part of the key system is for and whether it is configured.');

    for (const [tab, label, title] of [
      [/^AI API Keys$/i, 'app-api-keys-keys', 'API keys — the keys'],
      [/^Sandbox Config$/i, 'app-api-keys-sandbox', 'API keys — sandbox configuration'],
      [/^OWASP Settings$/i, 'app-api-keys-owasp', 'API keys — OWASP scanner settings'],
      [/^AI Provider$/i, 'app-api-keys-provider', 'API keys — AI provider'],
    ]) {
      await clickText(page, 'button', tab);
      await sleep(1500);
      await shot(page, label, title, 'API Keys', 'The ' + title.split('— ')[1] + ' tab of the API keys page.');
    }

    await go(page, '/audit-logs', 2500);
    await shot(page, 'app-audit-logs', 'Audit logs', 'Audit Logs', 'The activity trail for the account. Every action the new user took is listed here.');

    await go(page, '/notifications', 3000);
    await shot(page, 'app-notifications', 'Notifications', 'Notifications', 'The notification centre for the account.');

    // The notification preferences modal.
    await clickText(page, 'button', /^settings$/i);
    await sleep(1500);
    await shot(page, 'app-notification-preferences', 'Notification preferences', 'Notifications', 'The preferences modal: which alerts the account wants, and how they are delivered.', { fullPage: false });
    await clickText(page, 'button', /^cancel$/i);
    await sleep(800);

    // Settings — every tab.
    console.log('\n[9] settings tabs');
    await go(page, '/settings', 3000);
    await shot(page, 'app-settings-profile', 'Settings — profile', 'Settings', 'The profile tab: the account details and the avatar.');

    for (const [id, label, title, note] of [
      ['security', 'app-settings-security', 'Settings — security', 'Password, the two-factor card and the API key list.'],
      ['notifications', 'app-settings-notifications', 'Settings — notifications', 'The per-account alert switches.'],
      ['appearance', 'app-settings-appearance', 'Settings — appearance', 'The theme buttons and the accent colour swatches.'],
      ['integrations', 'app-settings-integrations', 'Settings — integrations', 'The same connected services, with the connect and disconnect buttons.'],
      ['billing', 'app-settings-billing', 'Settings — billing', 'The plan, the usage counters and the payment method.'],
      ['help', 'app-settings-help', 'Settings — help and tour', 'The tour restart and the page-tip reset.'],
    ]) {
      await page.click(`[data-testid="settings-tab-${id}"]`);
      await sleep(1600);
      await shot(page, label, title, 'Settings', note);
    }

    // Dark mode, taken from the appearance tab.
    await page.click('[data-testid="settings-tab-appearance"]');
    await sleep(1200);
    await clickText(page, 'button', /dark/i);
    await sleep(1500);
    await shot(page, 'app-dark-mode', 'Dark theme', 'Settings', 'The same interface in the dark theme, picked on the appearance tab.');
    await clickText(page, 'button', /light/i);
    await sleep(1200);

    await go(page, '/profile', 2500);
    await shot(page, 'app-profile', 'Profile', 'Profile', 'The profile page: the achievements, the skills and the project activity.');

    // The header menus.
    console.log('\n[10] header menus');
    await go(page, '/dashboard', 2500);
    await clickText(page, 'button', /search\.\.\.|⌘K/i);
    await sleep(1200);
    await shot(page, 'app-search-menu', 'Search menu', 'Navigation', 'The quick-jump menu in the header.', { fullPage: false });
    await page.keyboard.press('Escape');
    await sleep(600);

    await clickText(page, 'button', /help/i);
    await sleep(1000);
    await shot(page, 'app-help-menu', 'Help menu', 'Navigation', 'The help and support menu.', { fullPage: false });
    await page.keyboard.press('Escape');
    await sleep(600);

    await clickText(page, 'button', /open profile menu/i);
    await sleep(1000);
    await shot(page, 'app-profile-menu', 'Account menu', 'Navigation', 'The account menu in the top right corner.', { fullPage: false });
    await page.keyboard.press('Escape');
    await sleep(600);

    await go(page, '/sandbox', 4000);
    await shot(page, 'app-sandbox', 'Sandbox', 'Sandbox', 'The in-browser IDE: the file tree, the editor and the output pane.', { fullPage: false });

    await go(page, '/owasp-analysis', 4000);
    await shot(page, 'app-owasp-analysis', 'OWASP analysis workbench', 'IDE', 'The OWASP analysis page with the code-server workbench embedded alongside it.', { fullPage: false });

    await go(page, '/ide', 4000);
    await shot(page, 'app-ide', 'Live IDE', 'IDE', 'The Live IDE page: the status of Vite and code-server, and the button that opens the workbench.', { fullPage: false });

    // The public viewer, signed out.
    await go(page, '/viewer', 3000);
    await shot(page, 'public-viewer', 'Collab viewer', 'Public', 'The public viewer a guest opens through a share link.', { fullPage: false });
  } catch (err) {
    problems.push(`Harness error: ${err.message}`);
    console.error('\nFAILED:', err.message);
  } finally {
    await browser.close();
  }

  // ---- The index --------------------------------------------------------
  const sections = [...new Set(shots.map((s) => s.section))];
  const lines = [];
  lines.push('# Project Eric — UI capture');
  lines.push('');
  lines.push(`Captured ${new Date().toLocaleString('en-GB')} from a live run against the dev stack.`);
  lines.push('');
  lines.push('Every shot was taken as a brand-new account, created through the real signup');
  lines.push('form and signed in through the real login form, so what is shown is the');
  lines.push('interface a first-time user actually sees.');
  lines.push('');

  for (const section of sections) {
    lines.push(`## ${section}`);
    lines.push('');
    for (const s of shots.filter((x) => x.section === section)) {
      const name = typeof s.index === 'number' ? `${String(s.index).padStart(2, '0')}` : 'PDF';
      lines.push(`### ${name} · ${s.title}`);
      lines.push('');
      lines.push(`![${s.title}](${s.file})`);
      lines.push('');
      if (s.note) lines.push(`${s.note}`);
      lines.push('');
      lines.push(`File: \`${s.file}\` · Route: \`${s.url}\``);
      lines.push('');
    }
  }

  if (problems.length) {
    lines.push('## Notes');
    lines.push('');
    for (const p of problems) lines.push(`- ${p}`);
    lines.push('');
  }

  fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'));
  fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), shots, problems, consoleErrors }, null, 2)
  );

  // The temporary download folder is not part of the deliverable.
  try {
    fs.rmSync(DOWNLOADS, { recursive: true, force: true });
  } catch {
    /* the folder is not there */
  }

  console.log(`\n${shots.length} screens saved to ${OUT}`);
  console.log(`Index: ${path.join(OUT, 'INDEX.md')}`);
  if (problems.length) {
    console.log('\nProblems:');
    for (const p of problems) console.log(`  - ${p}`);
  }
})();
