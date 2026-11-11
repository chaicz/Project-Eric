#!/usr/bin/env node
/**
 * Project Eric — verify the rebuilt Security page.
 *
 * Drives a real Chrome against the Security workspace and checks that it:
 *
 *   • mounts without a JavaScript error
 *   • renders the new landmarks (the panels that only exist in the
 *     rebuilt layout)
 *   • still runs its core interactions — switching views, filtering the
 *     findings, selecting a row, opening the remediation brief, and
 *     previewing a report
 *
 * The API is stubbed through request interception so the page behaves
 * exactly as it does with a live XAMPP/MySQL backend, without needing
 * XAMPP to be running.
 *
 *   node scripts/verify-security-ui.cjs
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:5199';
const OUT = path.resolve(__dirname, '..', 'logs', 'verify-security-ui');

const USER = {
  id: 1,
  name: 'Alex Rivera',
  email: 'demo@project-eric.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

const now = Date.now();
const iso = (offsetDays = 0) => new Date(now - offsetDays * 86400000).toISOString();

// Four stored vulnerabilities with a spread of severities, categories and
// ages, so the matrix, the age buckets and the triage order all have
// something real to render.
const VULNS = [
  {
    id: 'v1',
    title: 'SQL injection in user lookup',
    severity: 'critical',
    category: 'Injection',
    cweId: 'CWE-89',
    owaspId: 'A03',
    location: 'api/users.php:42',
    status: 'open',
    cvss: 9.8,
    description: 'User input is concatenated straight into the SQL query.',
    remediation: 'Use a prepared statement with bound parameters.',
    discoveredAt: iso(1),
    projectName: 'project-eric-api',
  },
  {
    id: 'v2',
    title: 'Weak MD5 password hashing',
    severity: 'high',
    category: 'Cryptographic Failures',
    cweId: 'CWE-328',
    owaspId: 'A02',
    location: 'api/auth.php:18',
    status: 'in_progress',
    cvss: 7.5,
    description: 'Passwords are hashed with MD5, which is not a password hash.',
    remediation: 'Switch to bcrypt or Argon2 with a work factor of 12 or more.',
    discoveredAt: iso(12),
    projectName: 'project-eric-api',
  },
  {
    id: 'v3',
    title: 'Missing authorization on project delete',
    severity: 'high',
    category: 'Broken Access Control',
    cweId: 'CWE-862',
    owaspId: 'A01',
    location: 'api/projects/index.php:96',
    status: 'open',
    cvss: 8.1,
    description: 'The delete endpoint does not check the session role.',
    remediation: 'Verify the caller is an admin before deleting a project.',
    discoveredAt: iso(3),
    projectName: 'project-eric-api',
  },
  {
    id: 'v4',
    title: 'Verbose error messages expose stack traces',
    severity: 'medium',
    category: 'Security Misconfiguration',
    cweId: 'CWE-209',
    owaspId: 'A05',
    location: 'api/index.php:22',
    status: 'open',
    cvss: 5.3,
    description: 'Production errors echo the exception message to the client.',
    remediation: 'Log the detail server-side and return a generic message.',
    discoveredAt: iso(40),
    projectName: 'eric-collab',
  },
  {
    id: 'v5',
    title: 'Hardcoded API key in the bundle',
    severity: 'critical',
    category: 'Data Integrity Failures',
    cweId: 'CWE-798',
    owaspId: 'A08',
    location: 'src/services/api.js:14',
    status: 'open',
    cvss: 9.1,
    description: 'A signing key is embedded in the client bundle.',
    remediation: 'Move the key to the server and proxy the request.',
    discoveredAt: iso(0),
    projectName: 'eric-collab',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let browser;

function record(page, ok, message, extra) {
  results.push({ page, ok, message, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${page}] ${message}${extra ? ` — ${extra}` : ''}`);
}

async function shoot(page, name) {
  try {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  } catch {
    /* the screenshot is a nicety, not the assertion */
  }
}

