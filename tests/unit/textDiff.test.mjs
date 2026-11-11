import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  diffHunks,
  mapRange,
  applyOpsToString,
  planLocalEdit,
  applyOpsToYText,
} from '../../src/utils/textDiff.js';

describe('utils/textDiff — diffHunks', () => {
  it('returns no hunks for identical texts', () => {
    assert.deepEqual(diffHunks('hello', 'hello'), []);
    assert.deepEqual(diffHunks('', ''), []);
  });

  it('detects a pure insertion', () => {
    const hunks = diffHunks('ac', 'abc');
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0].aStart, hunks[0].aEnd);
    assert.equal(hunks[0].bEnd - hunks[0].bStart, 1);
  });

  it('detects a pure deletion', () => {
    const hunks = diffHunks('abc', 'ac');
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0].bStart, hunks[0].bEnd);
    assert.equal(hunks[0].aEnd - hunks[0].aStart, 1);
  });

  it('detects a replacement as a minimal set of hunks', () => {
    // "world" → "there" shares no common characters beyond the prefix,
    // so the LCS walk splits it into two hunks. What matters is that
    // the hunks reconstruct the target exactly.
    const hunks = diffHunks('hello world', 'hello there');
    assert.ok(hunks.length >= 1);
    assert.equal(hunks[0].aStart, 6);
    assert.equal(hunks[hunks.length - 1].bEnd, 11);
  });

  it('reports a single hunk when the changed words share letters', () => {
    // "world" → "word" only removes the "l", so one hunk covers it.
    const hunks = diffHunks('hello world', 'hello word');
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0].aStart, 9);
    assert.equal(hunks[0].aEnd, 10);
    assert.equal(hunks[0].bStart, 9);
    assert.equal(hunks[0].bEnd, 9);
  });

  it('replaces a single character without losing it', () => {
    // The regression the implementation guards against: turning "1" into
    // "2" must not produce a hunk that deletes the "1" and inserts
    // nothing.
    const hunks = diffHunks('a1b', 'a2b');
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0].aEnd - hunks[0].aStart, 1);
    assert.equal(hunks[0].bEnd - hunks[0].bStart, 1);
  });

  it('groups consecutive differences into one hunk', () => {
    const hunks = diffHunks('abc', 'xyz');
    assert.equal(hunks.length, 1);
  });

  it('finds separate hunks for separate regions', () => {
    const hunks = diffHunks('aXbYc', 'aPbQc');
    assert.equal(hunks.length, 2);
  });

  it('handles a completely empty original', () => {
    const hunks = diffHunks('', 'new');
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0].aStart, 0);
    assert.equal(hunks[0].aEnd, 0);
    assert.equal(hunks[0].bEnd, 3);
  });

  it('handles a completely empty replacement', () => {
    const hunks = diffHunks('old', '');
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0].aEnd, 3);
    assert.equal(hunks[0].bEnd, 0);
  });

  it('falls back to one replace hunk for two unrelated large texts', () => {
    const a = 'a'.repeat(1200);
    const b = 'b'.repeat(1200);
    const hunks = diffHunks(a, b);
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0].aStart, 0);
    assert.equal(hunks[0].aEnd, 1200);
  });

  it('produces hunks that reconstruct the target text', () => {
    const a = 'the quick brown fox';
    const b = 'the slow brown fox jumps';
    const hunks = diffHunks(a, b);
    let out = '';
    let cursor = 0;
    for (const h of hunks) {
      out += a.slice(cursor, h.aStart);
      out += b.slice(h.bStart, h.bEnd);
      cursor = h.aEnd;
    }
    out += a.slice(cursor);
    assert.equal(out, b);
  });
});

describe('utils/textDiff — mapRange', () => {
  it('returns the same range when there are no hunks', () => {
    assert.deepEqual(mapRange([], 3, 8), { start: 3, end: 8 });
  });

  it('shrinks a range that sits after a shortened replacement', () => {
    // "aaaa" → "aXa" removes one character, so a range that sits after
    // the change moves one position to the left.
    const hunks = diffHunks('aaaa', 'aXa');
    const r = mapRange(hunks, 3, 4);
    assert.equal(r.start, 2);
    assert.equal(r.end, 3);
  });

  it('grows a range that sits after a lengthening replacement', () => {
    // "aaaa" → "aXXa" turns two characters into two characters, so the
    // range after it does not move.
    const hunks = diffHunks('aaaa', 'aXXa');
    const r = mapRange(hunks, 3, 4);
    assert.equal(r.start, 3);
    assert.equal(r.end, 4);
  });

  it('moves a range that sits after a longer replacement', () => {
    // "aaaa" → "aXXXa" adds one character before the range, so the
    // range shifts one position to the right.
    const hunks = diffHunks('aaaa', 'aXXXa');
    const r = mapRange(hunks, 4, 5);
    assert.equal(r.start, 5);
    assert.equal(r.end, 6);
  });

  it('leaves a range that sits before the change alone', () => {
    const hunks = diffHunks('aaaa', 'aXa');
    const r = mapRange(hunks, 0, 1);
    assert.equal(r.start, 0);
    assert.equal(r.end, 1);
  });

  it('steps over an insertion that sits exactly at the range start', () => {
    // Text a peer inserted at the very start of the local edit belongs
    // to the peer, so the local edit has to skip it.
    const hunks = diffHunks('ab', 'Xab');
    const r = mapRange(hunks, 0, 2);
    assert.equal(r.start, 1);
    assert.equal(r.end, 3);
  });

  it('grows a range to cover an insertion inside it', () => {
    const hunks = diffHunks('ab', 'aXb');
    const r = mapRange(hunks, 0, 2);
    assert.equal(r.start, 0);
    assert.equal(r.end, 3);
  });

  it('lets the local edit take over an overlapping region', () => {
    const hunks = diffHunks('abcd', 'abXd');
    const r = mapRange(hunks, 2, 4);
    assert.ok(r.start <= 2);
    assert.ok(r.end >= 3);
  });
});

