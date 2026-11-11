import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildInsights } from '../../src/utils/securityInsights.js';

/** A finding with the fields the insight reasoning reads. */
const finding = (overrides = {}) => ({
  id: 'f1',
  title: 'A finding',
  severity: 'medium',
  category: 'Injection',
  cweId: 'CWE-89',
  projectName: 'demo',
  ...overrides,
});

/** Look an insight up by its key. */
const byKey = (insights, key) => insights.find((i) => i.key === key);

describe('utils/securityInsights — buildInsights', () => {
  it('returns an empty list when there is nothing to say', () => {
    assert.deepEqual(buildInsights([], [], 0), []);
  });

  it('returns an empty list for missing arguments', () => {
    assert.deepEqual(buildInsights(), []);
    assert.deepEqual(buildInsights(null, null, null), []);
  });

  it('ignores non-array inputs instead of throwing', () => {
    assert.deepEqual(buildInsights('nope', 'nope', 0), []);
  });

  describe('the repeated-weakness insight', () => {
    it('reports the CWE that several findings share', () => {
      const insights = buildInsights([
        finding({ cweId: 'CWE-89' }),
        finding({ cweId: 'CWE-89' }),
        finding({ cweId: 'CWE-798' }),
      ]);

      const insight = byKey(insights, 'cwe');
      assert.ok(insight);
      assert.equal(insight.metric, 2);
      assert.equal(insight.title, 'Repeated weakness');
      assert.match(insight.body, /CWE-89/);
    });

    it('falls back to the `cwe` field when `cweId` is absent', () => {
      const insights = buildInsights([
        finding({ cweId: undefined, cwe: 'CWE-79' }),
        finding({ cweId: undefined, cwe: 'CWE-79' }),
      ]);

      assert.equal(byKey(insights, 'cwe')?.metric, 2);
      assert.match(byKey(insights, 'cwe').body, /CWE-79/);
    });

    it('is not raised when every finding has a different CWE', () => {
      const insights = buildInsights([
        finding({ cweId: 'CWE-89' }),
        finding({ cweId: 'CWE-798' }),
      ]);

      assert.equal(byKey(insights, 'cwe'), undefined);
    });

    it('is not raised when the CWE appears only once', () => {
      const insights = buildInsights([finding({ cweId: 'CWE-89' })]);

      assert.equal(byKey(insights, 'cwe'), undefined);
    });

    it('skips findings that carry no CWE at all', () => {
      const insights = buildInsights([
        finding({ cweId: undefined, cwe: undefined }),
        finding({ cweId: undefined, cwe: undefined }),
      ]);

      assert.equal(byKey(insights, 'cwe'), undefined);
    });
  });

  describe('the hot-category insight', () => {
    it('reports the category with the most open findings', () => {
      const insights = buildInsights([
        finding({ category: 'Broken Access Control' }),
        finding({ category: 'Broken Access Control' }),
        finding({ category: 'Injection' }),
      ]);

      const insight = byKey(insights, 'category');
      assert.ok(insight);
      assert.equal(insight.metric, 2);
      assert.equal(insight.title, 'Hot category');
      assert.match(insight.body, /Broken Access Control/);
    });

    it('uses the singular form for a single finding', () => {
      const insights = buildInsights([
        finding({ category: 'Injection' }),
        finding({ category: 'Injection' }),
      ]);

      assert.match(byKey(insights, 'category').body, /2 open findings/);
    });

    it('is not raised when every category is distinct', () => {
      const insights = buildInsights([
        finding({ category: 'Injection' }),
        finding({ category: 'Logging Failures' }),
      ]);

      assert.equal(byKey(insights, 'category'), undefined);
    });
  });

  describe('the critical-exposure insight', () => {
    it('counts the critical findings', () => {
      const insights = buildInsights([
        finding({ severity: 'critical' }),
        finding({ severity: 'critical' }),
        finding({ severity: 'high' }),
      ]);

      const insight = byKey(insights, 'critical');
      assert.ok(insight);
      assert.equal(insight.metric, 2);
      assert.equal(insight.title, 'Critical exposure');
    });

    it('mentions the project spread when the criticals sit in different projects', () => {
      const insights = buildInsights([
        finding({ severity: 'critical', projectName: 'alpha' }),
        finding({ severity: 'critical', projectName: 'beta' }),
      ]);

      assert.match(byKey(insights, 'critical').body, /2 projects/);
    });

    it('uses the singular form for one critical finding', () => {
      const insights = buildInsights([finding({ severity: 'critical' })]);

      assert.match(byKey(insights, 'critical').body, /1 critical finding needs/);
    });

    it('is not raised when nothing is critical', () => {
      const insights = buildInsights([finding({ severity: 'high' })]);

      assert.equal(byKey(insights, 'critical'), undefined);
    });
  });

  describe('the progress insight', () => {
    it('reports the resolved count', () => {
      const insights = buildInsights([finding()], [], 4);

      const insight = byKey(insights, 'resolved');
      assert.ok(insight);
      assert.equal(insight.metric, 4);
      assert.equal(insight.title, 'Progress');
    });

    it('uses the singular form for one resolved finding', () => {
      const insights = buildInsights([finding()], [], 1);

      assert.match(byKey(insights, 'resolved').body, /1 finding has been resolved/);
    });

    it('is not raised when nothing has been resolved', () => {
      const insights = buildInsights([finding()], [], 0);

      assert.equal(byKey(insights, 'resolved'), undefined);
    });
  });

  describe('the live-threat insight', () => {
    it('reports the active threat count', () => {
      const insights = buildInsights([finding()], [{ id: 't1' }, { id: 't2' }], 0);

      const insight = byKey(insights, 'threats');
      assert.ok(insight);
      assert.equal(insight.metric, 2);
      assert.equal(insight.title, 'Live threats');
    });

    it('uses the singular form for one threat', () => {
      const insights = buildInsights([finding()], [{ id: 't1' }], 0);

      assert.match(byKey(insights, 'threats').body, /1 threat is failing/);
    });

    it('is not raised when there are no threats', () => {
      const insights = buildInsights([finding()], [], 0);

      assert.equal(byKey(insights, 'threats'), undefined);
    });
  });

  it('produces the same result for the same findings', () => {
    const findings = [
      finding({ cweId: 'CWE-89', category: 'Injection', severity: 'critical' }),
      finding({ cweId: 'CWE-89', category: 'Injection', severity: 'high' }),
    ];

    assert.deepEqual(buildInsights(findings, [], 0), buildInsights(findings, [], 0));
  });

  it('gives every insight a key, a title, a metric and a body', () => {
    const insights = buildInsights(
      [
        finding({ cweId: 'CWE-89', category: 'Injection', severity: 'critical' }),
        finding({ cweId: 'CWE-89', category: 'Injection', severity: 'critical' }),
      ],
      [{ id: 't1' }],
      3
    );

    assert.ok(insights.length >= 4);
    for (const insight of insights) {
      assert.equal(typeof insight.key, 'string');
      assert.equal(typeof insight.title, 'string');
      assert.equal(typeof insight.metric, 'number');
      assert.equal(typeof insight.body, 'string');
      assert.ok(insight.body.length > 0);
    }
  });
});
