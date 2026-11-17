#!/usr/bin/env node
/**
 * Checks whether the auth page's brand hero actually paints.
 *
 * The hero is white text on a dark panel. Rather than trusting the
 * screenshot, this script samples the rendered pixels in the hero
 * region and reports how many of them are near-white. A painted hero
 * gives a clear signal; a blank panel gives none.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Decodes a PNG and counts the near-white pixels in it.
 *
 * Puppeteer returns a PNG buffer; the pixels are read straight out of
 * the decoded scanlines so the check does not depend on an image
 * library being installed.
 */
function countNearWhite(input) {
  // Puppeteer hands back a Uint8Array; the PNG reader wants a Buffer.
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  // PNG signature, then the IHDR chunk for the dimensions.
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
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height) return { error: 'no dimensions' };

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bytesPerPixel = channels * (bitDepth / 8);
  const stride = width * bytesPerPixel;

  // Undo the per-scanline PNG filters.
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
      const a = x >= bytesPerPixel ? cur[x - bytesPerPixel] : 0;
      const b = prev[x];
      const c = x >= bytesPerPixel ? prev[x - bytesPerPixel] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = value & 0xff;
    }
  }

  let white = 0;
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * stride + x * bytesPerPixel;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      total += 1;
      if (r > 200 && g > 200 && b > 200) white += 1;
    }
  }
  return { width, height, white, total, percent: (white / total) * 100 };
}

async function measure(page, clip, label) {
  const buffer = await page.screenshot({ clip });
  const result = countNearWhite(buffer);
  console.log(
    `${label.padEnd(24)} near-white pixels: ${String(result.white).padStart(6)} / ${result.total} ` +
      `(${result.percent.toFixed(2)}%)`
  );
  return result;
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

  for (const route of ['/login', '/signup']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(3000);

    const box = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return null;
      const r = h1.getBoundingClientRect();
      return {
        x: Math.max(0, Math.round(r.left)),
        y: Math.max(0, Math.round(r.top)),
        width: Math.min(700, Math.round(r.width)),
        height: Math.round(r.height),
      };
    });
    if (!box) {
      console.log(`${route}: no h1 found`);
      continue;
    }

    console.log(`\n${route}  hero box: ${JSON.stringify(box)}`);
    await measure(page, box, `${route} hero region`);

    // The whole left half, for reference.
    await measure(page, { x: 0, y: 0, width: 800, height: 700 }, `${route} left half`);

    const file = path.resolve(__dirname, '..', 'logs', `paint-${route.replace(/\//g, '-')}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 800, height: 700 } });
    console.log(`saved ${file}`);
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});