describe('utils/textDiff — applyOpsToString', () => {
  it('applies an insertion', () => {
    assert.equal(
      applyOpsToString('ac', [{ start: 1, deleteCount: 0, text: 'b' }]),
      'abc',
    );
  });

  it('applies a deletion', () => {
    assert.equal(
      applyOpsToString('abc', [{ start: 1, deleteCount: 1, text: '' }]),
      'ac',
    );
  });

  it('applies a replacement', () => {
    assert.equal(
      applyOpsToString('abc', [{ start: 1, deleteCount: 1, text: 'X' }]),
      'aXc',
    );
  });

  it('applies several operations from the back', () => {
    const result = applyOpsToString('abcdef', [
      { start: 0, deleteCount: 1, text: 'A' },
      { start: 2, deleteCount: 1, text: 'C' },
    ]);
    assert.equal(result, 'AbCdef');
  });

  it('returns the text unchanged for an empty operation list', () => {
    assert.equal(applyOpsToString('abc', []), 'abc');
  });
});

describe('utils/textDiff — planLocalEdit', () => {
  it('returns nothing when the document did not change', () => {
    assert.deepEqual(planLocalEdit('abc', 'abc', 'abc'), []);
  });

  it('returns nothing when the shared text already reflects the edit', () => {
    // The shared text was updated first — the edit must be a no-op so
    // the CRDT history does not grow on every keystroke.
    assert.deepEqual(planLocalEdit('abc', 'abc', 'abc'), []);
  });

  it('produces an edit that makes the shared text match the document', () => {
    const yContent = 'hello world';
    const ops = planLocalEdit(yContent, 'hello world', 'hello there');
    assert.ok(ops.length > 0);
    assert.equal(applyOpsToString(yContent, ops), 'hello there');
  });

  it('does not discard a remote change made elsewhere in the file', () => {
    // The peer changed the first line, the local edit changed the last.
    const yContent = 'remote line\nlocal old';
    const ops = planLocalEdit(yContent, 'previous line\nlocal old', 'previous line\nlocal new');
    const result = applyOpsToString(yContent, ops);
    assert.ok(result.includes('remote line'), 'the remote edit was lost');
    assert.ok(result.includes('local new'), 'the local edit was lost');
  });

  it('is a no-op when the shared text already contains the new content', () => {
    const ops = planLocalEdit('hello there', 'hello world', 'hello there');
    assert.deepEqual(ops, []);
  });

  it('handles an insertion at the end', () => {
    const ops = planLocalEdit('abc', 'abc', 'abcd');
    assert.equal(applyOpsToString('abc', ops), 'abcd');
  });

  it('handles a deletion', () => {
    const ops = planLocalEdit('abcd', 'abcd', 'acd');
    assert.equal(applyOpsToString('abcd', ops), 'acd');
  });

  it('handles empty documents', () => {
    const ops = planLocalEdit('', '', 'hello');
    assert.equal(applyOpsToString('', ops), 'hello');
  });
});

describe('utils/textDiff — applyOpsToYText', () => {
  /** A minimal stand-in for `Y.Text`. */
  const makeYText = (initial) => {
    let value = initial;
    const calls = [];
    return {
      get value() { return value; },
      calls,
      insert(index, text) {
        calls.push(['insert', index, text]);
        value = value.slice(0, index) + text + value.slice(index);
      },
      delete(index, length) {
        calls.push(['delete', index, length]);
        value = value.slice(0, index) + value.slice(index + length);
      },
    };
  };

  it('inserts text', () => {
    const y = makeYText('ac');
    applyOpsToYText(y, [{ start: 1, deleteCount: 0, text: 'b' }]);
    assert.equal(y.value, 'abc');
  });

  it('deletes text', () => {
    const y = makeYText('abc');
    applyOpsToYText(y, [{ start: 1, deleteCount: 1, text: '' }]);
    assert.equal(y.value, 'ac');
  });

  it('does not call delete for a zero-length deletion', () => {
    const y = makeYText('abc');
    applyOpsToYText(y, [{ start: 1, deleteCount: 0, text: 'X' }]);
    assert.equal(y.calls.filter((c) => c[0] === 'delete').length, 0);
  });

  it('does not call insert for empty text', () => {
    const y = makeYText('abc');
    applyOpsToYText(y, [{ start: 1, deleteCount: 1, text: '' }]);
    assert.equal(y.calls.filter((c) => c[0] === 'insert').length, 0);
  });

  it('applies operations from the back so the offsets stay valid', () => {
    const y = makeYText('abcdef');
    applyOpsToYText(y, [
      { start: 0, deleteCount: 1, text: 'A' },
      { start: 2, deleteCount: 1, text: 'C' },
    ]);
    assert.equal(y.value, 'AbCdef');
  });
});
