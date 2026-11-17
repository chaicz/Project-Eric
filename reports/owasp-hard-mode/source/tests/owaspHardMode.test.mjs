import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILES,
  DEFAULT_PROFILE_ID,
  SEVERITY_ORDER,
  resolveProfile,
  applySeverityFloor,
  listProfiles,
} from '../../src/utils/owaspHardMode/profile.js';
import {
  buildHardPack,
  scaleWeight,
  hasMitigation,
  requiredMitigationsFor,
} from '../../src/utils/owaspHardMode/hardPack.js';
import { HARD_RULES, hardRulesByCategory, HARD_CATEGORIES } from '../../src/utils/owaspHardMode/hardRules.js';
import { analyseWithProfile, summarise } from '../../src/utils/owaspHardMode/hardAnalyser.js';

const BASE_PACK = {
  id: 'owasp-top-10-2026',
  label: 'OWASP Top 10 (2026)',
  version: '1.1.0',
  categories: [
    {
      id: 'A01',
      name: 'Broken Access Control',
      cwe: 'CWE-639',
      defaultSeverity: 'high',
      remediation: 'Check ownership.',
      patterns: { _all: [{ regex: 'req\\.params\\.id', label: 'reads id', weight: 1 }] },
    },
    {
      id: 'A03',
      name: 'Injection',
      cwe: 'CWE-89',
      defaultSeverity: 'critical',
      remediation: 'Bind your parameters.',
      patterns: { _all: [{ regex: 'eval\\(', label: 'eval', weight: 2 }] },
    },
    {
      id: 'A09',
      name: 'Logging Failures',
      cwe: 'CWE-778',
      defaultSeverity: 'medium',
      remediation: 'Add structured logging.',
      patterns: { _all: [{ regex: 'console\\.log', label: 'console.log', weight: 1 }] },
    },
  ],
};

const LANG_PACK = { id: 'javascript', owaspRules: {}, owaspRemediation: {} };

// ---------------------------------------------------------------------------

describe('utils/owaspHardMode/profile — catalogue', () => {
  it('exposes a standard and a hard profile', () => {
    assert.ok(PROFILES.standard);
    assert.ok(PROFILES.hard);
    assert.equal(PROFILES.standard.id, 'standard');
    assert.equal(PROFILES.hard.id, 'hard');
  });

  it('defaults to the standard profile', () => {
    assert.equal(DEFAULT_PROFILE_ID, 'standard');
    assert.equal(resolveProfile(null).id, 'standard');
    assert.equal(resolveProfile(undefined).id, 'standard');
    assert.equal(resolveProfile('nope').id, 'standard');
  });

  it('resolves a profile by id', () => {
    assert.equal(resolveProfile('hard').id, 'hard');
  });

  it('merges a partial override onto the standard profile', () => {
    const merged = resolveProfile({ failThreshold: 2 });
    assert.equal(merged.failThreshold, 2);
    assert.equal(merged.id, 'standard');
    assert.equal(merged.maxEvidence, PROFILES.standard.maxEvidence);
  });

  it('lists the profiles for a picker', () => {
    const list = listProfiles();
    assert.equal(list.length, 2);
    assert.ok(list.every((p) => p.id && p.label && p.description));
  });
});

describe('utils/owaspHardMode/profile — severity floors', () => {
  it('raises a severity to the floor', () => {
    assert.equal(applySeverityFloor('info', 'high'), 'high');
    assert.equal(applySeverityFloor('low', 'critical'), 'critical');
  });

  it('never lowers a severity', () => {
    assert.equal(applySeverityFloor('critical', 'medium'), 'critical');
    assert.equal(applySeverityFloor('high', 'high'), 'high');
  });

  it('leaves the severity alone when there is no floor', () => {
    assert.equal(applySeverityFloor('low', undefined), 'low');
    assert.equal(applySeverityFloor('low', ''), 'low');
  });

  it('falls back to the floor for an unknown severity', () => {
    assert.equal(applySeverityFloor('bogus', 'high'), 'high');
  });

  it('ignores an unknown floor', () => {
    assert.equal(applySeverityFloor('low', 'bogus'), 'low');
  });

  it('orders the severity ladder from least to most severe', () => {
    assert.equal(SEVERITY_ORDER[0], 'info');
    assert.equal(SEVERITY_ORDER[SEVERITY_ORDER.length - 1], 'critical');
  });
});

