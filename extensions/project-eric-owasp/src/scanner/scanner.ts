/**
 * Core scanning engine.
 *
 * Given a piece of source code and a list of OWASP rules, scanCode()
 * returns every match as a typed `Finding`. The function is pure —
 * no I/O, no VS Code API — so it can run inside a web worker for big
 * files if we ever need to.
 *
 * The algorithm:
 *   1. Merge the global rules with the language-specific rules.
 *   2. For each rule, iterate its patterns and run the regex.
 *   3. For each match, compute line + column + offsets.
 *   4. Wrap the matched line in a small excerpt.
 *   5. Deduplicate by (ruleId, column, matchText) so the same finding
 *      doesn't appear twice if a rule has overlapping patterns.
 */

import type {
  Finding,
  LanguagePack,
  OwaspPack,
  Rule,
  ScanResult,
  Severity,
} from '../types';
import { getPack, mergedRulesFor } from './packLoader';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const MAX_EXCERPT_LINES = 4;

/**
 * Build a 1-based line index for O(log n) line lookup.
 * `text` is the full file content; the result is the cumulative offsets
 * of each line start.
 */
function buildLineIndex(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
  }
  return starts;
}

/** Convert a 0-based offset into {line (0-based), column (0-based)}. */
function lineColumn(lineIndex: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineIndex.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineIndex[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, column: offset - lineIndex[lo] };
}

/** Extract a small excerpt around the matched line(s). */
function excerptAround(text: string, lineStart: number, lineEnd: number): string {
  const lines = text.split('\n');
  const from = Math.max(0, lineStart - 1);
  const to = Math.min(lines.length, lineEnd + 2);
  return lines
    .slice(from, to)
    .map((l, i) => `${String(from + i + 1).padStart(4, ' ')}  ${l}`)
    .join('\n');
}

/** Generate a deterministic finding id from rule + position + snippet. */
function findingId(ruleId: string, uri: string, line: number, col: number, snippet: string): string {
  // Simple FNV-1a-style hash, sufficient for client-side dedup.
  let h = 0x811c9dc5;
  const key = `${ruleId}|${uri}|${line}|${col}|${snippet}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${ruleId}-${(h >>> 0).toString(36)}`;
}

/** Sort findings by severity, then by location. */
function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (s !== 0) return s;
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
}

/**
 * Merge global rules with the rules from a specific language pack, without
 * touching the module-level cache. Used by `scanCode` when the caller
 * supplies the pack inline (e.g. the smoke test).
 */
