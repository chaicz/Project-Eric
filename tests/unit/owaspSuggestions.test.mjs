import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildSuggestion } from '../../src/utils/owaspSuggestions.js';

const CATEGORY_IDS = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'];

describe('utils/owaspSuggestions — buildSuggestion', () => {
  it('returns a suggestion for every OWASP category', () => {
    for (const id of CATEGORY_IDS) {
      const suggestion = buildSuggestion(id);
      assert.ok(suggestion, `no suggestion for ${id}`);
      assert.ok(suggestion.summary, `no summary for ${id}`);
      assert.ok(Array.isArray(suggestion.changes), `no changes for ${id}`);
      assert.ok(suggestion.changes.length > 0, `no changes for ${id}`);
      assert.ok(Array.isArray(suggestion.checklist), `no checklist for ${id}`);
      assert.ok(suggestion.checklist.length > 0, `no checklist for ${id}`);
      assert.ok(Array.isArray(suggestion.refs), `no refs for ${id}`);
      assert.ok(suggestion.refs.length > 0, `no refs for ${id}`);
    }
  });

  it('labels the before and after snippets', () => {
    for (const id of CATEGORY_IDS) {
      const suggestion = buildSuggestion(id);
      assert.ok(suggestion.beforeLabel, `no before label for ${id}`);
      assert.ok(suggestion.afterLabel, `no after label for ${id}`);
    }
  });

  it('uses the language label in the snippet labels', () => {
    const suggestion = buildSuggestion('A01', 'python');
    assert.ok(suggestion.beforeLabel.includes('Flask / Django'));
  });

  it('falls back to a generic label for an unknown language', () => {
    const suggestion = buildSuggestion('A01', 'cobol');
    assert.ok(suggestion.beforeLabel.includes('Node / Express'));
  });

  it('gives a language-specific snippet for a known language', () => {
    const js = buildSuggestion('A03', 'javascript');
    const python = buildSuggestion('A03', 'python');
    assert.notEqual(js.before, python.before);
    assert.ok(python.beforeLabel.includes('Flask / Django'));
  });

  it('uses the SQL sample in SQL mode', () => {
    const sql = buildSuggestion('A03', 'javascript', 'sql');
    assert.ok(sql.beforeLabel.includes('SQL'));
  });

  it('returns the generic advice for an unknown category', () => {
    const suggestion = buildSuggestion('A99');
    assert.ok(suggestion.summary.length > 0);
    assert.equal(suggestion.before, '');
    assert.equal(suggestion.after, '');
    assert.ok(suggestion.changes.length > 0);
  });

  it('does not throw for a missing category', () => {
    assert.doesNotThrow(() => buildSuggestion());
    assert.doesNotThrow(() => buildSuggestion(null));
  });
});
