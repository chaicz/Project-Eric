import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_LANGUAGES,
  SQL_DIALECTS,
  scannerLanguageLabel,
} from '../../src/utils/scannerLanguages.js';

describe('utils/scannerLanguages — the tables', () => {
  it('has no duplicate language ids', () => {
    const ids = CODE_LANGUAGES.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('has no duplicate dialect ids', () => {
    const ids = SQL_DIALECTS.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('gives every language a label and a hint', () => {
    for (const language of CODE_LANGUAGES) {
      assert.ok(language.label, `missing label for ${language.id}`);
      assert.ok(language.hint, `missing hint for ${language.id}`);
      assert.ok(language.ext, `missing extension for ${language.id}`);
    }
  });

  it('gives every dialect a label and a hint', () => {
    for (const dialect of SQL_DIALECTS) {
      assert.ok(dialect.label, `missing label for ${dialect.id}`);
      assert.ok(dialect.hint, `missing hint for ${dialect.id}`);
    }
  });
});

describe('utils/scannerLanguages — scannerLanguageLabel', () => {
  it('labels a code language', () => {
    assert.equal(scannerLanguageLabel('code', 'javascript', null), 'JavaScript');
  });

  it('labels a SQL dialect', () => {
    assert.equal(scannerLanguageLabel('sql', null, 'mysql'), 'MySQL / MariaDB');
  });

  it('falls back to the raw language id when it is unknown', () => {
    assert.equal(scannerLanguageLabel('code', 'cobol', null), 'cobol');
  });

  it('falls back to the raw dialect id when it is unknown', () => {
    assert.equal(scannerLanguageLabel('sql', null, 'db2'), 'db2');
  });

  it('falls back to "Unknown" when there is no language at all', () => {
    assert.equal(scannerLanguageLabel('code', null, null), 'Unknown');
  });

  it('falls back to "SQL" when there is no dialect at all', () => {
    assert.equal(scannerLanguageLabel('sql', null, null), 'SQL');
  });
});
