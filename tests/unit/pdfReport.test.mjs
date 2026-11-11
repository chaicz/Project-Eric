import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toWinAnsi } from '../../src/services/pdfReport.js';

describe('services/pdfReport — toWinAnsi', () => {
  it('returns an empty string for null and undefined', () => {
    assert.equal(toWinAnsi(null), '');
    assert.equal(toWinAnsi(undefined), '');
  });

  it('keeps plain ASCII unchanged', () => {
    assert.equal(toWinAnsi('hello world'), 'hello world');
  });

  it('keeps the characters WinAnsi can draw', () => {
    assert.equal(toWinAnsi('café'), 'café');
    assert.equal(toWinAnsi('“quoted”'), '“quoted”');
    assert.equal(toWinAnsi('a — b'), 'a — b');
    assert.equal(toWinAnsi('• bullet'), '• bullet');
  });

  it('substitutes the arrows', () => {
    assert.equal(toWinAnsi('a → b'), 'a -> b');
    assert.equal(toWinAnsi('a ← b'), 'a <- b');
  });

  it('substitutes the comparison signs', () => {
    assert.equal(toWinAnsi('a ≠ b'), 'a != b');
    assert.equal(toWinAnsi('a ≤ b'), 'a <= b');
    assert.equal(toWinAnsi('a ≥ b'), 'a >= b');
  });

  it('substitutes the tick marks', () => {
    assert.equal(toWinAnsi('✓ done'), 'OK done');
    assert.equal(toWinAnsi('✗ failed'), 'x failed');
  });

  it('replaces a character WinAnsi cannot draw', () => {
    assert.equal(toWinAnsi('日本語'), '???');
    assert.equal(toWinAnsi('emoji 🎉 here'), 'emoji ? here');
  });

  it('drops the zero-width characters', () => {
    assert.equal(toWinAnsi('a\u200Bb'), 'ab');
    assert.equal(toWinAnsi('a\uFEFFb'), 'ab');
  });

  it('keeps the length of the line honest', () => {
    // The placeholder stands in for the character, so the line does not
    // get shorter than it should.
    assert.equal(toWinAnsi('日本').length, 2);
  });

  it('turns a number into a string', () => {
    assert.equal(toWinAnsi(42), '42');
    assert.equal(toWinAnsi(false), 'false');
  });

  it('handles a string that mixes everything', () => {
    const result = toWinAnsi('A → B “C” ✓ 日本語');
    assert.ok(result.includes('->'));
    assert.ok(result.includes('OK'));
    assert.ok(result.includes('???'));
  });
});
