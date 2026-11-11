import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  languageLabel,
  detectSqlDialect,
  fileExtension,
  detectFileLanguage,
} from '../../src/utils/fileLanguage.js';

describe('utils/fileLanguage — fileExtension', () => {
  it('returns the lowercased extension', () => {
    assert.equal(fileExtension('orders.PHP'), 'php');
    assert.equal(fileExtension('a/b/c/main.py'), 'py');
  });

  it('returns an empty string when there is no extension', () => {
    assert.equal(fileExtension('Makefile'), '');
    assert.equal(fileExtension(''), '');
  });

  it('returns an empty string for a trailing dot', () => {
    assert.equal(fileExtension('weird.'), '');
  });

  it('treats a dotfile as having no extension', () => {
    // ".gitignore" — the dot is the first character, so there is no
    // extension to report.
    assert.equal(fileExtension('.gitignore'), 'gitignore');
  });

  it('handles null and undefined without throwing', () => {
    assert.equal(fileExtension(null), '');
    assert.equal(fileExtension(undefined), '');
  });
});

describe('utils/fileLanguage — languageLabel', () => {
  it('maps a known id to its label', () => {
    assert.equal(languageLabel('javascript'), 'JavaScript');
    assert.equal(languageLabel('csharp'), 'C#');
    assert.equal(languageLabel('cpp'), 'C / C++');
  });

  it('falls back to "Other" for an unknown id', () => {
    assert.equal(languageLabel('cobol'), 'Other');
    assert.equal(languageLabel(''), 'Other');
    assert.equal(languageLabel(undefined), 'Other');
  });
});

describe('utils/fileLanguage — detectSqlDialect', () => {
  it('detects PostgreSQL', () => {
    assert.equal(detectSqlDialect('SELECT id::text FROM users'), 'postgres');
    assert.equal(detectSqlDialect('DO $$ BEGIN END $$;'), 'postgres');
    assert.equal(detectSqlDialect('DELETE FROM t RETURNING id'), 'postgres');
  });

  it('detects T-SQL', () => {
    assert.equal(detectSqlDialect('SELECT TOP 10 * FROM users'), 'tsql');
    assert.equal(detectSqlDialect('SELECT GETDATE()'), 'tsql');
    assert.equal(detectSqlDialect('SELECT [name] FROM users'), 'tsql');
  });

  it('detects SQLite', () => {
    assert.equal(detectSqlDialect('CREATE TABLE t (id INTEGER PRIMARY KEY)'), 'sqlite');
    assert.equal(detectSqlDialect('CREATE TABLE t (id INTEGER AUTOINCREMENT)'), 'sqlite');
  });

  it('detects Oracle', () => {
    assert.equal(detectSqlDialect('CREATE TABLE t (name VARCHAR2(50))'), 'oracle');
    assert.equal(detectSqlDialect('SELECT 1 FROM DUAL'), 'oracle');
  });

  it('detects MySQL', () => {
    assert.equal(detectSqlDialect('SELECT `col` FROM users'), 'mysql');
    assert.equal(detectSqlDialect('CREATE TABLE t (id INT AUTO_INCREMENT)'), 'mysql');
  });

  it('falls back to generic for plain SQL', () => {
    assert.equal(detectSqlDialect('SELECT * FROM users'), 'generic');
  });

  it('returns generic for empty or whitespace input', () => {
    assert.equal(detectSqlDialect(''), 'generic');
    assert.equal(detectSqlDialect('   \n  '), 'generic');
  });

  it('does not throw on null or undefined', () => {
    assert.equal(detectSqlDialect(null), 'generic');
    assert.equal(detectSqlDialect(undefined), 'generic');
  });
});

describe('utils/fileLanguage — detectFileLanguage', () => {
  it('uses the extension when it is known', () => {
    const r = detectFileLanguage('app.py', 'print(1)');
    assert.equal(r.mode, 'code');
    assert.equal(r.language, 'python');
    assert.equal(r.label, 'Python');
    assert.equal(r.confidence, 'extension');
    assert.equal(r.extension, 'py');
  });

  it('routes .sql files into SQL mode with a dialect', () => {
    const r = detectFileLanguage('schema.sql', 'SELECT `a` FROM `b`');
    assert.equal(r.mode, 'sql');
    assert.equal(r.language, 'sql');
    assert.equal(r.dialect, 'mysql');
    assert.equal(r.label, 'MySQL / MariaDB');
    assert.equal(r.confidence, 'extension');
  });

  it('falls back to content detection for an unknown extension', () => {
    const r = detectFileLanguage('script.unknownext', '<?php echo "hi";');
    assert.equal(r.language, 'php');
    assert.equal(r.confidence, 'content');
  });

  it('detects Python from a def', () => {
    const r = detectFileLanguage('noext', 'def hello():\n    return 1\n');
    assert.equal(r.language, 'python');
  });

  it('detects Go from a package clause', () => {
    const r = detectFileLanguage('noext', 'package main\n\nfunc main() {}\n');
    assert.equal(r.language, 'go');
  });

  it('detects SQL from content when the extension is unhelpful', () => {
    const r = detectFileLanguage('noext', 'SELECT id FROM users');
    assert.equal(r.mode, 'sql');
    assert.equal(r.confidence, 'content');
  });

  it('does not run the content heuristics on a markdown file', () => {
    // "SELECT ... FROM" in prose must not turn a README into SQL.
    const r = detectFileLanguage('README.md', 'SELECT the best option FROM the list');
    assert.equal(r.mode, 'code');
    assert.equal(r.language, 'other');
    assert.equal(r.confidence, 'fallback');
  });

  it('falls back to "other" when nothing is conclusive', () => {
    const r = detectFileLanguage('notes.txt', 'just some words');
    assert.equal(r.language, 'other');
    assert.equal(r.label, 'Other');
    assert.equal(r.dialect, 'generic');
  });

  it('handles a missing file name and missing content', () => {
    const r = detectFileLanguage('', '');
    assert.equal(r.language, 'other');
    assert.equal(r.extension, '');
  });

  it('handles null and undefined arguments without throwing', () => {
    const r = detectFileLanguage(null, null);
    assert.equal(r.language, 'other');
    assert.equal(r.extension, '');
  });

  it('maps .mjs and .php5 onto real languages rather than "other"', () => {
    assert.equal(detectFileLanguage('a.mjs', '').language, 'javascript');
    assert.equal(detectFileLanguage('a.php5', '').language, 'php');
    assert.equal(detectFileLanguage('a.h', '').language, 'cpp');
  });
});
