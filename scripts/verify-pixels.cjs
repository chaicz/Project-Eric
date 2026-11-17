#!/usr/bin/env node
/**
 * Reads the real rendered pixels of a piece of text and compares them
 * with the ratio the contrast engine calculated for the same element.
 *
 * The engine works out the background by walking the CSS ancestry. That
 * is fast, but it can be fooled by a translucent surface sitting on top
 * of a background image. This script takes a screenshot and samples the
 * actual pixels behind the text, so the two can be compared.
 *
 *   node scripts/verify-pixels.cjs /onboarding "Enterprise-grade security"
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/onboarding';
const needle = process.argv[3] || '';

// The onboarding route needs a user whose tour is not finished; every
// other route needs one whose tour IS finished, or the router bounces
// the page back to `/onboarding`.
const ONBOARDING = route.includes('onboarding');

const ENGINE = fs.readFileSync(
  path.resolve(__dirname, 'dark-mode-contrast-engine.js'),
  'utf8'
);

const USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: !ONBOARDING,
  avatar: null,
};

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

  await page.evaluateOnNewDocument((user, token) => {
    try {
      localStorage.setItem('token', token);
      localStorage.setItem('project-eric_user', JSON.stringify(user));
      localStorage.setItem('eric_welcome_tour_seen', 'true');
      localStorage.setItem('project-eric_theme', 'dark');
      localStorage.setItem(
        `project-eric_onboarding:${user.id}`,
        JSON.stringify({ step: 1, totalSteps: 5, data: {} })
      );
    } catch {
      /* ignore */
    }
  }, USER, 'mock-token');

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/localhost\/project-eric-api|127\.0\.0\.1:5299/.test(url)) {
      const target = url.replace(
        /https?:\/\/localhost\/project-eric-api/,
        'http://127.0.0.1:5299/project-eric-api'
      );
      if (ONBOARDING && /auth\/validate/i.test(target)) {
        const cors = {
          'access-control-allow-origin': 'http://127.0.0.1:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        };
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: cors, body: '' });
          return;
        }
        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({ user: { ...USER, onboardingComplete: false }, valid: true }),        });
        return;
      }
      req.continue({ url: target });
      return;
    }
    req.continue();
  });

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2000);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  await sleep(600);

  const rows = await page.evaluate(ENGINE + '\n;auditText();');
  const wanted = needle
    ? rows.filter((r) => r.text.toLowerCase().includes(needle.toLowerCase()))
    : rows;

  const shotPath = path.resolve(__dirname, '..', 'logs', 'pixel-verify.png');
  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  await page.screenshot({ path: shotPath, fullPage: true });

  // Read the screenshot back as raw pixels.
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(fs.readFileSync(shotPath));
  const pixelAt = (x, y) => {
    const i = (png.width * y + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };

  console.log(`route=${route}`);
  if (!wanted.length) {
    console.log(`  no element matched "${needle}"`);
    const all = rows.map((r) => `"${r.text.slice(0, 40)}"`).slice(0, 40);
    console.log(`  available texts:\n    ${all.join('\n    ')}`);
  }
  for (const r of wanted) {
    // The coordinates the engine reports are page coordinates, so they
    // line up with a full-page screenshot.
    const x = Math.round(r.x);
    const y = Math.round(r.y);

    // Sample a block that surrounds the text. The glyphs are thin, so
    // the background is the colour that appears most often in the
    // block; the glyphs are the pixels furthest from it.
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

    // The glyphs are the pixels furthest from the surface: the darkest
    // ones for light text, the brightest ones for dark text.
    let darkest = [255, 255, 255];
    let lightest = [0, 0, 0];
    for (const p of block) {
      if (luminance(p) < luminance(darkest)) darkest = p;
      if (luminance(p) > luminance(lightest)) lightest = p;
    }
    const glyph =
      Math.abs(luminance(darkest) - luminance(surface)) >
      Math.abs(luminance(lightest) - luminance(surface))
        ? darkest
        : lightest;

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
