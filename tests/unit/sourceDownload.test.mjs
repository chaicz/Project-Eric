import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFixedFileName,
  languageExtension,
  sourceMimeType,
} from '../../src/utils/sourceDownload.js';

describe('utils/sourceDownload — file names', () => {
  it('keeps the original extension when naming a fixed file', () => {
    assert.equal(buildFixedFileName('orders.php'), 'orders.fixed.php');
    assert.equal(buildFixedFileName('service.ts'), 'service.fixed.ts');
  });

  it('adds a text extension when the original name has none', () => {
    assert.equal(buildFixedFileName('handler'), 'handler.fixed.txt');
    assert.equal(buildFixedFileName(''), 'scanned-file.fixed.txt');
  });

  it('removes path separators from a supplied file name', () => {
    assert.equal(buildFixedFileName('../unsafe/name.js'), '..-unsafe-name.fixed.js');
  });
});

describe('utils/sourceDownload — source metadata', () => {
  it('maps a code language to its file extension', () => {
    assert.equal(languageExtension('javascript'), 'js');
    assert.equal(languageExtension('python'), 'py');
    assert.equal(languageExtension('unknown'), 'txt');
  });

  it('always uses the sql extension in SQL mode', () => {
    assert.equal(languageExtension('javascript', 'sql'), 'sql');
    assert.match(sourceMimeType('postgres', 'sql'), /^application\/sql/);
  });

  it('uses a readable mime type for a known language', () => {
    assert.match(sourceMimeType('python'), /^text\/x-python/);
    assert.match(sourceMimeType('other'), /^text\/plain/);
  });
});
