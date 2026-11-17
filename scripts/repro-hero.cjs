#!/usr/bin/env node
/**
 * Minimal reproduction for the invisible auth hero.
 *
 * The hero text is in the DOM with the right colour, size and position,
 * but it does not paint. The `auth-fade-up` animation is the trigger.
 * This script puts plain text with and without that animation inside
 * the brand panel and outside it, to find out what the animation needs
 * in order to hide the text.
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
  const channels = colorType === 6 ? 4 : 3;
  const bpp = channels;
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
  await sleep(2500);

  // Four probes: inside the panel with and without the animation, and
  // outside the panel (in the body) with and without it.
  await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const panel = h1.closest('div.isolate');
    const contentStack = h1.closest('div.relative.z-10');

    const make = (label, withAnimation, parent) => {
      const el = document.createElement('div');
      el.textContent = label;
      el.style.cssText =
        'position:absolute;top:600px;left:20px;z-index:99999;color:#ffffff;font-size:40px;font-weight:700;background:#111;padding:4px;width:400px';
      if (withAnimation) {
        el.style.animation = 'auth-fade-up 0.6s ease-out 100ms both';
      }
      parent.appendChild(el);
      return el;
    };

    make('A no-anim in body', false, document.body);
    make('B anim in body', true, document.body);
    make('C no-anim in panel', false, panel);
    make('D anim in panel', true, panel);
    make('E no-anim in stack', false, contentStack);
    make('F anim in stack', true, contentStack);
  });

  await sleep(1500);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'logs', 'repro.png'), clip: { x: 0, y: 560, width: 800, height: 300 } });
  console.log('saved logs/repro.png');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});