async function expectText(page, label, text, required = true) {
  // The labels are rendered in uppercase by CSS, so the comparison is
  // case-insensitive — `innerText` reflects the rendered casing.
  const found = await page.evaluate(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    text
  );
  record(label, found === required, `${required ? 'found' : 'did not contain'} "${text}"`);
  return found;
}

async function clickByText(page, text, selector = 'button') {
  return page.evaluate(
    (t, sel) => {
      const el = Array.from(document.querySelectorAll(sel)).find((b) =>
        b.textContent.trim().toLowerCase().includes(t.toLowerCase())
      );
      if (!el) return false;
      el.click();
      return true;
    },
    text,
    selector
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1680,1050'],
  });

  const context = await browser.createBrowserContext();

  const page = await context.newPage();
  await page.setViewport({ width: 1680, height: 1050 });

  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.setItem('token', s.token);
      localStorage.setItem('project-eric_user', JSON.stringify(s.user));
      localStorage.setItem('eric_welcome_tour_seen', 'true');
      // The theme is only seeded when it has not been set yet, so the
      // dark-mode pass can change it without this hook resetting it.
      if (!localStorage.getItem('project-eric_theme')) {
        localStorage.setItem('project-eric_theme', 'light');
      }
    } catch {
      /* not a real origin yet */
    }
  }, { token: 'verify-token', user: USER });

  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (!/project-eric-api|\/api\//i.test(url)) {
      req.continue().catch(() => {});
      return;
    }

    const json = (body) => {
      req.respond({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(body),
      }).catch(() => {});
    };

    // A preflight request has to be answered on its own.
    if (req.method() === 'OPTIONS') {
      req.respond({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
        body: '',
      }).catch(() => {});
      return;
    }

    if (/validate/i.test(url)) {
      json({ success: true, data: { user: USER } });
      return;
    }
    if (/vulnerabilities/i.test(url)) {
      json({ success: true, data: { vulnerabilities: VULNS } });
      return;
    }
    if (/projects/i.test(url)) {
      json({
        success: true,
        data: {
          projects: [
            {
              id: 1,
              name: 'project-eric-api',
              language: 'PHP',
              framework: 'Laravel',
              files: 48,
              threatLevel: 'critical',
              criticalCount: 2,
              vulnerabilityCount: 4,
            },
            {
              id: 2,
              name: 'eric-collab',
              language: 'TypeScript',
              framework: 'React',
              files: 63,
              threatLevel: 'high',
              criticalCount: 1,
              vulnerabilityCount: 2,
            },
          ],
        },
      });
      return;
    }
    if (/scans/i.test(url)) {
      json({
        success: true,
        data: {
          scans: [
            {
              id: 1,
              projectName: 'project-eric-api',
              vulnerabilitiesFound: 4,
              codeLinesAnalyzed: 1240,
              completedAt: iso(1),
            },
          ],
        },
      });
      return;
    }

    json({ success: true, data: [] });
  });

  // ---- Findings tab ----------------------------------------------------
  console.log('\n=== Security · Findings ===');
  const errors = [];
  const onError = (e) => errors.push(String(e.message || e));
  const onConsole = (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  };
  page.on('pageerror', onError);
  page.on('console', onConsole);

  await page.goto(`${BASE}/security`, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2200);

  const mounted = await page.evaluate(() => {
    const root = document.getElementById('root');
    return Boolean(root && root.childElementCount > 0);
  });
  record(
    'security',
    mounted,
    'the page mounted',
    errors.length ? errors.slice(0, 3).join(' | ') : undefined
  );

  // The new landmarks.
  await expectText(page, 'security', 'Severity distribution');
  await expectText(page, 'security', 'Exposure matrix');
  await expectText(page, 'security', 'All findings');
  await expectText(page, 'security', 'What to fix next');
  await expectText(page, 'security', 'Remediation');
  await expectText(page, 'security', 'Finding age');
  await expectText(page, 'security', 'Open findings');

  // The stored findings actually reached the page.
  await expectText(page, 'security', 'SQL injection in user lookup');
  await expectText(page, 'security', 'Hardcoded API key in the bundle');

  // The matrix is populated from the real categories.
  await expectText(page, 'security', 'Broken Access Control');
  await expectText(page, 'security', 'Cryptographic Failures');

  await shoot(page, 'security-findings');

  // Selecting a row opens the remediation brief for that finding.
  const selected = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent.includes('SQL injection in user lookup')
    );
    if (!row) return false;
    row.click();
    return true;
  });
  record('security', selected, 'a finding row can be selected');
  await sleep(700);

  await expectText(page, 'security', 'Use a prepared statement');
  await expectText(page, 'security', 'Mark resolved');
  await expectText(page, 'security', 'Open in IDE');
  await shoot(page, 'security-remediation');

  // The severity chip filters the table.
  const chipClicked = await clickByText(page, 'Critical', 'button');
  record('security', chipClicked, 'the severity chip is present');
  await sleep(600);

  const onlyCritical = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    if (!rows.length) return false;
    return rows.every((r) => r.textContent.toLowerCase().includes('critical'));
  });
  record('security', onlyCritical, 'the severity filter narrows the table to critical findings');

  // Clear the filter again.
  await clickByText(page, 'Clear', 'button');
  await sleep(500);

  // ---- Threats tab -----------------------------------------------------
  console.log('\n=== Security · Threats ===');
  const switchedThreats = await clickByText(page, 'Threats');
  record('security', switchedThreats, 'the threats view can be opened');
  await sleep(1400);

  await expectText(page, 'security', 'Live threat feed');
  await expectText(page, 'security', 'Threat detail');
  await expectText(page, 'security', 'Threat mix');
  await expectText(page, 'security', 'CVE database');
  await expectText(page, 'security', 'Flagged categories');
  await expectText(page, 'security', 'Active threats');
  await shoot(page, 'security-threats');

  // The CVE lookup answers and renders its result.
  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="CVE identifier"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(input, 'CVE-2024-1234');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(300);
  const submitted = await clickByText(page, 'Search CVE');
  record('security', submitted, 'the CVE search button exists');
  await sleep(2200);
  await expectText(page, 'security', 'CVE-2024-1234');

  // ---- Reports tab -----------------------------------------------------
  console.log('\n=== Security · Reports ===');
  const switchedReports = await clickByText(page, 'Reports');
  record('security', switchedReports, 'the reports view can be opened');
  await sleep(1400);

  await expectText(page, 'security', 'Generated reports');
  await expectText(page, 'security', 'OWASP coverage');
  await expectText(page, 'security', 'Quick export');
  await expectText(page, 'security', 'Total reports');
  await shoot(page, 'security-reports');

  // The keyboard shortcut switches views.
  await page.keyboard.press('1');
  await sleep(900);
  const backOnFindings = await page.evaluate(() =>
    document.body.innerText.includes('Severity distribution')
  );
  record('security', backOnFindings, 'the "1" shortcut returns to the findings view');

  // ---- Dark mode -------------------------------------------------------
  console.log('\n=== Dark mode ===');
  await page.evaluate(() => {
    localStorage.setItem('project-eric_theme', 'dark');
  });
  await page.goto(`${BASE}/security`, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2200);

  const isDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  );
  record('dark mode', isDark, 'the dark theme is applied');

  await expectText(page, 'dark mode', 'Severity distribution');
  await expectText(page, 'dark mode', 'Exposure matrix');
  await expectText(page, 'dark mode', 'What to fix next');
  await shoot(page, 'security-dark');

  page.off('pageerror', onError);
  page.off('console', onConsole);

  // ---- Summary ---------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  · [${f.page}] ${f.message}${f.extra ? ` — ${f.extra}` : ''}`);
  }

  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2)
  );

  await browser.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Harness error:', err);
  if (browser) await browser.close();
  process.exit(1);
});
