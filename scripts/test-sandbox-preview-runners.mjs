// Regression test for the sandbox preview runners.
//
// Two bugs used to break the preview iframe:
//
// 1. SANDBOX_BRIDGE_ONLY already contains its own <script> tags, but the
//    CSS, JS and Markdown runners wrapped it in another <script>. The
//    browser then parsed the inner "<script>" as JavaScript and threw
//    "Unexpected token '<'".
//
// 2. The preview iframe is loaded through `srcdoc`, so a relative
//    `src="app.js"` resolved against the dev server, which answers with
//    the SPA's index.html. The browser parsed that HTML as JavaScript
//    and threw the same error.
//
// inlineLocalAssets fixes the second one; this file checks both.
import assert from 'node:assert';
import { RUNNERS, SANDBOX_BRIDGE_ONLY } from '../src/services/codeRunner.js';

let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`PASS  ${label}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${label}\n      ${err.message}`);
  }
};

// A document must never contain a <script> inside a <script>.
const nestedScript = /<script\b[^>]*>\s*<script\b/i;

check('the bridge constant carries its own script tags', () => {
  assert.ok(/^\s*<script>/.test(SANDBOX_BRIDGE_ONLY), 'the bridge has no opening <script>');
  assert.ok(/<\/script>\s*$/.test(SANDBOX_BRIDGE_ONLY), 'the bridge has no closing </script>');
});

const runnersToCheck = [
  ['css', { name: 'styles.css', language: 'css', content: 'body { color: red; }' }],
  ['js', { name: 'app.js', language: 'javascript', content: "console.log('hi');" }],
  ['markdown', { name: 'readme.md', language: 'markdown', content: '# Title' }],
  ['html', { name: 'index.html', language: 'html', content: '<!DOCTYPE html><html><head></head><body><h1>hi</h1></body></html>' }],
];

for (const [runner, file] of runnersToCheck) {
  check(`the ${runner} runner does not nest a script tag`, () => {
    const result = RUNNERS[runner]({ file, allFiles: [file], addLog: () => {} });
    assert.ok(result && result.html, `${runner} produced no HTML`);
    assert.ok(!nestedScript.test(result.html),
      `${runner} produced a nested <script>:\n${result.html.slice(0, 600)}`);
  });
}

check('the html runner inlines the project script', () => {
  const files = [
    { name: 'index.html', language: 'html', content: '<html><body><script src="app.js"></script></body></html>' },
    { name: 'app.js', language: 'javascript', content: "console.log('inlined');" },
  ];
  const result = RUNNERS.html({ file: files[0], allFiles: files, addLog: () => {} });
  assert.ok(result.html.includes("console.log('inlined');"), 'the script body is missing');
  assert.ok(!/<script[^>]*\bsrc\s*=/i.test(result.html), 'a src reference survived');
});

check('the html runner does not run an inlined script twice', () => {
  const files = [
    { name: 'index.html', language: 'html', content: '<html><body><script src="app.js"></script></body></html>' },
    { name: 'app.js', language: 'javascript', content: "console.log('once');" },
  ];
  const result = RUNNERS.html({ file: files[0], allFiles: files, addLog: () => {} });
  const occurrences = result.html.split("console.log('once');").length - 1;
  assert.strictEqual(occurrences, 1, `the script appears ${occurrences} time(s)`);
});

check('every runner output parses as valid script content', () => {
  for (const [runner, file] of runnersToCheck) {
    const result = RUNNERS[runner]({ file, allFiles: [file], addLog: () => {} });
    // Pull every inline script body out and hand it to the JS parser.
    const bodies = [...result.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    for (const body of bodies) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(body);
      } catch (err) {
        assert.fail(`${runner} produced invalid JavaScript: ${err.message}`);
      }
    }
  }
});

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
