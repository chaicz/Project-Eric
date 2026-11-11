#!/usr/bin/env node
/**
 * Generates the code-server extension's per-language rule packs.
 *
 * Why this exists
 * ---------------
 * The web app ships its OWASP rules as `public/extensions/<id>.lang.json`,
 * in the *web* shape: a map of OWASP category -> { patterns[], remediation }.
 * The VS Code / code-server extension has a different, richer shape
 * (`LanguagePack` in extensions/project-eric-owasp/src/types.ts): every rule
 * carries its own id, name, severity, CWE list, fix and references.
 *
 * `extension.ts` reads the per-language overrides from
 * `data/languages/<id>.lang.json`. That directory was never populated, so
 * every language pack silently failed to load with a
 * "Skipped language pack <id>" line in the output channel and the extension
 * fell back to the stub rules baked into `data/owasp-pack.json` — one or two
 * rules per language instead of the full rule set.
 *
 * This script converts the web packs into the extension shape and writes
 * them into `data/languages/`. It is deterministic: same inputs -> same
 * bytes, so it can run in CI without producing diffs.
 *
 * Usage: node scripts/build-language-packs.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB_EXT = path.join(ROOT, 'public', 'extensions');
const EXT_ROOT = path.join(ROOT, 'extensions', 'project-eric-owasp');
const OUT_DIR = path.join(EXT_ROOT, 'data', 'languages');

// ---------------------------------------------------------------------------
// Category metadata, mirrored from the extension's own owasp-pack.json so
// the generated rules point at the same CWE ids and doc URLs the extension
// already uses.
// ---------------------------------------------------------------------------
function loadCategoryMeta() {
  const pack = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'data', 'owasp-pack.json'), 'utf8'));
  const meta = {};
  for (const [id, cat] of Object.entries(pack.categories)) {
    meta[id] = {
      name: cat.name,
      cwe: cat.cwe || [],
      url: cat.url || `https://owasp.org/Top10/${id}_2021-${slug(cat.name)}/`,
    };
  }
  return meta;
}

function slug(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------------------------------------------------------------------------
// Severity mapping
//
// The web packs score each pattern with a numeric "weight" instead of a
// severity band. Map the weight onto the extension's severity scale so a
// high-confidence injection rule is not reported as a medium.
// ---------------------------------------------------------------------------
function severityForWeight(weight) {
  const w = Number(weight);
  if (!Number.isFinite(w)) return 'medium';
  if (w >= 4) return 'critical';
  if (w === 3) return 'high';
  if (w === 2) return 'medium';
  if (w === 1) return 'low';
  if (w <= -1) return 'info';
  return 'medium';
}

// Injection-flavoured categories always justify a higher floor: a SQL
// injection is critical no matter how the web pack weighted the pattern.
const CATEGORY_FLOOR = {
  A01: 'high',
  A02: 'high',
  A03: 'critical',
  A04: 'medium',
  A05: 'medium',
  A07: 'high',
  A08: 'high',
  A10: 'high',
};

const SEVERITY_ORDER = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function atLeast(severity, floor) {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[floor] ? severity : floor;
}

// ---------------------------------------------------------------------------
// Rule id allocation
//
// The extension requires globally unique rule ids. The web packs key their
// rules by OWASP category only, so the id is derived from the category, the
// language and a per-language ordinal. The ordinal is stable because the
// patterns are emitted in the source order of the web pack.
// ---------------------------------------------------------------------------
function ruleId(langId, category, ordinal) {
  const langPart = langId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${category}-${langPart}-${String(ordinal).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Main conversion
// ---------------------------------------------------------------------------
function convertLanguage(langId, webPack, categoryMeta) {
  const rules = [];
  const owaspRules = webPack.owaspRules || {};

  for (const category of Object.keys(owaspRules).sort()) {
    if (!/^A\d{2}$/.test(category)) continue; // skip "appliesTo" and friends
    const body = owaspRules[category];
    const patterns = Array.isArray(body.patterns) ? body.patterns : [];
    if (!patterns.length) continue;

    const meta = categoryMeta[category] || { name: category, cwe: [], url: '' };
    const floor = CATEGORY_FLOOR[category] || 'low';

    // One extension rule per category, carrying every pattern the web pack
    // declared for it. That keeps the finding count aligned with the web
    // scanner, which also reports per category.
    const extensionPatterns = patterns
      .map((p) => {
        const regex = p.regex;
        if (typeof regex !== 'string' || !regex) return null;
        // The extension always needs 'g'; it adds it itself when missing,
        // but being explicit avoids relying on that.
        const flags = typeof p.flags === 'string' && p.flags ? p.flags : 'g';
        const out = { description: p.label || `${category} pattern`, regex };
        if (!flags.includes('g')) out.flags = flags + 'g';
        else out.flags = flags;
        // A rule that needs to see more than one line (e.g. "unwrap() on a
        // value that came from the request body") carries `multiline`. The
        // extension scanner already runs the regex against the whole file,
        // but the flag is preserved so the web loader and the extension
        // agree on which rules are line-spanning.
        if (p.multiline) out.multiline = true;
        return out;
      })
      .filter(Boolean);

    if (!extensionPatterns.length) continue;

    // Severity is the max over the category's patterns, floored by category.
    const weights = patterns.map((p) => p.weight).filter((w) => Number.isFinite(w));
    const maxWeight = weights.length ? Math.max(...weights) : 1;
    const severity = atLeast(severityForWeight(maxWeight), floor);

    const labels = patterns.map((p) => p.label).filter(Boolean);
    const rule = {
      id: ruleId(langId, category, rules.length + 1),
      name: `${meta.name} — ${labels[0] || category}`,
      summary:
        labels.length > 1
          ? `${labels.length} patterns match ${meta.name.toLowerCase()} in ${webPack.label || langId}.`
          : `${labels[0] || meta.name} detected in ${webPack.label || langId} source.`,
      description:
        body.remediation ||
        `The ${category} detector matched source patterns associated with ${meta.name}.`,
      severity,
      category,
      cwe: meta.cwe.slice(),
      patterns: extensionPatterns,
      fix: {
        title: `Remediate ${meta.name}`,
        hint: body.remediation || `Review the highlighted code for ${meta.name}.`,
        docUrl: meta.url,
      },
      safeToAutoFix: false,
      references: [
        { label: `OWASP ${category}`, url: meta.url },
        ...meta.cwe.slice(0, 3).map((cwe) => ({
          label: cwe,
          url: `https://cwe.mitre.org/data/definitions/${cwe.replace(/^CWE-/, '')}.html`,
        })),
      ],
    };

    rules.push(rule);
  }

  return {
    id: langId,
    label: webPack.label || langId,
    extensions: Array.isArray(webPack.extensions) ? webPack.extensions : [],
    flags: 'g',
    rules,
  };
}

function main() {
  const categoryMeta = loadCategoryMeta();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const webPacks = fs
    .readdirSync(WEB_EXT)
    .filter((f) => f.endsWith('.lang.json'))
    .sort();

  let totalRules = 0;
  const written = [];

  for (const file of webPacks) {
    const webPack = JSON.parse(fs.readFileSync(path.join(WEB_EXT, file), 'utf8'));
    const langId = webPack.id || path.basename(file, '.lang.json');
    const converted = convertLanguage(langId, webPack, categoryMeta);
    if (!converted.rules.length) {
      console.log(`  skip ${langId}: no convertible rules`);
      continue;
    }
    const outFile = path.join(OUT_DIR, `${langId}.lang.json`);
    fs.writeFileSync(outFile, `${JSON.stringify(converted, null, 2)}\n`, 'utf8');
    totalRules += converted.rules.length;
    written.push(langId);
    console.log(`  wrote ${langId}.lang.json  (${converted.rules.length} rules)`);
  }

  console.log(`\n${written.length} language packs written to ${path.relative(ROOT, OUT_DIR)}`);
  console.log(`${totalRules} rules total`);
  return written;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

module.exports = { main, convertLanguage, severityForWeight, ruleId };
