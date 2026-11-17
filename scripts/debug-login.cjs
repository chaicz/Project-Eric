#!/usr/bin/env node
/**
 * Drives the sign-in form the way a person would and reports what
 * happened at each step.
 *
 * The form is a controlled React form, so the value is set through the
 * native setter and an input event is dispatched — otherwise React
 * never sees the change and the field stays empty.
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const requests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('project-eric-api') || url.includes(':5299/')) {
      requests.push(`${req.method()} ${url}`);
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 140));
  });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e.message).slice(0, 140)));

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(2000);

  console.log('route after load:', await page.evaluate(() => location.pathname));

  // What the inputs look like before anything is typed.
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('input')].map((i) => ({
      id: i.id,
      type: i.type,
      value: i.value,
      cls: (typeof i.className === 'string' ? i.className : '').slice(0, 60),
    }))
  );
  console.log('\ninputs before typing:', JSON.stringify(before, null, 1));

  // Fill the way a person would: focus and type.
  await page.click('#email').catch(() => {});
  await sleep(200);
  await page.keyboard.type('developer@gmail.com', { delay: 20 });
  await sleep(300);
  await page.click('#password').catch(() => {});
  await sleep(200);
  await page.keyboard.type('Secret123!', { delay: 20 });
  await sleep(500);

  const after = await page.evaluate(() => ({
    email: document.querySelector('#email')?.value,
    password: document.querySelector('#password')?.value,
    formPresent: !!document.querySelector('form'),
  }));
  console.log('\nafter typing:', JSON.stringify(after));

  // Submit by pressing the button.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.innerText || '').trim() === 'Sign in'
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log('clicked Sign in:', clicked);
  await sleep(3500);

  console.log('route after submit:', await page.evaluate(() => location.pathname));
  console.log('requests:');
  requests.forEach((r) => console.log('  ' + r));

  const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const tail = body.slice(body.indexOf('Sign in to your account'));
  console.log('\nform area text:', tail.slice(0, 400));

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});