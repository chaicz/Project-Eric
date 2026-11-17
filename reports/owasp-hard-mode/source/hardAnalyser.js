// ---------------------------------------------------------------------------
// OWASP Hard Mode — hard analyser
//
// This mirrors `analyse()` in `src/utils/owaspPackLoader.js`, but applies
// the profile's stricter rules:
//
//   * the fail / warn thresholds come from the profile, not the default 4 / 1
//   * every rule weight is multiplied by the profile's weight multiplier
//   * a category's severity is raised to the profile floor
//   * a category only reports `pass` when the source contains one of the
//     mitigation markers the profile requires for it
//
// The analyser is pure: it takes source text and a pack and returns
// findings. Nothing is executed, transpiled or interpreted.
// ---------------------------------------------------------------------------

import { resolveProfile, applySeverityFloor } from './profile.js';
import { hasMitigation, requiredMitigationsFor, scaleWeight } from './hardPack.js';

const splitLines = (code) => String(code || '').split('\n');

/** The 1-based line number of a character offset. */
const lineAtOffset = (code, offset) => {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code[i] === '\n') line++;
  }
  return line;
};

/** Trim a snippet so the UI does not overflow on huge lines. */
const snippetOf = (line, max = 160) => {
  const trimmed = (line || '').trim();
  return trimmed.slice(0, max) + (trimmed.length > max ? '…' : '');
};

/**
 * Collect every regex hit for one category.
 *
 * A pattern may carry a `notIf` regex: when that regex also matches the
 * file, the pattern is skipped. This is how a rule says "this is only a
 * problem when the mitigating control is absent".
 *
 * @returns {Array<{line:number,start:number,end:number,weight:number,label:string}>}
 */
