#!/usr/bin/env node
/**
 * Reports the full class list of a problem element, so a finding can be
 * traced back to the exact source line.
 *
 * node scripts/inspect-finding.cjs <route> <text>
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/owasp';
const needle = process.argv[3] || 'OWASP Scanner';

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

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(1800);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(400);

  const found = await page.evaluate((text) => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (!own || !own.includes(text)) continue;
      const cs = getComputedStyle(el);
      const chain = [];
      let n = el;
      let g = 0;
      while (n && n.nodeType === 1 && g < 8) {
        const s = getComputedStyle(n);
        chain.push({
          tag: n.tagName.toLowerCase(),
          cls: (typeof n.className === 'string' ? n.className : '').slice(0, 220),
          color: s.color,
          bg: s.backgroundColor,
          bgImage: s.backgroundImage === 'none' ? '' : s.backgroundImage.slice(0, 120),
        });
        n = n.parentElement;
        g += 1;
      }
      out.push({
        own: own.slice(0, 120),
        className: (typeof el.className === 'string' ? el.className : ''),
        outerHTML: el.outerHTML.slice(0, 500),
        chain,
      });
    }
    return out;
  }, needle);

  console.log(JSON.stringify(found, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
