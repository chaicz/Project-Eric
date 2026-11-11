import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadManifest,
  loadOwaspPack,
  loadLanguage,
  listLanguages,
  analyse,
  preloadPack,
  _resetCache,
} from '../../src/utils/owaspPackLoader.js';
import { mockFetch, jsonResponse } from '../helpers/browser-globals.mjs';

/** A tiny OWASP pack with two categories. */
const PACK = {
  categories: [
    {
      id: 'A03',
      name: 'Injection',
      cwe: 'CWE-89',
      defaultSeverity: 'high',
      remediation: 'Bind your parameters.',
      patterns: {
        _all: [{ regex: 'md5\\(', label: 'md5', weight: 3 }],
      },
    },
    {
      id: 'A01',
      name: 'Broken Access Control',
      cwe: 'CWE-285',
      defaultSeverity: 'medium',
      remediation: 'Check the caller.',
      patterns: {
        _all: [{ regex: 'eval\\(', label: 'eval', weight: 2 }],
      },
    },
  ],
};

describe('utils/owaspPackLoader — loading', () => {
  let restoreFetch;

  beforeEach(() => {
    _resetCache();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
    _resetCache();
  });

  it('loads the manifest', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ extensions: [{ id: 'javascript', label: 'JavaScript', file: 'javascript.lang.json' }] }));
    const manifest = await loadManifest();
    assert.equal(manifest.extensions.length, 1);
  });

  it('loads the OWASP pack', async () => {
    restoreFetch = mockFetch(() => jsonResponse(PACK));
    const pack = await loadOwaspPack();
    assert.equal(pack.categories.length, 2);
  });

  it('returns null when the pack cannot be fetched', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await loadOwaspPack(), null);
  });

  it('returns null when the pack answers with an error', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 404 }));
    assert.equal(await loadOwaspPack(), null);
  });

  it('caches the pack so it is fetched only once', async () => {
    let calls = 0;
    restoreFetch = mockFetch(() => { calls += 1; return jsonResponse(PACK); });
    await loadOwaspPack();
    await loadOwaspPack();
    assert.equal(calls, 1);
  });

  it('returns null for a language id that is empty', async () => {
    assert.equal(await loadLanguage(''), null);
    assert.equal(await loadLanguage(null), null);
  });

  it('loads a language pack', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ id: 'python', owaspRules: {} }));
    const lang = await loadLanguage('python');
    assert.equal(lang.id, 'python');
  });

  it('lists the languages from the manifest', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ extensions: [{ id: 'javascript', label: 'JavaScript', file: 'javascript.lang.json' }] }));
    const languages = await listLanguages();
    assert.equal(languages[0].id, 'javascript');
    assert.equal(languages[0].label, 'JavaScript');
  });

  it('falls back to a built-in list when the manifest is missing', async () => {
    restoreFetch = mockFetch(() => undefined);
    const languages = await listLanguages();
    assert.ok(languages.length > 0);
    assert.ok(languages.some((l) => l.id === 'javascript'));
  });

  it('preloads the manifest and the pack', async () => {
    restoreFetch = mockFetch(() => jsonResponse(PACK));
    await preloadPack();
    assert.ok(await loadManifest());
  });
});

