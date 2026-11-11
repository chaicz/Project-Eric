/**
 * Project Eric — Standalone OWASP Scanner
 *
 * A pure-JS entry point that bundles every dependency (the OWASP pack,
 * the scanner engine, scoring) into a single file that anyone can drop
 * into code-server as a user-script.
 *
 * Three modes of operation, all using the same core engine:
 *
 *   1. Loaded via <script src=".../project-eric-scanner.js"> in the
 *      browser: exposes `window.ProjectEric.scan(code, language)` and
 *      `window.ProjectEric.scanMcp(code, language)` for the DevTools
 *      console / a user-script / a webview.
 *
 *   2. Required as a Node module:
 *        const eric = require('./project-eric-scanner.js');
 *        const result = eric.scan(code, 'javascript');
 *
 *   3. Embedded into the extension via the bundled web version — the
 *      webview panel in `dashboardWebview.ts` loads this exact file
 *      and calls `window.ProjectEric.scan(...)` on the user's code.
 *
 * No `vscode` import. No DOM dependency at the core layer. The only
 * side effect at module load time is reading the bundled `OWASP_PACK`
 * constant and installing `window.ProjectEric` when in a browser.
 */

import * as scanner from '../scanner/scanner';
import * as packLoader from '../scanner/packLoader';
import * as scoreCalc from '../scoring/scoreCalculator';
import type {
  Finding,
  OwaspPack,
  Rule,
  ScanResult,
  Severity,
} from '../types';

// The entire OWASP pack JSON is shipped as a string and parsed lazily
// the first time a scan runs. Inlining it means this file needs no
// network requests, no fetch(), and works in any environment that has
// `JSON.parse` and `RegExp`.
declare const __OWASP_PACK_JSON__: string;
const PACK_JSON: string =
  typeof __OWASP_PACK_JSON__ === 'string' && __OWASP_PACK_JSON__.length > 0
    ? __OWASP_PACK_JSON__
    : '{}';

// ────────────────────────────────────────────────────────────────────────
// Bootstrap — parses + caches the pack exactly once, in any environment.
// ────────────────────────────────────────────────────────────────────────

