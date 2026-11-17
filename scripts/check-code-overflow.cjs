#!/usr/bin/env node
/**
 * Checks that every line of a horizontally scrollable code block can be
 * reached, and that no glyph is painted outside its scroll container.
 *
 *   node scripts/check-code-overflow.cjs /landing
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/landing';

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

(async () => {
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
  await sleep(2200);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(700);

  const report = await page.evaluate(() => {
    const out = [];
    for (const pre of document.querySelectorAll('pre')) {
      const cs = getComputedStyle(pre);
      const pr = pre.getBoundingClientRect();
      const scrollableX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      const scrollableY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';

      // Text that is painted beyond the box and cannot be scrolled to.
      const escaped = [];
      for (const span of pre.querySelectorAll('span')) {
        const own = Array.from(span.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim();
        if (!own) continue;
        const sr = span.getBoundingClientRect();
        const overflowsRight = sr.right > pr.right + 1;
        const overflowsLeft = sr.left < pr.left - 1;
        if (overflowsRight || overflowsLeft) {
          escaped.push({
            text: own.slice(0, 50),
            left: Math.round(sr.left),
            right: Math.round(sr.right),
          });
        }
      }

      out.push({
        cls: (typeof pre.className === 'string' ? pre.className : '').slice(0, 90),
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        scrollableX,
        scrollableY,
        clientW: pre.clientWidth,
        scrollW: pre.scrollWidth,
        clientH: pre.clientHeight,
        scrollH: pre.scrollHeight,
        box: { left: Math.round(pr.left), right: Math.round(pr.right), top: Math.round(pr.top), bottom: Math.round(pr.bottom) },
        escapedCount: escaped.length,
        escaped: escaped.slice(0, 8),
      });
    }
    return out;
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