function mergedRulesFromPack(pack: OwaspPack, languageId: string): Rule[] {
  const lang = pack.languages.find((l) => l.id === languageId);
  const byId = new Map<string, Rule>();
  for (const r of pack.globalRules) byId.set(r.id, r);
  if (lang) {
    for (const r of lang.rules) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface ScanOptions {
  uri: string;
  language: string;
  text: string;
  /**
   * Optional pre-filtered list of rules. If omitted, the scanner uses
   * `mergedRulesFor(language)` from `packLoader`.
   */
  rules?: Rule[];
  /**
   * Optional pre-loaded packs. If omitted, reads from the cached pack
   * loaded at activation.
   */
  pack?: OwaspPack;
  /** Minimum severity to keep — lower-severity findings are filtered out. */
  minSeverity?: Severity;
  /** OWASP categories to skip. */
  skipCategories?: ReadonlyArray<string>;
}

/**
 * Scan one chunk of source code. Returns a sorted `ScanResult`.
 *
 * This is the pure function — no side effects, no I/O, no async. The
 * `extension.ts` glue layer reads the file, calls this, then renders
 * the findings.
 */
export function scanCode(opts: ScanOptions): ScanResult {
  const startedAt = Date.now();
  const { uri, language, text, minSeverity, skipCategories } = opts;

  // Pick rules either from the explicit list, from a pack passed inline,
  // or from the cached pack loaded at activation. Inlining the lookup here
  // (instead of always going through `mergedRulesFor`) means pure callers
  // like the smoke test don't need to touch module-level caches.
  let rules: Rule[];
  if (opts.rules) {
    rules = opts.rules;
  } else if (opts.pack) {
    rules = mergedRulesFromPack(opts.pack, language);
  } else {
    rules = mergedRulesFor(language);
  }

  if (rules.length === 0) {
    return {
      uri,
      language,
      findings: [],
      durationMs: 0,
      lineCount: text.split('\n').length,
      scannedAt: startedAt,
    };
  }

  const minRank = minSeverity ? SEVERITY_RANK[minSeverity] : 0;
  const skipSet = new Set(skipCategories ?? []);

  const lineIndex = buildLineIndex(text);
  const findings: Finding[] = [];
  const dedup = new Set<string>();

  for (const rule of rules) {
    if (skipSet.has(rule.category)) continue;
    if (SEVERITY_RANK[rule.severity] < minRank) continue;
    if (rule.languages && rule.languages.length > 0 && !rule.languages.includes(language)) {
      continue;
    }

    for (const pat of rule.patterns) {
      const flags = pat.flags ?? 'g';
      // Always include 'g' so we get every match; add 'm' for multiline rules.
      const finalFlags = flags.includes('g') ? flags : flags + 'g';
      let re: RegExp;
      try {
        re = new RegExp(pat.regex, finalFlags);
      } catch (err) {
        // Skip malformed rules instead of crashing the whole scan.
        // eslint-disable-next-line no-console
        console.warn(`Project Eric: bad regex on rule ${rule.id}:`, err);
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        if (match[0].length === 0) {
          // Avoid infinite loops on zero-width matches.
          re.lastIndex++;
          continue;
        }

        const startOffset = match.index;
        const endOffset = startOffset + match[0].length;
        const { line, column } = lineColumn(lineIndex, startOffset);

        const endLineCol = lineColumn(lineIndex, Math.max(startOffset, endOffset - 1));
        const matchText = match[0];
        const dedupKey = `${rule.id}|${line}|${column}|${matchText}`;
        if (dedup.has(dedupKey)) continue;
        dedup.add(dedupKey);

        findings.push({
          id: findingId(rule.id, uri, line, column, matchText),
          ruleId: rule.id,
          ruleName: rule.name,
          summary: rule.summary,
          description: rule.description,
          severity: rule.severity,
          category: rule.category,
          cwe: rule.cwe,
          uri,
          language,
          line,
          column,
          startOffset,
          endOffset,
          matchText,
          excerpt: excerptAround(text, line, endLineCol.line),
          fix: rule.fix,
          safeToAutoFix: rule.safeToAutoFix ?? false,
          references: rule.references,
        });

        // Honour the user's regex — if they didn't ask for global, stop.
        if (!finalFlags.includes('g')) break;
      }
    }
  }

  return {
    uri,
    language,
    findings: sortFindings(findings),
    durationMs: Date.now() - startedAt,
    lineCount: text.split('\n').length,
    scannedAt: startedAt,
  };
}

/**
 * Scan multiple files in one pass. Concurrency defaults to 4 so the
 * main thread stays responsive in vscode.dev.
 */
export async function scanFiles(
  files: Array<{ uri: string; language: string; text: string }>,
  options: Omit<ScanOptions, 'uri' | 'language' | 'text'> = {},
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const concurrency = 4;
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (cursor < files.length) {
      const idx = cursor++;
      const f = files[idx];
      const result = scanCode({ ...options, uri: f.uri, language: f.language, text: f.text });
      results[idx] = result;
      done++;
      onProgress?.(done, files.length, f.uri);
      // Yield to the event loop so the UI stays responsive.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return results;
}

/** Combine many `ScanResult`s into a flat list of findings. */
export function flattenFindings(results: ScanResult[]): Finding[] {
  return results.flatMap((r) => r.findings);
}

/** Returns whether the scanner has a pack loaded. */
export function hasPack(): boolean {
  return getPack() !== null;
}

// Re-export for convenience so callers don't need a separate import path.
export { getPack, getLanguagePack, listLanguages } from './packLoader';
export type { LanguagePack, OwaspPack, OwaspCategory, OwaspCategoryMeta } from '../types';