// ---------------------------------------------------------------------------

describe('utils/owaspHardMode/hardRules — rule set', () => {
  it('ships a non-empty hard tier', () => {
    assert.ok(HARD_RULES.length >= 18, `only ${HARD_RULES.length} rules`);
  });

  it('gives every rule a unique id', () => {
    const ids = HARD_RULES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('gives every rule a known category', () => {
    for (const rule of HARD_RULES) {
      assert.match(rule.category, /^A(0[1-9]|10)$/, `${rule.id} has category ${rule.category}`);
    }
  });

  it('gives every rule a known severity', () => {
    for (const rule of HARD_RULES) {
      assert.ok(SEVERITY_ORDER.includes(rule.severity), `${rule.id} severity ${rule.severity}`);
    }
  });

  it('gives every rule at least one pattern', () => {
    for (const rule of HARD_RULES) {
      const total = Object.values(rule.patterns || {}).reduce((n, l) => n + l.length, 0);
      assert.ok(total > 0, `${rule.id} has no patterns`);
    }
  });

  it('compiles every pattern as a JavaScript RegExp', () => {
    for (const rule of HARD_RULES) {
      for (const list of Object.values(rule.patterns || {})) {
        for (const p of list) {
          assert.doesNotThrow(
            () => new RegExp(p.regex, p.flags || 'g'),
            `${rule.id}: ${p.regex}`,
          );
        }
      }
    }
  });

  it('compiles every notIf guard as a JavaScript RegExp', () => {
    for (const rule of HARD_RULES) {
      for (const list of Object.values(rule.patterns || {})) {
        for (const p of list) {
          if (!p.notIf) continue;
          assert.doesNotThrow(() => new RegExp(p.notIf, 'i'), `${rule.id}: ${p.notIf}`);
        }
      }
    }
  });

  it('gives every rule a cwe and a remediation', () => {
    for (const rule of HARD_RULES) {
      assert.ok(rule.cwe, `${rule.id} has no cwe`);
      assert.ok(rule.remediation, `${rule.id} has no remediation`);
    }
  });

  it('groups the rules by category', () => {
    const grouped = hardRulesByCategory();
    const total = Object.values(grouped).reduce((n, l) => n + l.length, 0);
    assert.equal(total, HARD_RULES.length);
  });

  it('covers at least eight categories', () => {
    assert.ok(HARD_CATEGORIES.length >= 8, `only ${HARD_CATEGORIES.length}`);
  });
});

// ---------------------------------------------------------------------------

describe('utils/owaspHardMode/hardPack — pack construction', () => {
  it('keeps every category from the base pack', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    assert.equal(pack.categories.length, BASE_PACK.categories.length);
    assert.deepEqual(
      pack.categories.map((c) => c.id),
      BASE_PACK.categories.map((c) => c.id),
    );
  });

  it('does not mutate the base pack', () => {
    const before = JSON.stringify(BASE_PACK);
    buildHardPack(BASE_PACK, 'hard');
    assert.equal(JSON.stringify(BASE_PACK), before);
  });

  it('gives the hard pack its own id and version', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    assert.notEqual(pack.id, BASE_PACK.id);
    assert.match(pack.version, /hard/);
  });

  it('records the active profile on the pack', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    assert.equal(pack.hardMode.profile, 'hard');
    assert.equal(pack.hardMode.failThreshold, 3);
    assert.ok(pack.hardMode.addedRules > 0);
  });

  it('adds the hard rules to the matching categories', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const a03 = pack.categories.find((c) => c.id === 'A03');
    assert.ok(a03.hardRules.length > 0);
    assert.ok(a03.hardRules.every((r) => r.category === 'A03'));
  });

  it('raises a category to its severity floor', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const a01 = pack.categories.find((c) => c.id === 'A01');
    assert.equal(a01.defaultSeverity, 'high');
  });

  it('never lowers a category severity', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const a03 = pack.categories.find((c) => c.id === 'A03');
    assert.equal(a03.defaultSeverity, 'critical');
  });

  it('appends the hard patterns to the category pattern map', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const a03 = pack.categories.find((c) => c.id === 'A03');
    const baseCount = BASE_PACK.categories.find((c) => c.id === 'A03').patterns._all.length;
    assert.ok(a03.patterns._all.length > baseCount);
  });

  it('preserves the notIf guard on the merged patterns', () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const guarded = pack.categories.flatMap((c) =>
      Object.values(c.patterns || {}).flat().filter((p) => p.notIf),
    );
    assert.ok(guarded.length > 0, 'no guarded patterns survived the merge');
  });

  it('throws when the base pack is unusable', () => {
    assert.throws(() => buildHardPack(null, 'hard'));
    assert.throws(() => buildHardPack({}, 'hard'));
    assert.throws(() => buildHardPack({ categories: 'nope' }, 'hard'));
  });
});

