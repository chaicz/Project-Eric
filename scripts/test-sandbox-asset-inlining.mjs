// Regression test for the sandbox preview's local asset inlining.
//
// The preview runs in an iframe loaded through `srcdoc`. A srcdoc iframe
// has no URL, so a relative `src="app.js"` resolves against the page that
// hosts it — the Vite dev server — which answers with the SPA's
// index.html. The browser then parses that HTML as JavaScript and throws
// "Unexpected token '<'".
//
// inlineLocalAssets resolves those references against the project's own
// files before the document reaches the iframe.
import assert from 'node:assert';
import { inlineLocalAssets } from '../src/services/codeRunner.js';

const files = [
  { name: 'index.html', content: '<html><head><link rel="stylesheet" href="styles.css" /></head><body><script src="app.js"></script></body></html>' },
  { name: 'styles.css', content: 'body { color: red; }' },
  { name: 'app.js', content: "console.log('app loaded');" },
];

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

check('the project script is inlined', () => {
  const { html } = inlineLocalAssets(files[0].content, files);
  assert.ok(html.includes("console.log('app loaded');"), 'the script body is missing');
  assert.ok(!/<script[^>]*\bsrc\s*=/i.test(html), 'a src reference survived');
});

check('the project stylesheet is inlined', () => {
  const { html } = inlineLocalAssets(files[0].content, files);
  assert.ok(html.includes('body { color: red; }'), 'the stylesheet body is missing');
  assert.ok(!/<link[^>]*\bhref\s*=/i.test(html), 'an href reference survived');
});

check('the inlined names are reported back', () => {
  const { inlined } = inlineLocalAssets(files[0].content, files);
  assert.deepEqual(inlined.sort(), ['app.js', 'styles.css']);
});

check('a reference with no matching file is dropped, not left to fetch', () => {
  const { html } = inlineLocalAssets('<script src="missing.js"></script>', files);
  assert.ok(!html.includes('missing.js'), 'the dead reference survived');
});

check('an absolute URL is left alone', () => {
  const { html } = inlineLocalAssets('<script src="https://cdn.example.com/x.js"></script>', files);
  assert.ok(html.includes('https://cdn.example.com/x.js'), 'the absolute URL was rewritten');
});

check('a file in a subfolder resolves by its bare name', () => {
  const nested = [
    { name: 'index.html', content: '<script src="app.js"></script>' },
    { name: 'src/app.js', content: 'console.log(1);' },
  ];
  const { html, inlined } = inlineLocalAssets(nested[0].content, nested);
  assert.ok(html.includes('console.log(1);'), 'the nested script was not inlined');
  assert.deepEqual(inlined, ['src/app.js']);
});

check('an external stylesheet link is left alone', () => {
  const { html } = inlineLocalAssets('<link rel="stylesheet" href="https://cdn.example.com/a.css" />', files);
  assert.ok(html.includes('https://cdn.example.com/a.css'), 'the external link was rewritten');
});

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