describe('utils/owaspPackLoader — analyse', () => {
  let restoreFetch;

  beforeEach(() => {
    _resetCache();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
    _resetCache();
  });

  it('returns one finding per category', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('const a = 1;', 'javascript');
    assert.equal(findings.length, 2);
    assert.equal(findings[0].id, 'A03');
  });

  it('reports a pass when nothing matches', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('const a = 1;', 'javascript');
    assert.equal(findings[0].status, 'pass');
    assert.equal(findings[0].count, 0);
  });

  it('reports a warning for a low-score match', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('md5(x)', 'javascript');
    assert.equal(findings[0].status, 'warning');
    assert.equal(findings[0].count, 1);
    assert.equal(findings[0].evidence.length, 1);
    assert.equal(findings[0].evidence[0].line, 1);
  });

  it('reports a failure for a high-score match', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('md5(a); md5(b);', 'javascript');
    assert.equal(findings[0].status, 'fail');
    assert.equal(findings[0].severity, 'high');
  });

  it('counts a repeated pattern on separate lines', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('md5(a);\nmd5(b);', 'javascript');
    assert.equal(findings[0].count, 2);
  });

  it('counts two separate call sites on one line separately', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('md5(md5(a));', 'javascript');
    // The two `md5(` calls do not overlap, so they are two findings.
    assert.equal(findings[0].count, 2);
  });

  it('collapses two rules that match the same span into one finding', async () => {
    const overlappingPack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: {
            _all: [
              { regex: 'md5\\(', label: 'md5', weight: 3 },
              { regex: 'md5\\([a-z]+\\)', label: 'md5 call', weight: 1 },
            ],
          },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(overlappingPack);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('md5(a)', 'javascript');
    assert.equal(findings[0].count, 1);
  });

  it('reports the line the finding is on', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('const a = 1;\nconst b = 2;\nmd5(a);', 'javascript');
    assert.equal(findings[0].evidence[0].line, 3);
  });

  it('reports progress for every category', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const seen = [];
    await analyse('const a = 1;', 'javascript', (p) => seen.push(p));
    assert.equal(seen.length, 2);
    assert.equal(seen[seen.length - 1].done, 2);
    assert.equal(seen[seen.length - 1].total, 2);
  });

  it('returns an empty list when the pack cannot be loaded', async () => {
    restoreFetch = mockFetch(() => undefined);
    const findings = await analyse('md5(a)', 'javascript');
    assert.deepEqual(findings, []);
  });

  it('skips a rule whose regex is invalid', async () => {
    const brokenPack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: { _all: [{ regex: '([unclosed', label: 'broken' }] },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(brokenPack);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('md5(a)', 'javascript');
    assert.equal(findings[0].status, 'pass');
    assert.equal(findings[0].count, 0);
  });

  it('handles an empty source string', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('', 'javascript');
    assert.equal(findings[0].count, 0);
  });

  it('handles a null source string', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(PACK);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse(null, 'javascript');
    assert.equal(findings.length, 2);
  });

  it('matches a multiline rule against the whole file', async () => {
    const multilinePack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: {
            _all: [{
              regex: "Route::get\\([^)]*\\{id\\}[\\s\\S]*?\\}\\);",
              label: 'route closure',
              multiline: true,
            }],
          },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(multilinePack);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('Route::get(\'/users/{id}\', function () {\n  return 1;\n});', 'javascript');
    assert.equal(findings[0].count, 1);
    assert.equal(findings[0].evidence[0].line, 1);
  });

  it('reports the line a multiline rule starts on', async () => {
    const multilinePack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: {
            _all: [{
              regex: "Route::get\\([^)]*\\{id\\}[\\s\\S]*?\\}\\);",
              label: 'route closure',
              multiline: true,
            }],
          },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(multilinePack);
      return jsonResponse({ id: 'javascript' });
    });
    const code = 'const a = 1;\nconst b = 2;\nRoute::get(\'/users/{id}\', function () {\n  return 1;\n});';
    const findings = await analyse(code, 'javascript');
    assert.equal(findings[0].evidence[0].line, 3);
  });

  it('does not fire a multiline rule that does not match', async () => {
    const multilinePack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: {
            _all: [{
              regex: "Route::get\\([^)]*\\{id\\}[\\s\\S]*?\\}\\);",
              label: 'route closure',
              multiline: true,
            }],
          },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(multilinePack);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('const a = 1;', 'javascript');
    assert.equal(findings[0].count, 0);
    assert.equal(findings[0].status, 'pass');
  });

  it('skips a multiline rule with an invalid regex', async () => {
    const brokenPack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: {
            _all: [{ regex: '([unclosed', label: 'broken', multiline: true }],
          },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(brokenPack);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('const a = 1;', 'javascript');
    assert.equal(findings[0].count, 0);
  });

  it('applies the rule flags when a multiline rule declares its own', async () => {
    const flaggedPack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: {
            _all: [{
              regex: 'SECRET_[A-Z]+',
              label: 'secret',
              flags: 'gi',
              multiline: true,
            }],
          },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(flaggedPack);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('const a = secret_token;', 'javascript');
    assert.equal(findings[0].count, 1);
  });

  it('trims the evidence snippet to a readable length', async () => {
    const longPack = {
      categories: [
        {
          id: 'A03', name: 'Injection', defaultSeverity: 'high',
          patterns: { _all: [{ regex: 'x', label: 'x' }] },
        },
      ],
    };
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('owasp-pack')) return jsonResponse(longPack);
      return jsonResponse({ id: 'javascript' });
    });
    const findings = await analyse('x'.repeat(500), 'javascript');
    assert.ok(findings[0].evidence[0].snippet.length <= 161);
    assert.ok(findings[0].evidence[0].snippet.endsWith('…'));
  });
});
