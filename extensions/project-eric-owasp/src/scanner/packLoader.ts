/**
 * Loads the bundled OWASP pack and per-language rule packs from the
 * extension's `data/` directory. Uses `fetch()` with the
 * `vscode://` URI scheme, which works in both desktop VS Code and
 * vscode.dev.
 */

import type {
  OwaspPack,
  LanguagePack,
  OwaspCategory,
  OwaspCategoryMeta,
} from '../types';
import { joinPosix } from '../util/pathSafe';

let packCache: OwaspPack | null = null;
let languageCache: Map<string, LanguagePack> = new Map();

/**
 * Resolve a resource path to a URI the running extension can fetch.
 *
 * - Desktop VS Code: `vscode.ExtensionContext.asAbsolutePath()` returns an
 *   absolute filesystem path, which `fetch()` can read via the `file://`
 *   protocol in Node 20+.
 * - vscode.dev / web: paths under the extension root must be referenced via
 *   the `vscode-resource:` scheme or read with `vscode.workspace.fs`.
 *
 * To avoid that, we ask the host (extension) to read the file and pass the
 * contents in. The `loadPack(content)` entry point takes the raw JSON text
 * so callers can use whichever API is appropriate.
 */

export const DEFAULT_PACK_VERSION = '2021.1';

/**
 * Parse the raw JSON contents of `data/owasp-pack.json` into a typed
 * `OwaspPack`. Throws if the shape is wrong so the activation can fall
 * back to a no-pack state.
 */
export function parsePack(jsonText: string): OwaspPack {
  const parsed = JSON.parse(jsonText) as OwaspPack;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OWASP pack: not an object');
  }
  if (!parsed.categories || !parsed.globalRules) {
    throw new Error('OWASP pack: missing "categories" or "globalRules"');
  }
  // Validate category ids — every A01–A10 must be present.
  const required: OwaspCategory[] = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'];
  for (const c of required) {
    if (!parsed.categories[c]) {
      throw new Error(`OWASP pack: missing category ${c}`);
    }
  }
  return parsed;
}

/** Parse a single language pack from JSON text. */
export function parseLanguagePack(jsonText: string): LanguagePack {
  return JSON.parse(jsonText) as LanguagePack;
}

/** Cache the loaded pack + every language pack under `pack.languages`. */
export function ingestPack(pack: OwaspPack): void {
  packCache = pack;
  languageCache.clear();
  for (const lang of pack.languages) {
    languageCache.set(lang.id, lang);
  }
}

/** Get the cached pack, or `null` if none loaded yet. */
export function getPack(): OwaspPack | null {
  return packCache;
}

/** Get a specific language pack by id (e.g. "javascript"). */
export function getLanguagePack(id: string): LanguagePack | null {
  return languageCache.get(id) ?? null;
}

/** List the language ids we have packs for. */
export function listLanguages(): string[] {
  return Array.from(languageCache.keys());
}

/**
 * Combine global rules + the rules from a specific language pack into a
 * single deduped list. Language-specific rules override globals with the
 * same `id`.
 */
export function mergedRulesFor(languageId: string): import('../types').Rule[] {
  const pack = packCache;
  if (!pack) return [];
  const lang = languageCache.get(languageId);
  const byId = new Map<string, import('../types').Rule>();
  for (const r of pack.globalRules) byId.set(r.id, r);
  if (lang) {
    for (const r of lang.rules) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

/**
 * Map a file path / fileName to a language pack id using the pack's
 * declared extensions. Returns `null` when no pack matches.
 */
export function languageIdForFile(filePath: string, pack?: OwaspPack | null): string | null {
  const p = pack ?? packCache;
  if (!p) return null;
  const base = filePath.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  for (const lang of p.languages) {
    if (lang.extensions.includes(ext)) return lang.id;
  }
  return null;
}

/**
 * Map a file's *contents* to a language pack id. Useful for language
 * packs that detect by content (e.g. MCP server code can live in
 * `server.ts`, `tools.py`, etc.). The `mcp` pack ships with
 * `matchPatterns` — any file whose contents hit one of those regexes
 * is treated as MCP server code.
 */
export function languageIdForContent(text: string, pack?: OwaspPack | null): string | null {
  const p = pack ?? packCache;
  if (!p) return null;
  for (const lang of p.languages) {
    const matchers: string[] | undefined = (lang as unknown as { matchPatterns?: string[] }).matchPatterns;
    if (!matchers || matchers.length === 0) continue;
    for (const re of matchers) {
      try {
        if (new RegExp(re, 'g').test(text)) return lang.id;
      } catch {
        // bad regex in the pack — ignore this matcher
      }
    }
  }
  return null;
}

/** Pretty-print a category id like "A03" into "A03 — Injection". */
export function categoryLabel(id: OwaspCategory, pack?: OwaspPack | null): string {
  const meta: OwaspCategoryMeta | undefined = (pack ?? packCache)?.categories?.[id];
  if (!meta) return id;
  return `${id} — ${meta.name}`;
}

/** File path used by `extension.ts` when reading from the extension root. */
export function dataPath(...parts: string[]): string {
  return joinPosix('data', ...parts);
}