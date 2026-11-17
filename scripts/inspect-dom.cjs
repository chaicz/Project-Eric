#!/usr/bin/env node
/**
 * Prints the interactive elements of a route, so the functional checks
 * can address the controls the way the app actually renders them.
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const route = process.argv[2] || '/dashboard';
const signedOut = process.argv.includes('--signed-out');

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
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
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
  }, SEED_USER, 'mock-token', !signedOut);

  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2500);

  const info = await page.evaluate(() => {
    const pick = (el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      text: (el.innerText || el.value || el.getAttribute('placeholder') || '').trim().slice(0, 45),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      aria: el.getAttribute('aria-label') || '',
      title: el.getAttribute('title') || '',
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
      disabled: el.disabled === true,
    });
    return {
      route: location.pathname + location.search,
      theme: document.documentElement.className,
      inputs: [...document.querySelectorAll('input, textarea, select')].map(pick),
      buttons: [...document.querySelectorAll('button')].map(pick).slice(0, 40),
      links: [...document.querySelectorAll('a')].map(pick).slice(0, 30),
      switches: [...document.querySelectorAll('[role="switch"], [role="tab"], [aria-checked]')].map(pick).slice(0, 20),
      headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.innerText.trim()).slice(0, 12),
      bodySample: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
    };
  });

  console.log(`Route: ${info.route}   html class: "${info.theme}"\n`);
  console.log('INPUTS');
  for (const i of info.inputs) console.log(`  ${i.tag}[${i.type}] name=${i.name || '-'} id=${i.id || '-'} ph="${i.text}" aria="${i.aria}"`);
  console.log('\nBUTTONS');
  for (const b of info.buttons) console.log(`  "${b.text}" type=${b.type} aria="${b.aria}" title="${b.title}" disabled=${b.disabled}`);
  console.log('\nLINKS');
  for (const l of info.links) console.log(`  "${l.text}" href=${l.href || '-'} aria="${l.aria}" title="${l.title}"`);
  if (info.switches.length) {
    console.log('\nSWITCHES / TABS');
    for (const s of info.switches) console.log(`  "${s.text}" role/checked aria="${s.aria}"`);
  }
  console.log('\nHEADINGS');
  console.log('  ' + info.headings.join(' | '));
  console.log('\nBODY');
  console.log('  ' + info.bodySample);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});