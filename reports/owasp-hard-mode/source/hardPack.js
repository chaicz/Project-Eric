// ---------------------------------------------------------------------------
// OWASP Hard Mode — pack builder
//
// `buildHardPack(basePack, profile)` returns a *new* pack with the hard
// tier merged in and the profile's thresholds applied. The base pack is
// never mutated, so the standard profile is unaffected.
//
// The merge rules:
//   1. A hard rule's patterns are appended to the matching category's
//      `patterns` map, under a per-language key and `_all`.
//   2. The category's `defaultSeverity` is raised to the profile floor.
//   3. The category gains `hardRules`, an array of the rule metadata the
//      UI shows for the extra findings.
//   4. The pack gains a `hardMode` block describing the active profile.
// ---------------------------------------------------------------------------

import { PROFILES, resolveProfile, applySeverityFloor, SEVERITY_ORDER } from './profile.js';
import { HARD_RULES } from './hardRules.js';

/**
 * Build the pattern list for one hard rule, in the shape the base pack
 * expects: `{ _all: [...], <language>: [...] }`.
 *
 * @param {object} rule
 * @returns {object}
 */
const ruleToPatterns = (rule) => {
  const patterns = rule.patterns || {};
  const out = {};

  for (const [key, list] of Object.entries(patterns)) {
    const converted = list.map((p) => ({
      regex: p.regex,
      weight: p.weight != null ? p.weight : rule.weight,
      label: p.label || rule.label,
      ...(p.flags ? { flags: p.flags } : {}),
      ...(p.multiline ? { multiline: true } : {}),
      ...(p.notIf ? { notIf: p.notIf } : {}),
    }));
    out[key] = key === '_all' ? converted : converted;
  }

  return out;
};

/**
 * Merge the hard tier into a copy of the base pack.
 *
 * @param {object} basePack  the shipped `owasp-pack.json`
 * @param {string|object} profile  profile id or overrides
 * @returns {object}
 */
export const buildHardPack = (basePack, profile = 'hard') => {
  const active = resolveProfile(profile);
  if (!basePack || !Array.isArray(basePack.categories)) {
    throw new Error('buildHardPack: base pack is missing or has no categories');
  }

  // Deep-ish copy: the category objects and their pattern maps are
  // cloned so the original pack stays untouched.
  const categories = basePack.categories.map((cat) => ({
    ...cat,
    patterns: { ...(cat.patterns || {}) },
    hardRules: [],
  }));

  const byId = new Map(categories.map((c) => [c.id, c]));

  for (const rule of HARD_RULES) {
    const cat = byId.get(rule.category);
    if (!cat) continue;

    const patterns = ruleToPatterns(rule);

    for (const [key, list] of Object.entries(patterns)) {
      const existing = cat.patterns[key] || [];
      cat.patterns[key] = [...existing, ...list];
    }

    // The category's own severity floor is raised to the profile floor.
    const floor = active.severityFloor?.[rule.category] || active.severityFloor?.[cat.id];
    if (floor) {
      cat.defaultSeverity = applySeverityFloor(cat.defaultSeverity, floor);
    }

    cat.hardRules.push({
      id: rule.id,
      category: rule.category,
      name: rule.label,
      description: rule.description,
      severity: applySeverityFloor(rule.severity, floor),
      cwe: rule.cwe,
      remediation: rule.remediation,
      weight: rule.weight,
    });
  }

  // Categories with no hard rules still get the profile's severity floor.
  for (const cat of categories) {
    const floor = active.severityFloor?.[cat.id];
    if (floor) {
      cat.defaultSeverity = applySeverityFloor(cat.defaultSeverity, floor);
    }
  }

  return {
    ...basePack,
    id: `${basePack.id}-hard`,
    label: `${basePack.label} — Hard Mode`,
    version: `${basePack.version || '1.0.0'}-hard.1`,
    categories,
    hardMode: {
      profile: active.id,
      label: active.label,
      description: active.description,
      failThreshold: active.failThreshold,
      warnThreshold: active.warnThreshold,
      severityFloor: active.severityFloor,
      requiredMitigations: active.requiredMitigations,
      weightMultiplier: active.weightMultiplier,
      maxEvidence: active.maxEvidence,
      extendedEvidence: active.extendedEvidence,
      addedRules: HARD_RULES.length,
    },
  };
};

/**
 * Apply the profile's weight multiplier to a pattern weight.
 *
 * @param {number} weight
 * @param {object} profile
 * @returns {number}
 */
export const scaleWeight = (weight, profile) => {
  const active = resolveProfile(profile);
  const multiplier = active.weightMultiplier || 1;
  return Number((weight * multiplier).toFixed(2));
};

/**
 * Check whether the source contains one of the mitigation markers a
 * category requires in hard mode.
 *
 * @param {string} code
 * @param {string[]} markers
 * @returns {boolean}
 */
export const hasMitigation = (code, markers) => {
  if (!Array.isArray(markers) || markers.length === 0) return true;
  const text = String(code || '');
  return markers.some((m) => text.includes(m));
};

/**
 * The mitigation markers a category requires, or an empty array.
 *
 * @param {string} categoryId
 * @param {object} profile
 * @returns {string[]}
 */
export const requiredMitigationsFor = (categoryId, profile) => {
  const active = resolveProfile(profile);
  return active.requiredMitigations?.[categoryId] || [];
};

/**
 * The severity ladder, re-exported for callers of this module.
 */
export { SEVERITY_ORDER };

/**
 * The profile catalogue, re-exported for convenience.
 */
export { PROFILES };
