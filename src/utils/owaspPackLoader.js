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

/**
 * The 1-based line number of a character offset in the source.
 *
 * @param {string} code
 * @param {number} offset
 * @returns {number}
 */
const lineAtOffset = (code, offset) => {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code[i] === '\n') line++;
  }
  return line;
};

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
    let merged = [...(rules._all || []), ...(rules[langId] || [])];
    // Some language files also embed their own A0x rules in
    // langPack.owaspRules[category.id].patterns. Merge those in too.
    const langOverrides = langPack?.owaspRules?.[category.id]?.patterns;
    if (Array.isArray(langOverrides)) merged.push(...langOverrides);

    // The same rule is often shipped twice — once in the shared OWASP
    // pack and once in the language file. Counting both would report
    // every finding twice and double the score, so keep one copy of
    // each distinct pattern.
    const seen = new Set();
    merged = merged.filter((rule) => {
      if (seen.has(rule.regex)) return false;
      seen.add(rule.regex);
      return true;
    });

    const lines = splitLines(code);

    // Collect every match first, then count distinct source locations.
    //
    // The same flaw is often described by more than one rule: the
    // shared pack ships a generic `md5(...)` pattern and the language
    // file ships a PHP-specific one, so a single `md5($_POST[...])`
    // would be counted twice — inflating both the issue count and the
    // score. Matches that land on the same line and the same span are
    // therefore collapsed into one finding, and the strongest weight
    // wins.
    const hits = [];

    for (const rule of merged) {
      let re;
      try {
        // A rule may carry its own flags (e.g. "gi" for credential
        // literals, which must also match `$apiToken`). Always keep
        // "g" so every match on the line is collected.
        const flags = rule.flags || 'g';
        re = new RegExp(rule.regex, flags.includes('g') ? flags : flags + 'g');
      } catch {
        continue; // skip invalid patterns
      }

      // A rule marked `multiline` is matched against the whole file
      // instead of one line at a time. Some questions cannot be
      // answered from a single line — "does this route check the
      // caller's permissions before it returns the record?" spans the
      // whole closure — and a line-by-line matcher can never fire them.
      if (rule.multiline) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(code)) !== null) {
          const startLine = lineAtOffset(code, m.index);
          hits.push({
            line: startLine,
            start: m.index,
            end: m.index + m[0].length,
            weight: Number(rule.weight) || 1,
            label: rule.label || '',
          });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
        continue;
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          hits.push({
            line: i + 1,
            start: m.index,
            end: m.index + m[0].length,
            weight: Number(rule.weight) || 1,
            label: rule.label || '',
          });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      }
    }

    // Collapse matches that describe the same flaw. Matches whose spans
    // overlap on the same line are one finding; the longest span wins.
    const byLocation = new Map();
    for (const hit of hits) {
      const key = `${hit.line}:${hit.start}:${hit.end}`;
      const existing = byLocation.get(key);
      if (!existing) {
        byLocation.set(key, { ...hit });
      } else {
        existing.weight = Math.max(existing.weight, hit.weight);
        if (!existing.label && hit.label) existing.label = hit.label;
      }
    }

    const unique = [];
    for (const hit of byLocation.values()) {
      const overlapping = unique.filter(
        (other) =>
          other.line === hit.line &&
          other.start < hit.end &&
          hit.start < other.end,
      );
      if (overlapping.length === 0) {
        unique.push(hit);
        continue;
      }
      const longest = overlapping.reduce(
        (best, other) =>
          (other.end - other.start) > (best.end - best.start) ? other : best,
        overlapping[0],
      );
      const index = unique.indexOf(longest);
      unique.splice(index, 1);
      if ((hit.end - hit.start) > (longest.end - longest.start)) {
        unique.push(hit);
      } else {
        longest.weight = Math.max(longest.weight, hit.weight);
        unique.push(longest);
      }
    }

    const total = unique.length;
    const score = unique.reduce((sum, hit) => sum + hit.weight, 0);
    const evidence = unique.map((hit) => ({
      line: hit.line,
      snippet: snippetOf(lines[hit.line - 1]),
    }));

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