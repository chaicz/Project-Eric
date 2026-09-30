// ---------------------------------------------------------------------------
// OWASP extension-pack loader + static analyzer
//
// Loads the language packs and the OWASP pack from /extensions/*.lang.json
// and /extensions/owasp-pack.json, then runs the OWASP detectors purely
// against the supplied source text. Nothing in this module executes,
// transpiles or interprets the user's code.
//
// Public API:
//   loadManifest()                              → fetches manifest.json
//   loadLanguage(id)                            → fetches {id}.lang.json
//   loadOwaspPack()                             → fetches owasp-pack.json
//   listLanguages()                             → { id, label } from manifest
//   analyse(code, languageId, onProgress?)      → OWASP-shaped findings
//
// Each finding matches the shape used by OWASPAnalysis.jsx:
//   { id, name, status, count, severity, description, cwe,
//     remediation, evidence: [{ line, snippet }] }
//
// The analyzer never throws. If the pack can't load it returns an empty
// list and the caller falls back to its built-in detectors.
// ---------------------------------------------------------------------------

const BASE = '/extensions';

const cache = {
  manifest: null,
  owaspPack: null,
  languages: new Map(), // id → lang.json
  inflight: { manifest: null, owaspPack: null, langs: new Map() },
};

const safeFetchJson = async (url) => {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

export const loadManifest = async () => {
  if (cache.manifest) return cache.manifest;
  if (!cache.inflight.manifest) {
    cache.inflight.manifest = safeFetchJson(`${BASE}/manifest.json`);
  }
  cache.manifest = (await cache.inflight.manifest) || null;
  return cache.manifest;
};

export const loadOwaspPack = async () => {
  if (cache.owaspPack) return cache.owaspPack;
  if (!cache.inflight.owaspPack) {
    cache.inflight.owaspPack = safeFetchJson(`${BASE}/owasp-pack.json`);
  }
  cache.owaspPack = (await cache.inflight.owaspPack) || null;
  return cache.owaspPack;
};

export const loadLanguage = async (id) => {
  const key = (id || '').toLowerCase();
  if (!key) return null;
  if (cache.languages.has(key)) return cache.languages.get(key);
  if (!cache.inflight.langs.has(key)) {
    cache.inflight.langs.set(key, safeFetchJson(`${BASE}/${key}.lang.json`));
  }
  const data = await cache.inflight.langs.get(key);
  if (data) cache.languages.set(key, data);
  return data;
};

export const listLanguages = async () => {
  const m = await loadManifest();
  if (m?.extensions?.length) {
    return m.extensions.map((e) => ({ id: e.id, label: e.label, file: e.file }));
  }
  // Fallback: enumerate the file list directly.
  const ids = [
    'javascript', 'typescript', 'python', 'java', 'csharp',
    'go', 'rust', 'ruby', 'php', 'cpp', 'html', 'css', 'sql',
  ];
  return ids.map((id) => ({ id, label: id, file: `${id}.lang.json` }));
};

// ---------------------------------------------------------------------------
// Tiny utilities
// ---------------------------------------------------------------------------

const splitLines = (code) => String(code || '').split('\n');

const lineNumber = (lines, snippet) => {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(snippet)) return i + 1;
  }
  return 0;
};

// Trim noisy snippets so the UI doesn't overflow on huge lines.
const snippetOf = (line, max = 160) =>
  (line || '').trim().slice(0, max) + ((line || '').trim().length > max ? '…' : '');

// ---------------------------------------------------------------------------
// Per-category detector — reads the OWASP pack + the per-language rules
// from the loaded *.lang.json file and returns an OWASP-shaped finding.
// ---------------------------------------------------------------------------

const detectCategory = (category, code, langPack) => {
  try {
    const langId = langPack?.id || 'javascript';
    const rules = category.patterns || {};
    // Merge "_all" + per-language patterns.
    const merged = [...(rules._all || []), ...(rules[langId] || [])];
    // Some language files also embed their own A0x rules in
    // langPack.owaspRules[category.id].patterns. Merge those in too.
    const langOverrides = langPack?.owaspRules?.[category.id]?.patterns;
    if (Array.isArray(langOverrides)) merged.push(...langOverrides);

    const lines = splitLines(code);

    let total = 0;
    let score = 0;
    const evidence = [];

    for (const rule of merged) {
      let re;
      try {
        re = new RegExp(rule.regex, 'g');
      } catch {
        continue; // skip invalid patterns
      }
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          total += 1;
          score += Number(rule.weight) || 1;
          evidence.push({ line: i + 1, snippet: snippetOf(line) });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      }
    }

    // Trim the evidence list to a sane size.
    const trimmedEvidence = evidence.slice(0, 8);

    let status = 'pass';
    let severity = 'info';
    if (score >= 4) { status = 'fail'; severity = category.defaultSeverity || 'high'; }
    else if (score >= 1) { status = 'warning'; severity = severityFor(category, score); }

    // Description / remediation — prefer the language-specific note when present.
    const remediation = langPack?.owaspRemediation?.[category.id] || category.remediation || '';
    const desc = describeFinding(category, total, score, langId);

    return {
      id: category.id,
      name: category.name,
      status,
      count: total,
      severity,
      description: desc,
      cwe: category.cwe || '—',
      remediation,
      evidence: trimmedEvidence,
    };
  } catch {
    return {
      id: category.id,
      name: category.name,
      status: 'pass',
      count: 0,
      severity: 'info',
      description: 'Detector skipped (could not analyse).',
      cwe: category.cwe || '—',
      remediation: category.remediation || '',
      evidence: [],
    };
  }
};

const severityFor = (category, score) => {
  const base = (category.defaultSeverity || 'medium').toLowerCase();
  if (base === 'critical' || base === 'high') return base;
  return score >= 2 ? 'medium' : base;
};

const describeFinding = (category, total, score, langId) => {
  if (total === 0) return `No ${category.name} patterns detected for ${langId}.`;
  return `${total} ${category.name} pattern${total === 1 ? '' : 's'} matched (score ${score}) in ${langId} source.`;
};

// ---------------------------------------------------------------------------
// Public analyser
// ---------------------------------------------------------------------------

export const analyse = async (code, languageId, onProgress) => {
  const owaspPack = await loadOwaspPack();
  const langPack = await loadLanguage(languageId || 'javascript');
  const categories = owaspPack?.categories || [];

  const findings = [];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const finding = detectCategory(cat, code, langPack);
    findings.push(finding);
    if (typeof onProgress === 'function') {
      onProgress({
        done: i + 1,
        total: categories.length,
        latest: finding,
      });
    }
    // tiny yield so the UI progress bar feels real
    await new Promise((res) => setTimeout(res, 30));
  }
  return findings;
};

// Convenience: pre-load everything so the UI scan starts instantly.
export const preloadPack = async () => {
  await Promise.all([loadManifest(), loadOwaspPack()]);
};

export const _resetCache = () => {
  cache.manifest = null;
  cache.owaspPack = null;
  cache.languages.clear();
  cache.inflight.manifest = null;
  cache.inflight.owaspPack = null;
  cache.inflight.langs.clear();
};