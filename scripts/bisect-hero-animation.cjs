#!/usr/bin/env node
/**
 * Bisects which animation stops the auth hero from painting.
 *
 * Disabling every animation makes the hero appear, so the culprit is
 * one of them. This script disables them one at a time and measures the
 * near-white pixel count in the hero region after each step, so the
 * responsible animation is named rather than guessed at.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function countNearWhite(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bpp = channels * (bitDepth / 8);
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
  await sleep(3000);

  const box = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const r = h1.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  });

  const measure = async (label) => {
    await sleep(500);
    const white = countNearWhite(await page.screenshot({ clip: box }));
    console.log(`${label.padEnd(34)} near-white=${white}`);
    return white;
  };

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

  console.log('animations on the page:', names.join(', '), '\n');
  await measure('baseline');

  // Disable one at a time and see whether the hero appears.
  for (const name of names) {
    await page.evaluate((n) => {
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.animationName && s.animationName.split(',').some((x) => x.trim() === n)) {
          el.style.animationName = 'none';
        }
      }
    }, name);
    const white = await measure(`without ${name}`);
    if (white > 500) {
      console.log(`\n>>> The hero appears once "${name}" is disabled. That is the culprit.`);
      const file = path.resolve(__dirname, '..', 'logs', 'paint-bisect-result.png');
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 800, height: 700 } });
      console.log(`saved ${file}`);
      break;
    }
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});