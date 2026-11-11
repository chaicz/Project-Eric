import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { highlightLanguage, highlight } from '../../src/utils/syntaxHighlight.js';

describe('utils/syntaxHighlight — highlightLanguage', () => {
  it('maps SQL mode to the SQL highlighter', () => {
    assert.equal(highlightLanguage('javascript', 'sql', 'mysql'), 'sql');
  });

  it('maps "other" to the generic highlighter', () => {
    assert.equal(highlightLanguage('other', 'code'), 'generic');
  });

  it('passes a known language through', () => {
    assert.equal(highlightLanguage('python', 'code'), 'python');
  });

  it('falls back to the generic highlighter', () => {
    assert.equal(highlightLanguage('', 'code'), 'generic');
    assert.equal(highlightLanguage(null, 'code'), 'generic');
  });
});

describe('utils/syntaxHighlight — highlight', () => {
  it('returns an empty string for empty code', () => {
    assert.equal(highlight('', 'javascript'), '');
    assert.equal(highlight(null, 'javascript'), '');
    assert.equal(highlight(undefined, 'javascript'), '');
  });

  it('wraps a keyword in a span', () => {
    const html = highlight('const a = 1;', 'javascript');
    assert.ok(html.includes('<span class="text-fuchsia-300 font-semibold">const</span>'));
  });

  it('wraps a string in a span', () => {
    const html = highlight('const a = "hi";', 'javascript');
    assert.ok(html.includes('text-amber-200'));
  });

  it('escapes the HTML in the code', () => {
    const html = highlight('const a = "<script>";', 'javascript');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('escapes an ampersand', () => {
    assert.ok(highlight('a & b', 'javascript').includes('&amp;'));
  });

  it('keeps plain text intact', () => {
    assert.equal(highlight('hello world', 'javascript'), 'hello world');
  });

  it('highlights a SQL keyword', () => {
    const html = highlight('SELECT * FROM users', 'sql');
    assert.ok(html.includes('SELECT'));
    assert.ok(html.includes('text-fuchsia-300 font-semibold'));
  });

  it('highlights a Python keyword', () => {
    const html = highlight('def hello():\n    return 1', 'python');
    assert.ok(html.includes('text-fuchsia-300 font-semibold'));
  });

  it('marks a line comment', () => {
    const html = highlight('// a comment\nconst a = 1;', 'javascript');
    assert.ok(html.includes('text-slate-400 italic'));
  });

  it('marks a block comment', () => {
    const html = highlight('/* a comment */ const a = 1;', 'javascript');
    assert.ok(html.includes('text-slate-400 italic'));
  });

  it('does not lose any of the text', () => {
    const code = 'const a = 1; // note\nfunction f() { return "x"; }';
    const html = highlight(code, 'javascript');
    const text = html.replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.equal(text, code);
  });

  it('handles an unknown language without throwing', () => {
    assert.doesNotThrow(() => highlight('some text', 'brainfuck'));
  });

  it('produces the same output when called twice', () => {
    const code = 'const a = 1;';
    assert.equal(highlight(code, 'javascript'), highlight(code, 'javascript'));
  });
});
