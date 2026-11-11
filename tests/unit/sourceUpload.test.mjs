import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  readSourceFile,
  readSourceFileFromEvent,
  readSourceText,
  MAX_SOURCE_FILE_BYTES,
  SOURCE_FILE_ACCEPT,
} from '../../src/utils/sourceUpload.js';

/** A minimal stand-in for a browser File. */
const makeFile = (name, content, sizeOverride) => ({
  name,
  size: sizeOverride ?? new Blob([content]).size,
  text: async () => content,
});

describe('utils/sourceUpload — readSourceFile', () => {
  it('reads the content and detects the language from the extension', async () => {
    const r = await readSourceFile(makeFile('app.py', 'def hello():\n    return 1\n'));
    assert.equal(r.ok, true);
    assert.equal(r.code, 'def hello():\n    return 1\n');
    assert.equal(r.fileName, 'app.py');
    assert.equal(r.detection.language, 'python');
    assert.equal(r.detection.mode, 'code');
    assert.equal(r.detection.label, 'Python');
  });

  it('detects the language from the content when the extension is unknown', async () => {
    const r = await readSourceFile(makeFile('script', '<?php echo "hi";'));
    assert.equal(r.ok, true);
    assert.equal(r.detection.language, 'php');
    assert.equal(r.detection.confidence, 'content');
  });

  it('routes a SQL file into SQL mode with a dialect', async () => {
    const r = await readSourceFile(makeFile('schema.sql', 'SELECT `a` FROM `b`'));
    assert.equal(r.detection.mode, 'sql');
    assert.equal(r.detection.dialect, 'mysql');
  });

  it('reports the file size', async () => {
    const content = 'const x = 1;\n';
    const r = await readSourceFile(makeFile('a.js', content));
    assert.equal(r.size, new Blob([content]).size);
  });

  it('refuses a file larger than the limit instead of throwing', async () => {
    const r = await readSourceFile(makeFile('big.js', '', MAX_SOURCE_FILE_BYTES + 1));
    assert.equal(r.ok, false);
    assert.match(r.error, /larger than/i);
    assert.equal(r.code, undefined);
  });

  it('accepts a file exactly at the limit', async () => {
    const content = 'const x = 1;';
    const r = await readSourceFile(makeFile('a.js', content, MAX_SOURCE_FILE_BYTES));
    assert.equal(r.ok, true);
  });

  it('honours a custom size limit', async () => {
    const r = await readSourceFile(makeFile('a.js', 'const x = 1;', 500), { maxBytes: 100 });
    assert.equal(r.ok, false);
    assert.match(r.error, /100 B|0\.1 MB|larger than/i);
  });

  it('reports a read failure instead of throwing', async () => {
    const broken = {
      name: 'a.js',
      size: 10,
      text: async () => { throw new Error('disk gone'); },
    };
    const r = await readSourceFile(broken);
    assert.equal(r.ok, false);
    assert.match(r.error, /disk gone/);
  });

  it('reports a missing file instead of throwing', async () => {
    const r = await readSourceFile(null);
    assert.equal(r.ok, false);
    assert.match(r.error, /no file/i);
  });

  it('accepts a name override for a blob without a name', async () => {
    const blob = { size: 5, text: async () => 'const x = 1;' };
    const r = await readSourceFile(blob, { fileName: 'pasted.js' });
    assert.equal(r.ok, true);
    assert.equal(r.fileName, 'pasted.js');
    assert.equal(r.detection.language, 'javascript');
  });
});

describe('utils/sourceUpload — readSourceFileFromEvent', () => {
  it('reads the first file from the input and resets the input', async () => {
    let resetValue = 'not-reset';
    const input = {
      files: [makeFile('main.py', 'print(1)\n')],
      set value(v) { resetValue = v; },
      get value() { return resetValue; },
    };
    const r = await readSourceFileFromEvent({ target: input });
    assert.equal(r.ok, true);
    assert.equal(r.fileName, 'main.py');
    assert.equal(r.detection.language, 'python');
    assert.equal(resetValue, '');
  });

  it('returns null when no file was picked', async () => {
    const r = await readSourceFileFromEvent({ target: { files: [], value: '' } });
    assert.equal(r, null);
  });

  it('returns null when there is no target at all', async () => {
    const r = await readSourceFileFromEvent({});
    assert.equal(r, null);
  });
});

describe('utils/sourceUpload — readSourceText', () => {
  it('detects the language of pasted text', () => {
    const r = readSourceText('def hello():\n    return 1\n');
    assert.equal(r.ok, true);
    assert.equal(r.detection.language, 'python');
    assert.equal(r.detection.mode, 'code');
  });

  it('falls back to "other" for text that is not code', () => {
    const r = readSourceText('hello there');
    assert.equal(r.detection.language, 'other');
  });

  it('handles null and undefined without throwing', () => {
    assert.equal(readSourceText(null).ok, true);
    assert.equal(readSourceText(undefined).detection.language, 'other');
  });

  it('uses a file name for the extension lookup when one is given', () => {
    const r = readSourceText('anything at all', { fileName: 'a.sql' });
    assert.equal(r.detection.mode, 'sql');
  });
});

describe('utils/sourceUpload — SOURCE_FILE_ACCEPT', () => {
  it('covers the languages the scanner supports', () => {
    for (const ext of ['.js', '.ts', '.py', '.java', '.cs', '.go', '.php', '.rb', '.rs', '.cpp', '.sql']) {
      assert.ok(SOURCE_FILE_ACCEPT.includes(ext), `missing ${ext}`);
    }
  });

  it('also accepts plain text files', () => {
    assert.ok(SOURCE_FILE_ACCEPT.includes('text/*'));
  });
});
