#!/usr/bin/env node
/**
 * Isolates why the login page's brand hero is not painted.
 *
 * The hero text has correct geometry, colour and opacity, yet it does
 * not appear on screen. This script removes one layer at a time and
 * screenshots after each, so the layer responsible can be named.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLIP = { x: 0, y: 100, width: 800, height: 400 };

const STEPS = [
  ['0-baseline', () => {}],
  ['1-no-grain', () => {
    for (const el of document.querySelectorAll('div')) {
      if (getComputedStyle(el).mixBlendMode === 'overlay') el.style.display = 'none';
    }
  }],
  ['2-no-grid-mask', () => {
    for (const el of document.querySelectorAll('div')) {
      const s = getComputedStyle(el);
      if (s.webkitMaskImage && s.webkitMaskImage !== 'none') el.style.display = 'none';
    }
  }],
  ['3-no-aurora', () => {
    for (const el of document.querySelectorAll('div')) {
      const s = getComputedStyle(el);
      if (s.animationName && s.animationName.startsWith('aurora')) el.style.display = 'none';
    }
  }],
  ['4-no-vignette', () => {
    for (const el of document.querySelectorAll('div')) {
      const s = getComputedStyle(el);
      if (s.position === 'absolute' && s.backgroundImage.includes('radial-gradient(ellipse at center')) {
        el.style.display = 'none';
      }
    }
  }],
  ['5-no-panel-overlays', () => {
    const h1 = document.querySelector('h1');
    const panel = h1 && h1.closest('div.isolate');
    if (!panel) return;
    for (const el of panel.children) {
      const s = getComputedStyle(el);
      if (s.position === 'absolute') el.style.display = 'none';
    }
  }],
  ['6-plain-hero', () => {
    const holder = document.createElement('div');
    holder.style.cssText =
      'position:fixed;top:100px;left:100px;z-index:99999;color:#ffffff;font-size:60px;font-weight:700';
    holder.textContent = 'REPLACED HERO';
    document.body.appendChild(holder);
  }],
];

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

  for (const [name, action] of STEPS) {
    await page.evaluate(action);
    await sleep(500);
    const file = path.resolve(__dirname, '..', 'logs', `iso-${name}.png`);
    await page.screenshot({ path: file, clip: CLIP });
    console.log('saved', file);
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});