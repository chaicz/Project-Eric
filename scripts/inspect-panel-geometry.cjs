#!/usr/bin/env node
/**
 * Prints the geometry of the dashboard panels so a clipped card can be
 * traced to the element that is too small for its content.
 *
 *   node scripts/inspect-panel-geometry.cjs
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2200);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(800);

  const info = await page.evaluate(() => {
    const out = [];
    for (const section of document.querySelectorAll('section.minimal-card')) {
      const r = section.getBoundingClientRect();
      const header = section.querySelector('header');
      const body = section.querySelector('header + div');
      const title = header?.querySelector('h3')?.textContent?.trim() || '';
      const hr = header?.getBoundingClientRect();
      const br = body?.getBoundingClientRect();
      const cs = body ? getComputedStyle(body) : null;
      out.push({
        title,
        section: {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          h: Math.round(r.height),
          scrollH: section.scrollHeight,
          clientH: section.clientHeight,
          overflow: getComputedStyle(section).overflow,
        },
        header: hr
          ? { top: Math.round(hr.top), bottom: Math.round(hr.bottom), h: Math.round(hr.height) }
          : null,
        body: br
          ? {
              top: Math.round(br.top),
              bottom: Math.round(br.bottom),
              h: Math.round(br.height),
              scrollH: body.scrollHeight,
              clientH: body.clientHeight,
              overflowY: cs.overflowY,
              maxHeight: cs.maxHeight,
              flex: cs.flex,
              minHeight: cs.minHeight,
            }
          : null,
      });
    }
    return out;
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