describe('utils/owaspHardMode/hardPack — helpers', () => {
  it('scales a weight by the profile multiplier', () => {
    assert.equal(scaleWeight(2, 'standard'), 2);
    assert.equal(scaleWeight(2, 'hard'), 2.7);
  });

  it('finds a mitigation marker in the source', () => {
    assert.equal(hasMitigation('const x = bcrypt.hashpw(p)', ['bcrypt']), true);
    assert.equal(hasMitigation('const x = 1', ['bcrypt']), false);
  });

  it('treats an empty marker list as satisfied', () => {
    assert.equal(hasMitigation('anything', []), true);
    assert.equal(hasMitigation('anything', undefined), true);
  });

  it('returns the required markers for a category', () => {
    assert.ok(requiredMitigationsFor('A01', 'hard').includes('authorize'));
    assert.deepEqual(requiredMitigationsFor('A06', 'hard'), []);
    assert.deepEqual(requiredMitigationsFor('A01', 'standard'), []);
  });
});

// ---------------------------------------------------------------------------

describe('utils/owaspHardMode/hardAnalyser — detection', () => {
  it('reports a category that fails', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const findings = await analyseWithProfile('eval(payload);', pack, LANG_PACK, 'hard');
    const a03 = findings.find((f) => f.id === 'A03');
    assert.equal(a03.status, 'fail');
    assert.ok(a03.count > 0);
  });

  it('reports a category that passes', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    // A03 requires a parameterisation marker; the source has one and
    // no vulnerable pattern, so the category passes outright.
    const findings = await analyseWithProfile(
      'const stmt = db.prepare("SELECT * FROM t WHERE id = ?");',
      pack,
      LANG_PACK,
      'hard',
    );
    const a03 = findings.find((f) => f.id === 'A03');
    assert.equal(a03.status, 'pass');
    assert.equal(a03.count, 0);
  });

  it('downgrades a clean category whose mandatory control is missing', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    // A09 requires a structured logger. "const x = 1;" has no logger,
    // so the category is reported as a warning rather than a pass.
    const findings = await analyseWithProfile('const x = 1;', pack, LANG_PACK, 'hard');
    const a09 = findings.find((f) => f.id === 'A09');
    assert.equal(a09.status, 'warning');
    assert.equal(a09.count, 0);
  });

  it('never returns fewer categories than the pack declares', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const findings = await analyseWithProfile('', pack, LANG_PACK, 'hard');
    assert.equal(findings.length, BASE_PACK.categories.length);
  });

  it('applies the profile fail threshold', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    // A09's base pattern has weight 1, below the hard threshold of 3.
    const findings = await analyseWithProfile('console.log("x");', pack, LANG_PACK, 'hard');
    const a09 = findings.find((f) => f.id === 'A09');
    assert.notEqual(a09.status, 'fail');
  });

  it('raises a finding to the category severity floor', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const findings = await analyseWithProfile('console.log("x");', pack, LANG_PACK, 'hard');
    const a09 = findings.find((f) => f.id === 'A09');
    const order = SEVERITY_ORDER;
    assert.ok(order.indexOf(a09.severity) >= order.indexOf('medium'));
  });

  it('reports a missing mitigation control', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const findings = await analyseWithProfile('const x = 1;', pack, LANG_PACK, 'hard');
    const a09 = findings.find((f) => f.id === 'A09');
    assert.equal(a09.mitigationMissing, true);
    assert.equal(a09.mitigationPresent, false);
  });

  it('reports a present mitigation control', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const findings = await analyseWithProfile(
      'logger.info("hello");',
      pack,
      LANG_PACK,
      'hard',
    );
    const a09 = findings.find((f) => f.id === 'A09');
    assert.equal(a09.mitigationMissing, false);
    assert.equal(a09.mitigationPresent, true);
  });

  it('skips a pattern when its notIf guard is present', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const a10 = pack.categories.find((c) => c.id === 'A10');
    // A10 is not in the base pack, so build a pack that has it.
    const withA10 = {
      ...BASE_PACK,
      categories: [
        ...BASE_PACK.categories,
        {
          id: 'A10',
          name: 'SSRF',
          cwe: 'CWE-918',
          defaultSeverity: 'high',
          remediation: 'Allowlist the host.',
          patterns: {
            _all: [
              {
                regex: 'requests\\.get\\(\\s*url',
                label: 'dynamic URL',
                weight: 5,
                notIf: 'ALLOWED_HOSTS',
              },
            ],
          },
        },
      ],
    };
    const hardPack = buildHardPack(withA10, 'hard');
    const withGuard = await analyseWithProfile(
      'requests.get(url)\nALLOWED_HOSTS = {"a.com"}',
      hardPack,
      { ...LANG_PACK, id: 'python' },
      'hard',
    );
    const withoutGuard = await analyseWithProfile(
      'requests.get(url)',
      hardPack,
      { ...LANG_PACK, id: 'python' },
      'hard',
    );

    const guarded = withGuard.find((f) => f.id === 'A10');
    const unguarded = withoutGuard.find((f) => f.id === 'A10');
    assert.equal(guarded.count, 0);
    assert.ok(unguarded.count > 0);
    assert.ok(a10 || true);
  });

  it('never throws on malformed input', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    const findings = await analyseWithProfile(null, pack, LANG_PACK, 'hard');
    assert.equal(findings.length, BASE_PACK.categories.length);
  });

  it('calls the progress callback for every category', async () => {
    const pack = buildHardPack(BASE_PACK, 'hard');
    let seen = 0;
    await analyseWithProfile('eval(x);', pack, LANG_PACK, 'hard', () => {
      seen++;
    });
    assert.equal(seen, BASE_PACK.categories.length);
  });
});