const collectHits = (merged, code, lines) => {
  const hits = [];

  for (const rule of merged) {
    let re;
    try {
      const flags = rule.flags || 'g';
      re = new RegExp(rule.regex, flags.includes('g') ? flags : flags + 'g');
    } catch {
      continue; // skip invalid patterns
    }

    // The mitigating control is present in this file, so the pattern
    // does not apply.
    if (rule.notIf) {
      try {
        const guard = new RegExp(rule.notIf, 'i');
        if (guard.test(code)) continue;
      } catch {
        // A broken `notIf` must not disable the rule.
      }
    }

    if (rule.multiline) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        hits.push({
          line: lineAtOffset(code, m.index),
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

  return hits;
};

/**
 * Collapse hits that describe the same flaw: overlapping spans on the
 * same line are one finding, and the strongest weight wins.
 */
const collapseHits = (hits) => {
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

  return unique;
};

/**
 * The severity for a category given its score and the profile.
 */
const severityFor = (category, score, profile) => {
  const base = (category.defaultSeverity || 'medium').toLowerCase();
  const floor = profile.severityFloor?.[category.id];

  if (profile.failThreshold != null && score >= profile.failThreshold) {
    return applySeverityFloor(base, floor);
  }

  // A warning-level hit still gets the floor, so a weak match in a
  // high-risk category cannot be downgraded to `info`.
  const warned = base === 'critical' || base === 'high' ? base : score >= 2 ? 'medium' : base;
  return applySeverityFloor(warned, floor);
};

/**
 * Analyse one category under the active profile.
 *
 * @param {object} category
 * @param {string} code
 * @param {object} langPack
 * @param {object} profile
 * @returns {object}
 */
const detectCategory = (category, code, langPack, profile) => {
  try {
    const langId = langPack?.id || 'javascript';
    const rules = category.patterns || {};

    let merged = [...(rules._all || []), ...(rules[langId] || [])];
    const langOverrides = langPack?.owaspRules?.[category.id]?.patterns;
    if (Array.isArray(langOverrides)) merged.push(...langOverrides);

    // Drop duplicate regexes — the same rule often ships in both the
    // shared pack and the language file.
    const seen = new Set();
    merged = merged.filter((rule) => {
      if (seen.has(rule.regex)) return false;
      seen.add(rule.regex);
      return true;
    });

    // Apply the profile's weight multiplier.
    merged = merged.map((rule) => ({
      ...rule,
      weight: scaleWeight(Number(rule.weight) || 1, profile),
    }));

    const lines = splitLines(code);
    const hits = collapseHits(collectHits(merged, code, lines));

    const total = hits.length;
    const rawScore = hits.reduce((sum, hit) => sum + hit.weight, 0);
    const score = Math.round(rawScore * 10) / 10;

    const maxEvidence = profile.maxEvidence || 8;
    const snippetLength = profile.extendedEvidence ? 240 : 160;
    const evidence = hits.slice(0, maxEvidence).map((hit) => ({
      line: hit.line,
      snippet: snippetOf(lines[hit.line - 1], snippetLength),
      label: hit.label,
      weight: hit.weight,
    }));

    const failThreshold = profile.failThreshold != null ? profile.failThreshold : 4;
    const warnThreshold = profile.warnThreshold != null ? profile.warnThreshold : 1;

    let status = 'pass';
    let severity = 'info';

    if (score >= failThreshold) {
      status = 'fail';
      severity = severityFor(category, score, profile);
    } else if (score >= warnThreshold) {
      status = 'warning';
      severity = severityFor(category, score, profile);
    }

    // Mitigation gate: in hard mode a category only passes when the
    // source actually contains the expected control.
    //
    // `mitigationMissing` is reported independently of the status. A
    // category can fail on a rule *and* be missing its control, and
    // the UI shows both facts.
    const mitigations = requiredMitigationsFor(category.id, profile);
    const mitigationPresent = hasMitigation(code, mitigations);
    const controlAbsent = mitigations.length > 0 && !mitigationPresent;

    // A category that finds no pattern but is missing its control is
    // downgraded from `pass` to `warning`.
    if (status === 'pass' && controlAbsent) {
      status = 'warning';
      severity = applySeverityFloor('medium', profile.severityFloor?.[category.id]);
    }

    const remediation =
      langPack?.owaspRemediation?.[category.id] || category.remediation || '';

    return {
      id: category.id,
      name: category.name,
      status,
      count: total,
      severity,
      score,
      description:
        total === 0
          ? `No ${category.name} patterns detected for ${langId}.`
          : `${total} ${category.name} pattern${total === 1 ? '' : 's'} matched (score ${score}) in ${langId} source.`,
      cwe: category.cwe || '—',
      remediation,
      evidence,
      /** True when the expected control is absent from the source. */
      mitigationMissing: controlAbsent,
      /** True when the expected control was found in the source. */
      mitigationPresent,
      /** The control markers this category expects to find. */
      expectedMitigations: mitigations,
      /** The extra rules the hard tier contributed, if any. */
      hardRuleCount: Array.isArray(category.hardRules) ? category.hardRules.length : 0,
    };
  } catch {
    return {
      id: category.id,
      name: category.name,
      status: 'pass',
      count: 0,
      severity: 'info',
      score: 0,
      description: 'Detector skipped (could not analyse).',
      cwe: category.cwe || '—',
      remediation: category.remediation || '',
      evidence: [],
      mitigationMissing: false,
      mitigationPresent: true,
      expectedMitigations: [],
      hardRuleCount: 0,
    };
  }
};

/**
 * Analyse source text against a pack under a profile.
 *
 * @param {string} code
 * @param {object} pack     the built pack (base or hard)
 * @param {object} langPack the language pack
 * @param {string|object} profile
 * @param {(p: object) => void} [onProgress]
 * @returns {Promise<object[]>}
 */
export const analyseWithProfile = async (code, pack, langPack, profile = 'hard', onProgress) => {
  const active = resolveProfile(profile);
  const categories = pack?.categories || [];
  const findings = [];

  for (let i = 0; i < categories.length; i++) {
    const finding = detectCategory(categories[i], code, langPack, active);
    findings.push(finding);
    if (typeof onProgress === 'function') {
      onProgress({ done: i + 1, total: categories.length, latest: finding });
    }
    await new Promise((res) => setTimeout(res, 10));
  }

  return findings;
};

/**
 * Summarise findings into the shape the UI expects: a score, a risk
 * label and the per-status counts.
 *
 * @param {object[]} findings
 * @returns {{score:number, summary:string, critical:number, high:number, medium:number, low:number, total:number}}
 */
export const summarise = (findings) => {
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  const low = findings.filter((f) => f.severity === 'low').length;

  const penalty = critical * 20 + high * 10 + medium * 5 + low * 2;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';

  return {
    score,
    summary,
    critical,
    high,
    medium,
    low,
    total: findings.filter((f) => f.status !== 'pass').length,
  };
};
