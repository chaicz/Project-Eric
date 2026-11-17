#!/usr/bin/env node
/**
 * Prints the computed style of the elements that should be visible on a
 * route, so an invisible element can be traced to the property that
 * hides it (opacity, animation, clipping, zero size).
 *
 * node scripts/inspect-visible.cjs /login --signed-out "Sign in to your"
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/login';
const authed = !process.argv.includes('--signed-out');

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
  await page.evaluateOnNewDocument((user, token, useAuth) => {
    try {
      if (useAuth) {
        localStorage.setItem('token', token);
        localStorage.setItem('project-eric_user', JSON.stringify(user));
      }
      localStorage.setItem('eric_welcome_tour_seen', 'true');
      localStorage.setItem('project-eric_theme', 'dark');
    } catch { /* ignore */ }
  }, SEED_USER, 'mock-token', authed);

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2500);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(1200);

  const info = await page.evaluate(() => {
    const out = [];
    // Every element with a text node, reported with the properties that
    // can hide it.
    for (const el of document.querySelectorAll('body *')) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (!own) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const invisible =
        parseFloat(cs.opacity) < 0.15 ||
        r.width < 1 ||
        r.height < 1;
      if (!invisible) continue;
      out.push({
        text: own.slice(0, 60),
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 140),
        opacity: cs.opacity,
        animation: cs.animationName + ' ' + cs.animationFillMode,
        visibility: cs.visibility,
        display: cs.display,
        rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
        parentOpacity: el.parentElement ? getComputedStyle(el.parentElement).opacity : null,
        parentRect: el.parentElement
          ? (() => {
              const pr = el.parentElement.getBoundingClientRect();
              return `${Math.round(pr.width)}x${Math.round(pr.height)}`;
            })()
          : null,
      });
    }
    return out;
  });

  console.log(`Route: ${route}  hidden-text elements: ${info.length}\n`);
  for (const i of info) {
    console.log(`text="${i.text}"`);
    console.log(`  tag=${i.tag} opacity=${i.opacity} anim=${i.animation} rect=${i.rect}`);
    console.log(`  parentOpacity=${i.parentOpacity} parentRect=${i.parentRect}`);
    console.log(`  class="${i.cls}"`);
    console.log('');
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
