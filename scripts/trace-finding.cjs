#!/usr/bin/env node
/**
 * Reports the ancestor chain of the elements that fail the contrast
 * check, so a finding can be traced to the surface that is wrong.
 *
 * node scripts/trace-finding.cjs /landing "before"
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/landing';
const needle = process.argv[3] || '';

const SEED_USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
};

const ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-contrast-engine.js'),
  'utf8'
);

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
  await sleep(2200);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(600);

  const rows = await page.evaluate(ENGINE + '\n;auditText();');
  const bad = rows.filter((r) => r.problem && (!needle || r.text.includes(needle)));

  // Locate the offending elements again, by their text, so the chain
  // can be walked from the element itself rather than from a point that
  // may have scrolled out of view.
  const chains = await page.evaluate(
    (needles) => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim();
        if (!own) continue;
        if (needles.length && !needles.some((t) => own.includes(t))) continue;
        const chain = [];
        let n = el;
        let g = 0;
        while (n && n.nodeType === 1 && g < 10) {
          const s = getComputedStyle(n);
          chain.push({
            tag: n.tagName.toLowerCase(),
            cls: (typeof n.className === 'string' ? n.className : '').slice(0, 170),
            bg: s.backgroundColor,
            bgImage: s.backgroundImage === 'none' ? '' : s.backgroundImage.slice(0, 110),
            opacity: s.opacity,
            filter: s.filter,
            backdropFilter: s.backdropFilter,
            position: s.position,
          });
          n = n.parentElement;
          g += 1;
        }
        out.push({ text: own.slice(0, 60), chain });
      }
      return out;
    },
    needle ? [needle] : []
  );

  let index = 0;
  for (const r of bad) {
    const c = chains[index];
    index += 1;
    console.log(`--- "${r.text}" ratio=${r.ratio} color=${r.color} bg=${r.bg}`);
    if (!c) {
      console.log('   (element not found)');
      continue;
    }
    for (const n of c.chain) {
      console.log(`   ${n.tag.padEnd(6)} bg=${n.bg.padEnd(24)} op=${n.opacity} pos=${n.position}`);
      if (n.bgImage) console.log(`          img=${n.bgImage}`);
      if (n.filter && n.filter !== 'none') console.log(`          filter=${n.filter}`);
      if (n.backdropFilter && n.backdropFilter !== 'none') console.log(`          backdrop=${n.backdropFilter}`);
      console.log(`          ${n.cls}`);
    }
    console.log('');
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
