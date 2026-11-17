#!/usr/bin/env node
/**
 * Takes a full-page dark-mode screenshot of one route and prints the
 * geometry of the elements the visibility audit flagged as clipped, so a
 * truncation that is by design can be told apart from text that has
 * been pushed out of its container.
 *
 *   node scripts/inspect-clipped.cjs /dashboard "Unrestricted Resource"
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const SHOT_DIR = path.resolve(__dirname, '..', 'reports', 'dark-mode-visibility-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/dashboard';
const needle = process.argv[3] || '';

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
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

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
      req.continue({
        url: url.replace(
          /https?:\/\/localhost\/project-eric-api/,
          'http://127.0.0.1:5299/project-eric-api'
        ),
      });
      return;
    }
    req.continue();
  });

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2000);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(600);

  const info = await page.evaluate((needleText) => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (!own) continue;
      if (needleText && !own.includes(needleText)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // Walk up for the clipping ancestor.
      let anc = el.parentElement;
      let clipper = null;
      let g = 0;
      while (anc && g < 40) {
        const acs = getComputedStyle(anc);
        if (acs && (acs.overflow === 'hidden' || acs.overflowX === 'hidden' || acs.overflowY === 'hidden')) {
          const ar = anc.getBoundingClientRect();
          if (
            r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 ||
            r.right <= ar.left + 1 || r.left >= ar.right - 1
          ) {
            clipper = {
              tag: anc.tagName.toLowerCase(),
              cls: (typeof anc.className === 'string' ? anc.className : '').slice(0, 120),
              rect: { top: Math.round(ar.top), bottom: Math.round(ar.bottom), left: Math.round(ar.left), right: Math.round(ar.right) },
              overflow: acs.overflow,
            };
            break;
          }
        }
        anc = anc.parentElement;
        g += 1;
      }
      out.push({
        text: own.slice(0, 80),
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 140),
        rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) },
        textOverflow: cs.textOverflow,
        display: cs.display,
        clipper,
      });
    }
    return out;
  }, needle);

  console.log(JSON.stringify(info, null, 2));

  const name = route.replace(/[/?=&]/g, '_').replace(/^_/, '') || 'root';
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: true,
  });
  console.log('screenshot:', path.join(SHOT_DIR, `${name}.png`));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
