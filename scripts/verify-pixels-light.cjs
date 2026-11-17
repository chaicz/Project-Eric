#!/usr/bin/env node
/**
 * Screenshots a route and reads the real rendered pixels behind a piece
 * of text, so a contrast verdict can be checked against what the browser
 * actually painted.
 *
 *   node scripts/verify-pixels-light.cjs /login "OWASP & SOC2 ready"
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/login';
const needle = process.argv[3] || '';

const ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-contrast-engine.js'),
  'utf8'
);

const PUBLIC = ['/landing', '/login', '/signup', '/forgot-password',
  '/terms-of-service', '/privacy-policy', '/viewer'];

/** The WCAG relative luminance of one sRGB pixel. */
function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
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

  await page.evaluateOnNewDocument((isPublic) => {
    try {
      localStorage.setItem('project-eric_theme', 'light');
      if (!isPublic) {
        localStorage.setItem('token', 'mock-token');
        localStorage.setItem('project-eric_user', JSON.stringify({
          id: 113, name: 'Developer', email: 'developer@gmail.com',
          role: 'admin', onboardingComplete: true, avatar: null,
        }));
        localStorage.setItem('eric_welcome_tour_seen', 'true');
      }
    } catch {
      /* ignore */
    }
  }, PUBLIC.includes(route));

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2500);
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await sleep(600);

  const rows = await page.evaluate(ENGINE + '\n;auditText();');
  const wanted = needle
    ? rows.filter((r) => r.text.toLowerCase().includes(needle.toLowerCase()))
    : rows;

  const shotPath = path.resolve(__dirname, '..', 'logs', 'pixel-verify-light.png');
  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  await page.screenshot({ path: shotPath, fullPage: true });

  const { PNG } = require('pngjs');
  const png = PNG.sync.read(fs.readFileSync(shotPath));
  const pixelAt = (x, y) => {
    const i = (png.width * y + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };

  console.log(`route=${route} (light)  measurements=${rows.length}`);
  if (!wanted.length) {
    console.log(`  no element matched "${needle}"`);
  }
  for (const r of wanted) {
    // The coordinates the engine reports are page coordinates, so they
    // line up with a full-page screenshot.
    const x = Math.round(r.x);
    const y = Math.round(r.y);

    // Sample a block that surrounds the text. The glyphs are thin, so
    // the background is the colour that appears most often in the
    // block; the glyphs are the darkest pixels in it.
    const block = [];
    for (let dy = -2; dy < 14; dy += 1) {
      for (let dx = -2; dx < 70; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
        block.push(pixelAt(px, py));
      }
    }
    if (!block.length) continue;

    // The background is the most common colour, bucketed so the
    // anti-aliased pixels near the glyphs do not each count once.
    const buckets = new Map();
    for (const p of block) {
      const key = p.map((v) => Math.round(v / 8) * 8).join(',');
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    let surface = null;
    let best = 0;
    for (const [key, count] of buckets) {
      if (count > best) {
        best = count;
        surface = key.split(',').map(Number);
      }
    }

    // The glyphs are the darkest pixels in the block.
    let darkest = [255, 255, 255];
    for (const p of block) {
      if (luminance(p) < luminance(darkest)) darkest = p;
    }

    // For light text on a dark surface the glyphs are the BRIGHTEST
    // pixels, so pick whichever end is farther from the surface.
    const glyph =
      Math.abs(luminance(darkest) - luminance(surface)) >
      Math.abs(luminance([255, 255, 255]) - luminance(surface))
        ? darkest
        : [255, 255, 255];

    const measured = contrast(glyph, surface);
    console.log(
      `  "${r.text.slice(0, 40)}"\n` +
        `      engine: ratio=${r.ratio} color=${r.color} bg=${r.bg}\n` +
        `      pixels: ratio=${measured.toFixed(2)} glyph=[${glyph}] surface=[${surface}]`
    );
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