describe('utils/owaspHardMode/hardAnalyser — summary', () => {
  it('scores a clean file at 100', () => {
    const stats = summarise([
      { severity: 'info', status: 'pass' },
      { severity: 'info', status: 'pass' },
    ]);
    assert.equal(stats.score, 100);
    assert.equal(stats.summary, 'Low Risk');
  });

  it('deducts more for critical findings', () => {
    const critical = summarise([{ severity: 'critical', status: 'fail' }]);
    const low = summarise([{ severity: 'low', status: 'warning' }]);
    assert.ok(critical.score < low.score);
  });

  it('clamps the score at zero', () => {
    const findings = Array.from({ length: 20 }, () => ({
      severity: 'critical',
      status: 'fail',
    }));
    assert.equal(summarise(findings).score, 0);
  });

  it('counts the findings by severity', () => {
    const stats = summarise([
      { severity: 'critical', status: 'fail' },
      { severity: 'high', status: 'fail' },
      { severity: 'medium', status: 'warning' },
      { severity: 'low', status: 'warning' },
      { severity: 'info', status: 'pass' },
    ]);
    assert.equal(stats.critical, 1);
    assert.equal(stats.high, 1);
    assert.equal(stats.medium, 1);
    assert.equal(stats.low, 1);
    assert.equal(stats.total, 4);
  });
});
