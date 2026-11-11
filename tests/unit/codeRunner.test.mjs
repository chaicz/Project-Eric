import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LANGUAGES,
  languageFromName,
  TEMPLATES,
  TEST_SAMPLES,
  inlineLocalAssets,
  buildSampleForLanguage,
} from '../../src/services/codeRunner.js';

describe('services/codeRunner — languageFromName', () => {
  it('maps an extension to a language', () => {
    assert.equal(languageFromName('app.js'), 'javascript');
    assert.equal(languageFromName('app.ts'), 'typescript');
    assert.equal(languageFromName('app.py'), 'python');
    assert.equal(languageFromName('app.php'), 'php');
  });

  it('maps the common alternatives', () => {
    assert.equal(languageFromName('a.mjs'), 'javascript');
    assert.equal(languageFromName('a.cjs'), 'javascript');
    assert.equal(languageFromName('a.htm'), 'html');
    assert.equal(languageFromName('a.scss'), 'css');
    assert.equal(languageFromName('a.yml'), 'yaml');
    assert.equal(languageFromName('a.cc'), 'cpp');
    assert.equal(languageFromName('a.h'), 'c');
  });

  it('ignores the case of the extension', () => {
    assert.equal(languageFromName('APP.JS'), 'javascript');
  });

  it('falls back to plain text for an unknown extension', () => {
    assert.equal(languageFromName('a.unknownext'), 'text');
  });

  it('falls back to plain text for a name without an extension', () => {
    assert.equal(languageFromName('Makefile'), 'text');
  });

  it('does not throw for an empty name', () => {
    assert.equal(languageFromName(''), 'text');
  });
});

describe('services/codeRunner — the language table', () => {
  it('gives every language a label and an extension', () => {
    for (const [id, meta] of Object.entries(LANGUAGES)) {
      assert.ok(meta.label, `missing label for ${id}`);
      assert.ok(meta.ext, `missing extension for ${id}`);
      assert.ok(meta.description, `missing description for ${id}`);
    }
  });

  it('marks a language as runnable only when it has a runner', () => {
    for (const [id, meta] of Object.entries(LANGUAGES)) {
      if (meta.canRun) {
        assert.notEqual(meta.runner, 'source', `${id} is marked runnable but only previews`);
      }
    }
  });
});

describe('services/codeRunner — buildSampleForLanguage', () => {
  it('returns a sample for every known language', () => {
    for (const id of Object.keys(LANGUAGES)) {
      const sample = buildSampleForLanguage(id);
      assert.ok(sample.length > 0, `no sample for ${id}`);
    }
  });

  it('prefers a template over the plain sample', () => {
    assert.equal(buildSampleForLanguage('html'), Object.values(TEMPLATES.html)[0]);
  });

  it('returns an empty string for an unknown language', () => {
    assert.equal(buildSampleForLanguage('cobol'), '');
    assert.equal(buildSampleForLanguage(null), '');
  });

  it('has a sample for every language that is not covered by a template', () => {
    for (const [id, meta] of Object.entries(LANGUAGES)) {
      if (!TEMPLATES[id]) {
        assert.ok(TEST_SAMPLES[id], `no sample for ${id}`);
      }
    }
  });
});

describe('services/codeRunner — inlineLocalAssets', () => {
  const files = [
    { name: 'app.js', content: 'console.log("hi");' },
    { name: 'styles.css', content: 'body { color: red; }' },
    { name: 'src/util.js', content: 'export const x = 1;' },
  ];

  it('inlines a local script', () => {
    const result = inlineLocalAssets('<script src="app.js"></script>', files);
    assert.ok(result.html.includes('console.log("hi");'));
    // The `src` attribute is gone, the contents are inline.
    assert.ok(!result.html.includes('src="app.js"'));
    assert.ok(result.html.includes('<script'));
    assert.deepEqual(result.inlined, ['app.js']);
  });

  it('keeps the other attributes of the script tag', () => {
    const result = inlineLocalAssets('<script type="module" src="app.js"></script>', files);
    assert.ok(result.html.includes('type="module"'));
    assert.ok(result.html.includes('console.log("hi");'));
  });

  it('inlines a local stylesheet', () => {
    const result = inlineLocalAssets('<link rel="stylesheet" href="styles.css" />', files);
    assert.ok(result.html.includes('<style>'));
    assert.ok(result.html.includes('color: red'));
    assert.deepEqual(result.inlined, ['styles.css']);
  });

  it('finds a file by its bare name when it lives in a folder', () => {
    const result = inlineLocalAssets('<script src="util.js"></script>', files);
    assert.ok(result.html.includes('export const x = 1;'));
  });

  it('leaves a remote script alone', () => {
    const result = inlineLocalAssets('<script src="https://cdn.example/x.js"></script>', files);
    assert.ok(result.html.includes('https://cdn.example/x.js'));
    assert.deepEqual(result.inlined, []);
  });

  it('drops a local reference that does not resolve', () => {
    const result = inlineLocalAssets('<script src="missing.js"></script>', files);
    assert.ok(!result.html.includes('missing.js'));
    assert.deepEqual(result.inlined, []);
  });

  it('leaves a stylesheet link that is not a stylesheet alone', () => {
    const result = inlineLocalAssets('<link rel="icon" href="styles.css" />', files);
    assert.ok(!result.html.includes('color: red'));
  });

  it('handles an empty document', () => {
    const result = inlineLocalAssets('', files);
    assert.equal(result.html, '');
    assert.deepEqual(result.inlined, []);
  });

  it('handles a null document', () => {
    const result = inlineLocalAssets(null, files);
    assert.equal(result.html, '');
  });

  it('handles a missing file list', () => {
    const result = inlineLocalAssets('<script src="app.js"></script>', null);
    assert.ok(!result.html.includes('app.js'));
  });

  it('skips a file without a name', () => {
    const result = inlineLocalAssets('<script src="app.js"></script>', [
      { content: 'no name' },
      ...files,
    ]);
    assert.ok(result.html.includes('console.log("hi");'));
  });
});
