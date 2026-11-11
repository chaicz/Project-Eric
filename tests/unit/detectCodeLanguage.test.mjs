import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectCodeLanguage } from '../../src/utils/fileLanguage.js';

describe('utils/fileLanguage — detectCodeLanguage', () => {
  it('detects Python from a def', () => {
    const r = detectCodeLanguage('def hello():\n    return 1\n');
    assert.equal(r.mode, 'code');
    assert.equal(r.language, 'python');
    assert.equal(r.label, 'Python');
    assert.equal(r.confidence, 'content');
  });

  it('detects Go from a package clause', () => {
    const r = detectCodeLanguage('package main\n\nfunc main() {}\n');
    assert.equal(r.language, 'go');
  });

  it('detects PHP from the opening tag', () => {
    const r = detectCodeLanguage('<?php echo "hi";');
    assert.equal(r.language, 'php');
  });

  it('detects Java from a package statement', () => {
    const r = detectCodeLanguage('package com.example.app;\n\npublic class User {}\n');
    assert.equal(r.language, 'java');
  });

  it('detects C# from a using directive', () => {
    const r = detectCodeLanguage('using System;\n\npublic class Program {}\n');
    assert.equal(r.language, 'csharp');
  });

  it('detects Rust from a fn with a return type', () => {
    const r = detectCodeLanguage('fn add(a: i32, b: i32) -> i32 { a + b }\n');
    assert.equal(r.language, 'rust');
  });

  it('detects Ruby from a class with an end keyword', () => {
    const r = detectCodeLanguage("class UsersController\n  def show\n  end\nend\n");
    assert.equal(r.language, 'ruby');
  });

  it('detects C / C++ from an include directive', () => {
    const r = detectCodeLanguage('#include <stdio.h>\n\nint main(void) { return 0; }\n');
    assert.equal(r.language, 'cpp');
  });

  it('detects TypeScript from an interface', () => {
    const r = detectCodeLanguage('interface User {\n  id: string;\n}\n');
    assert.equal(r.language, 'typescript');
  });

  it('detects JavaScript from a const assignment', () => {
    const r = detectCodeLanguage('const x = 1;\nconsole.log(x);\n');
    assert.equal(r.language, 'javascript');
  });

  it('detects SQL and picks the dialect from the content', () => {
    const r = detectCodeLanguage('CREATE TABLE t (id INT AUTO_INCREMENT)');
    assert.equal(r.mode, 'sql');
    assert.equal(r.dialect, 'mysql');
    assert.equal(r.label, 'MySQL / MariaDB');
  });

  it('falls back to "other" for text that is not code', () => {
    const r = detectCodeLanguage('just some words in a sentence');
    assert.equal(r.mode, 'code');
    assert.equal(r.language, 'other');
    assert.equal(r.label, 'Other');
    assert.equal(r.confidence, 'fallback');
  });

  it('returns the fallback for empty or whitespace input', () => {
    assert.equal(detectCodeLanguage('').language, 'other');
    assert.equal(detectCodeLanguage('   \n  ').language, 'other');
  });

  it('does not throw on null or undefined', () => {
    assert.equal(detectCodeLanguage(null).language, 'other');
    assert.equal(detectCodeLanguage(undefined).language, 'other');
  });

  it('never returns an extension — there is no file name', () => {
    assert.equal(detectCodeLanguage('const x = 1;').extension, '');
  });

  it('picks the strongest match when several rules hit', () => {
    // The snippet is JavaScript, but it also contains the word "from"
    // near "SELECT" — a naive first-match scan would call it SQL.
    const code = [
      'const query = "SELECT id FROM users WHERE id = " + id;',
      'const rows = db.query(query);',
      'console.log(rows);',
    ].join('\n');
    const r = detectCodeLanguage(code);
    assert.equal(r.mode, 'code');
    assert.equal(r.language, 'javascript');
  });
});
