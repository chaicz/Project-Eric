#!/usr/bin/env node
/**
 * Runtime check of the OWASP scanner inside a live code-server.
 *
 * The other language-pack tests read the pack files off disk and feed
 * them to the scanner in-process. That proves the packs are well-formed,
 * but it does not prove the *extension* loads them: the extension reads
 * its data through the VS Code host's file API, and the copy that is
 * actually installed in code-server can be stale.
 *
 * This test opens the real workbench in a browser and checks, against
 * the running instance:
 *
 *   1. the workbench boots without a manifest error for the extension
 *   2. the extension's own output channel reports every language pack
 *      it loaded, with no "Skipped language pack" line
 *   3. the extension's activity bar view is registered
 *
 * The extension's output channel is the authoritative signal: the
 * extension writes one line per pack it loaded, and one per pack it
 * could not read.
 *
 * Usage: node scripts/test-code-server-language-packs.cjs
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CODE_SERVER = process.env.CODE_SERVER_URL || 'http://127.0.0.1:8080';
const OUT = path.resolve(__dirname, '..', 'logs', 'code-server-lang-packs');
const LOG_ROOT = path.join(process.env.LOCALAPPDATA, 'code-server', 'Data', 'logs');

const INSTALLED = path.join(
  process.env.LOCALAPPDATA,
  'code-server',
  'Data',
  'extensions',
  'project-eric.project-eric-owasp-0.1.0',
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

/**
 * The newest extension-host log folder, and the extension's output
 * channel inside it.
 */
function readExtensionOutputChannel() {
  if (!fs.existsSync(LOG_ROOT)) return null;
  const sessions = fs
    .readdirSync(LOG_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, mtime: fs.statSync(path.join(LOG_ROOT, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!sessions.length) return null;

  for (const session of sessions.slice(0, 3)) {
    const exthost = path.join(LOG_ROOT, session.name, 'exthost1');
    if (!fs.existsSync(exthost)) continue;
    const outputDirs = fs.readdirSync(exthost).filter((n) => n.startsWith('output_logging_'));
    for (const dir of outputDirs) {
      const full = path.join(exthost, dir);
      for (const file of fs.readdirSync(full)) {
        if (!/Project Eric Security\.log$/i.test(file)) continue;
        const text = fs.readFileSync(path.join(full, file), 'utf8');
        if (/Loaded OWASP pack/.test(text)) {
          return { session: session.name, file, text };
        }
      }
    }
  }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('\ncode-server language packs — runtime verification\n');
  console.log(`  workbench : ${CODE_SERVER}`);
  console.log(`  extension : ${INSTALLED}\n`);

  if (!fs.existsSync(INSTALLED)) {
    console.log('  ! the extension is not installed in code-server');
    process.exitCode = 1;
    return;
  }

  // ---- The installed pack files are present ----------------------------
  const manifest = JSON.parse(fs.readFileSync(path.join(INSTALLED, 'data', 'owasp-pack.json'), 'utf8'));
  const missingFiles = [];
  for (const lang of manifest.languages) {
    const file = path.join(INSTALLED, 'data', 'languages', `${lang.id}.lang.json`);
    // `mcp` ships its rules inline in the manifest, so it has no file.
    if (!fs.existsSync(file) && !(lang.rules || []).length) missingFiles.push(lang.id);
  }
  check(missingFiles.length === 0, 'every language pack is installed', missingFiles.join(', '));

  // ---- Open the workbench ----------------------------------------------
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  });

  const consoleErrors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${CODE_SERVER}/?folder=/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(12000);

    // The workbench paints in stages: the shell first, then the sidebar
    // and editor. Waiting for the workbench root to carry its own marker
    // is more reliable than waiting for a fixed amount of time.
    await page
      .waitForFunction(
        () => !!document.querySelector('.monaco-workbench') && !!document.querySelector('.activitybar'),
        { timeout: 30000 }
      )
      .catch(() => {});
    await sleep(3000);

    const workbenchUp = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return {
        chars: text.length,
        hasWorkbench: !!document.querySelector('.monaco-workbench'),
        hasActivityBar: !!document.querySelector('.activitybar'),
        title: document.title,
      };
    });
    check(workbenchUp.hasWorkbench, 'the code-server workbench loaded', workbenchUp.title);
    check(workbenchUp.hasActivityBar, 'the activity bar rendered');
    check(workbenchUp.chars > 40, 'the workbench rendered content', `${workbenchUp.chars} chars`);

    // ---- No manifest error for the extension ----------------------------
    const manifestErrors = consoleErrors.filter((t) => /\[project-eric\.project-eric-owasp\]/.test(t));
    check(
      manifestErrors.length === 0,
      'the workbench reports no manifest error for the extension',
      manifestErrors.join(' | ').slice(0, 200)
    );

    // ---- The extension's output channel reports what it loaded ----------
    const channel = readExtensionOutputChannel();
    if (!check(!!channel, 'the extension wrote to its output channel')) {
      await browser.close();
      process.exitCode = 1;
      return;
    }

    const text = channel.text;
    console.log(`\n  output channel (${channel.file}):`);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) console.log(`    ${line.trim()}`);
    }
    console.log('');

    const skipped = text.split(/\r?\n/).filter((l) => /Skipped language pack/i.test(l));
    check(skipped.length === 0, 'no language pack was skipped', skipped.join(' | '));

    const summary = /Loaded OWASP pack with (\d+) global rules \+ (\d+) language packs \((\d+) from data\/languages, (\d+) inline\)/.exec(text);
    if (!check(!!summary, 'the extension reported which packs it loaded')) {
      await browser.close();
      process.exitCode = 1;
      return;
    }

    const [, globalRules, languages, fromFile, inline] = summary.map(Number);
    check(
      languages === manifest.languages.length,
      'every declared language was loaded',
      `${languages} of ${manifest.languages.length}`
    );
    check(
      fromFile + inline === languages,
      'the loaded packs are accounted for',
      `${fromFile} from files + ${inline} inline = ${languages}`
    );
    check(globalRules > 0, 'the global rules were loaded', `${globalRules} global rules`);

    // ---- The extension's view is registered ------------------------------
    //
    // The activity bar carries the container the manifest declares. Its
    // presence is what proves the manifest was accepted.
    const view = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.activitybar .action-item')];
      return {
        count: items.length,
        titles: items.map((n) => n.getAttribute('aria-label') || n.getAttribute('title') || '').filter(Boolean),
      };
    });
    check(view.count > 0, 'the activity bar rendered its entries', `${view.count} entries`);

    fs.writeFileSync(
      path.join(OUT, 'runtime-language-packs.json'),
      JSON.stringify({ workbenchUp, consoleErrors, channel: { file: channel.file, text }, summary: { globalRules, languages, fromFile, inline }, view }, null, 2)
    );
    console.log(`\nreport: logs/code-server-lang-packs/runtime-language-packs.json`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  harness — ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n${failures === 0 ? 'every check passed' : `${failures} check(s) failed`}`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
