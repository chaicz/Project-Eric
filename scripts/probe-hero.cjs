#!/usr/bin/env node
/**
 * Determines whether the auth hero is painted, or painted over.
 *
 * A probe is placed exactly where the hero's own text sits. If the
 * probe shows, the surface is visible and the hero's own text is the
 * problem. If the probe is hidden too, something is painted over the
 * region — and the probe is then moved above each candidate layer to
 * find which one covers it.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLIP = { x: 0, y: 100, width: 800, height: 400 };

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
  await sleep(2800);

  // Put a probe exactly on the hero's text baseline.
  await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const r = h1.getBoundingClientRect();
    const probe = document.createElement('div');
    probe.id = 'hero-probe';
    probe.textContent = 'PROBE-ON-HERO';
    probe.style.cssText =
      `position:fixed;left:${Math.round(r.left)}px;top:${Math.round(r.top)}px;z-index:2147483647;` +
      'color:#00ff00;font-size:40px;font-weight:900;background:#000;padding:2px';
    document.body.appendChild(probe);
  });
  await sleep(500);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'logs', 'probe-on-hero.png'), clip: CLIP });
  console.log('saved logs/probe-on-hero.png');

  // Now put a probe *inside* the panel, right at the hero position,
  // so it shares the hero's stacking context.
  await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const panel = h1.closest('div.isolate');
    const r = h1.getBoundingClientRect();
    const probe = document.createElement('div');
    probe.textContent = 'PROBE-IN-PANEL';
    probe.style.cssText =
      `position:absolute;left:${Math.round(r.left)}px;top:${Math.round(r.top)}px;z-index:2147483647;` +
      'color:#ffff00;font-size:40px;font-weight:900;background:#000;padding:2px';
    panel.appendChild(probe);
  });
  await sleep(500);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'logs', 'probe-in-panel.png'), clip: CLIP });
  console.log('saved logs/probe-in-panel.png');

  // And inside the content stack itself.
  await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const stack = h1.closest('div.relative.z-10');
    const r = h1.getBoundingClientRect();
    const probe = document.createElement('div');
    probe.textContent = 'PROBE-IN-STACK';
    probe.style.cssText =
      `position:absolute;left:${Math.round(r.left)}px;top:${Math.round(r.top)}px;z-index:2147483647;` +
      'color:#ff00ff;font-size:40px;font-weight:900;background:#000;padding:2px';
    stack.appendChild(probe);
  });
  await sleep(500);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'logs', 'probe-in-stack.png'), clip: CLIP });
  console.log('saved logs/probe-in-stack.png');

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});