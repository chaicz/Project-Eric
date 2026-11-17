#!/usr/bin/env node
/**
 * Narrow down why the brand panel's body content does not paint.
 *
 * The panel's header paints but its body does not, and hit-testing
 * finds the body elements, so this is a compositing problem rather
 * than a layout one. This script toggles the candidate properties
 * one at a time and reports the near-white pixel count in the hero
 * region after each, so the property responsible can be named.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nearWhiteCount(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  let white = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * stride + x * bpp;
      if (out[i] > 200 && out[i + 1] > 200 && out[i + 2] > 200) white += 1;
    }
  }
  return white;
}

const VARIANTS = [
  ['0-baseline', () => {}],
  ['1-no-isolate', () => {
    const h1 = document.querySelector('h1');
    h1.closest('div.isolate').style.isolation = 'auto';
  }],
  ['2-no-tint-backdrop', () => {
    const h1 = document.querySelector('h1');
    const panel = h1.closest('div.isolate');
    const tint = panel.querySelector('div.absolute.inset-0');
    if (tint) tint.style.backdropFilter = 'none';
  }],
  ['3-no-grain-blend', () => {
    for (const el of document.querySelectorAll('div')) {
      if (getComputedStyle(el).mixBlendMode === 'overlay') el.style.mixBlendMode = 'normal';
    }
  }],
  ['4-no-panel-backdrop', () => {
    const h1 = document.querySelector('h1');
    const panel = h1.closest('div.isolate');
    for (const el of panel.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.backdropFilter && s.backdropFilter !== 'none') el.style.backdropFilter = 'none';
    }
  }],
  ['5-no-isolate-and-backdrop', () => {
    const h1 = document.querySelector('h1');
    const panel = h1.closest('div.isolate');
    panel.style.isolation = 'auto';
    for (const el of panel.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.backdropFilter && s.backdropFilter !== 'none') el.style.backdropFilter = 'none';
    }
  }],
  ['6-no-isolate-and-grain', () => {
    const h1 = document.querySelector('h1');
    h1.closest('div.isolate').style.isolation = 'auto';
    for (const el of document.querySelectorAll('div')) {
      if (getComputedStyle(el).mixBlendMode === 'overlay') el.style.mixBlendMode = 'normal';
    }
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
  await sleep(2800);

  const box = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const r = h1.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  });

  for (const [name, action] of VARIANTS) {
    await page.evaluate(action);
    await sleep(600);
    const white = nearWhiteCount(await page.screenshot({ clip: box }));
    console.log(`${name.padEnd(30)} near-white=${white}`);
    if (white > 500) {
      const file = path.resolve(__dirname, '..', 'logs', `fixed-${name}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 100, width: 800, height: 500 } });
      console.log(`  >>> FIXED. saved ${file}`);
      break;
    }
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});