let initialised = false;
function ensurePack(): OwaspPack | null {
  if (initialised) return packLoader.getPack();
  initialised = true;
  try {
    const pack = packLoader.parsePack(PACK_JSON);
    packLoader.ingestPack(pack);
    return pack;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Project Eric: failed to load bundled OWASP pack:', err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Public surface — pure functions, no I/O.
// ────────────────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Language id (e.g. "javascript", "python", "mcp"). */
  language?: string;
  /** Minimum severity to keep. Defaults to "low". */
  minSeverity?: Severity;
  /** OWASP categories to skip. */
  skipCategories?: ReadonlyArray<string>;
  /** Specific rules (overrides language detection). */
  rules?: Rule[];
  /** Optional pre-loaded pack. */
  pack?: OwaspPack;
}

/**
 * Run a single OWASP scan over `code`. Always returns a `ScanResult`
 * — never throws. If the language is missing or the pack failed to
 * load, `findings` is empty and `language` is "".
 *
 *   const result = ProjectEric.scan("eval(req.body.q)", "javascript");
 *   // → { uri, language: 'javascript', findings: [...], ... }
 *
 * If `language` is omitted the scanner infers it from the MCP
 * content-rules (if the code imports `@modelcontextprotocol/sdk`)
 * or from `inferLanguageForCode(code)`.
 */
export function scan(code: string, optionsOrLanguage?: ScanOptions | string): ScanResult {
  ensurePack();
  const opts = normaliseOptions(optionsOrLanguage);
  // The contract is "always returns a ScanResult — never throws", so a
  // non-string input (null / undefined / number) is coerced rather than
  // crashing inside the scanner's text.split() call.
  const text = typeof code === 'string' ? code : code == null ? '' : String(code);
  const language = opts.language ?? inferLanguageForCode(text);
  if (!language) {
    return emptyResult('', text);
  }
  return scanner.scanCode({
    uri: opts.pack ? 'inline://inline' : 'inline://inline',
    language,
    text,
    minSeverity: opts.minSeverity,
    skipCategories: opts.skipCategories,
    rules: opts.rules,
    pack: opts.pack,
  });
}

/**
 * Convenience wrapper for MCP server code. Equivalent to `scan` with
 * `language: 'mcp'` but falls back to whatever the host language is
 * (so a `.ts` file using the MCP SDK still gets the JS/TS rules).
 *
 *   const result = ProjectEric.scanMcp(toolsCode);
 */
export function scanMcp(code: string, options: Omit<ScanOptions, 'language'> = {}): ScanResult {
  ensurePack();
  const language = inferMcpLanguage(code);
  if (!language) return emptyResult('', code);
  return scanner.scanCode({
    uri: 'inline://mcp-inline',
    language,
    text: code,
    minSeverity: options.minSeverity,
    skipCategories: options.skipCategories,
    rules: options.rules,
    pack: options.pack,
  });
}

/**
 * Score a scan result on the same 0–100 + A–F scale the extension
 * uses. Pure function.
 */
export function score(result: ScanResult): ReturnType<typeof scoreCalc.scoreFile> {
  return scoreCalc.scoreFile(result);
}

/** Score many results together (workspace). */
export function scoreMany(
  results: ScanResult[],
): ReturnType<typeof scoreCalc.scoreWorkspace> {
  return scoreCalc.scoreWorkspace(results);
}

/** List language ids that have rule packs. */
export function languages(): string[] {
  ensurePack();
  return packLoader.listLanguages();
}

/**
 * Heuristically pick a language id from the source text alone. Falls
 * back to MCP detection first (because MCP packs are content-driven)
 * and then to a small "this looks like Python / JS / PHP" check.
 */
export function inferLanguageForCode(text: string): string | null {
  ensurePack();
  const src = typeof text === 'string' ? text : text == null ? '' : String(text);
  const byContent = packLoader.languageIdForContent(src);
  if (byContent) return byContent;

  // Weighted signal table. Scoring beats a fixed if/else chain here: a
  // JavaScript file that happens to contain "SELECT ... FROM" must not be
  // classified as SQL, and a TypeScript interface must not be read as a
  // CSS rule. Each language accumulates evidence and the strongest match
  // wins; ties break toward the earlier (more specific) entry.
  const SIGNALS: Array<[string, RegExp, number]> = [
    // --- definitive anchors ---
    ['php', /<\?php\b/g, 6],
    ['css', /@media\b|@import\b|@charset\b/g, 6],
    ['html', /<!DOCTYPE\s+html|<html[\s>]|<div[\s>]|<body[\s>]/gi, 6],
    ['go', /\bfunc\s+\w+\s*\(|\bpackage\s+main\b|\bfmt\.\w+\(/g, 6],
    ['rust', /\bfn\s+\w+\s*\(|\blet\s+mut\b|\bimpl\s+\w+/g, 6],
    ['cpp', /#include\s*[<"]|\bstd::/g, 6],
    ['csharp', /\busing\s+System\b|\bnamespace\s+\w+|\bpublic\s+(?:static\s+)?(?:class|void|int|string)\b/g, 6],
    ['java', /\bpublic\s+(?:static\s+)?(?:class|void|int|String)\b|\bSystem\.out\.|\bpackage\s+[\w.]+;/g, 6],
    ['python', /\bdef\s+\w+\s*\(|\bclass\s+\w+\s*\(|\bimport\s+\w+\b|\bfrom\s+\w+\s+import\b|__\w+__/g, 6],
    ['ruby', /\bputs\b|\brequire\s+['"]|\bdo\s*\||\bend\b\s*$/gm, 6],
    ['typescript', /\binterface\s+\w+\s*\{|\btype\s+\w+\s*=|\benum\s+\w+\s*\{|:\s*(?:string|number|boolean|void|unknown|any)\b/g, 5],
    ['sql', /\bSELECT\b[\s\S]*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\b[\s\S]*\bSET\b|\bCREATE\s+TABLE\b/gi, 5],

    // --- weaker signals ---
    ['javascript', /\bfunction\s+\w+|\bconst\s+\w+\s*=|=>\s*\{|document\.|window\.|\brequire\s*\(/g, 3],
    ['python', /:\s*(?:int|str|bool|float|bytes|list|dict|set|tuple|None)\b/g, 3],
    ['css', /[.#]?[\w-]+\s*\{[^}]*[:;][^}]*\}/g, 2],
  ];

  const scores = new Map<string, number>();
  for (const [lang, re, weight] of SIGNALS) {
    re.lastIndex = 0;
    const matches = src.match(re);
    if (matches && matches.length > 0) {
      // Cap the per-language contribution so one keyword repeated 50
      // times cannot outvote a genuine second-language signal.
      scores.set(lang, (scores.get(lang) ?? 0) + Math.min(matches.length, 5) * weight);
    }
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [lang] of SIGNALS) {
    const score = scores.get(lang) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return best;
}

function inferMcpLanguage(text: string): string | null {
  ensurePack();
  // Always look at the MCP pack first. If the user is writing MCP
  // server code, scan with MCP rules.
  const mcp = packLoader.getLanguagePack('mcp');
  if (mcp) {
    const matchers: string[] | undefined =
      (mcp as unknown as { matchPatterns?: string[] }).matchPatterns;
    if (matchers && matchers.length > 0) {
      for (const re of matchers) {
        try {
          if (new RegExp(re, 'g').test(text)) return 'mcp';
        } catch {
          /* skip bad regex */
        }
      }
    }
  }
  // Fall back to whichever language the file looks like.
  return inferLanguageForCode(text);
}

function normaliseOptions(
  arg: ScanOptions | string | undefined,
): ScanOptions {
  if (!arg) return {};
  if (typeof arg === 'string') return { language: arg };
  return arg;
}

function emptyResult(language: string, text: string): ScanResult {
  return {
    uri: 'inline://inline',
    language,
    findings: [],
    durationMs: 0,
    lineCount: text.split('\n').length,
    scannedAt: Date.now(),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Browser / Node dual entry. When loaded via a <script>, install
// `window.ProjectEric`. When `require()`d, leave `module.exports`
// untouched so consumers can pick what they need.
// ────────────────────────────────────────────────────────────────────────

const api = {
  scan,
  scanMcp,
  score,
  scoreMany,
  languages,
  inferLanguageForCode,
  hasPack: (): boolean => ensurePack() !== null,
  scanner: scanner as typeof scanner,
  packLoader: packLoader as typeof packLoader,
  scoreCalculator: scoreCalc as typeof scoreCalc,
};

if (typeof globalThis !== 'undefined') {
  const g = globalThis as unknown as { ProjectEric?: typeof api };
  if (!g.ProjectEric) g.ProjectEric = api;
  const m = globalThis as unknown as { module?: { exports: unknown } };
  if (m.module && typeof m.module.exports === 'object') {
    m.module.exports = api;
  }
}

export default api;
