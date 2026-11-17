#!/usr/bin/env node
/**
 * Finds the CSS animation that stops the login hero from painting.
 *
 * The hero has correct geometry, colour and opacity, yet it does not
 * appear. Removing every animation makes it appear, so this script
 * disables the running animations one group at a time and reports which
 * group is responsible.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLIP = { x: 0, y: 100, width: 800, height: 400 };

/**
 * Measures how much light the hero area receives.
 *
 * The hero text is white on a dark panel, so a painted hero makes the
 * region much brighter. The mean brightness of the region is used as
 * the signal: painted is well above the background.
 */
const measure = () => {
  const h1 = document.querySelector('h1');
  if (!h1) return null;
  const r = h1.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
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
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2500);

  // List the distinct running animation names.
  const names = await page.evaluate(() => {
    const set = new Set();
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.animationName && s.animationName !== 'none') {
        for (const n of s.animationName.split(',')) set.add(n.trim());
      }
    }
    return [...set];
  });
  console.log('running animations:', names.join(', '));
  console.log('');

  const box = await page.evaluate(measure);

  // Disable one animation name at a time and check whether the hero
  // region gets brighter.
  const brightness = async () => {
    const file = path.resolve(__dirname, '..', 'logs', 'hero-bright.png');
    await page.screenshot({ path: file, clip: CLIP });
    return file;
  };

  // Baseline
  await brightness();
  console.log('baseline captured');

  for (const name of names) {
    await page.evaluate((n) => {
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.animationName && s.animationName.split(',').some((x) => x.trim() === n)) {
          el.style.animationName = 'none';
        }
      }
    }, name);
    await sleep(500);
    await brightness();
    const file = path.resolve(__dirname, '..', 'logs', `hero-without-${name}.png`);
    await page.screenshot({ path: file, clip: CLIP });
    console.log('disabled', name, '->', file);
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});