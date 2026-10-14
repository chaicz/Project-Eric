/**
 * Type definitions used across the Project Eric OWASP Scanner extension.
 *
 * These mirror the shape of the packs in `data/` — see `data/owasp-pack.json`
 * for the canonical manifest and `data/languages/*.lang.json` for the
 * per-language rule packs. The scanner consumes both at runtime.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * The 10 OWASP Top 10 categories for 2021. The keys match the
 * "A01"… "A10" IDs that the React dashboard uses.
 */
export type OwaspCategory =
  | 'A01' // Broken Access Control
  | 'A02' // Cryptographic Failures
  | 'A03' // Injection
  | 'A04' // Insecure Design
  | 'A05' // Security Misconfiguration
  | 'A06' // Vulnerable & Outdated Components
  | 'A07' // Identification & Authentication Failures
  | 'A08' // Software & Data Integrity Failures
  | 'A09' // Security Logging & Monitoring Failures
  | 'A10'; // Server-Side Request Forgery (SSRF)

export interface OwaspCategoryMeta {
  id: OwaspCategory;
  name: string;
  shortName: string;
  description: string;
  cwe: string[];
  url: string;
}

export interface RulePattern {
  /** Human description of what the rule is looking for. */
  description: string;
  /** ECMAScript-flavoured regular expression string. */
  regex: string;
  /** Optional flags, defaults to "g". */
  flags?: string;
  /** Confidence 0–100, helps rank overlapping matches. */
  confidence?: number;
}

export interface RuleFix {
  /** Short description of the fix shown in Code Actions. */
  title: string;
  /** Optional rewritten snippet to replace the matched range. */
  replacement?: string;
  /** If no replacement, a guidance-only hint. */
  hint?: string;
  /** Link to the OWASP / CWE docs. */
  docUrl?: string;
}

export interface Rule {
  /** Globally unique rule id, e.g. "A03-001". */
  id: string;
  /** Display name. */
  name: string;
  /** Short, one-line description. */
  summary: string;
  /** Detailed description shown in the dashboard. */
  description: string;
  /** Severity when this rule fires. */
  severity: Severity;
  /** OWASP category. */
  category: OwaspCategory;
  /** CWE ids, e.g. ["CWE-89"]. */
  cwe?: string[];
  /** Regex patterns that trigger this rule. */
  patterns: RulePattern[];
  /** Languages this rule applies to; empty = applies to all. */
  languages?: string[];
  /** Suggested remediation. */
  fix?: RuleFix;
  /** Safe to apply the fix automatically? If true, the Code Action is "Auto-fix". */
  safeToAutoFix?: boolean;
  /** References shown in the docs panel. */
  references?: { label: string; url: string }[];
}

export interface LanguagePack {
  /** Language id matching `vscode.TextDocument.languageId`. */
  id: string;
  /** Display label, e.g. "JavaScript". */
  label: string;
  /** File extensions this pack should match. */
  extensions: string[];
  /** Rules that are specific to this language. */
  rules: Rule[];
  /** Globals applied to every regex match in this pack. */
  flags?: string;
}

export interface OwaspPack {
  /** Pack schema version. */
  schemaVersion: string;
  /** The OWASP edition this pack targets (e.g. "2021"). */
  edition: string;
  /** Global rules — apply to every supported language. */
  globalRules: Rule[];
  /** Per-language rule packs. */
  languages: LanguagePack[];
  /** Per-category metadata. */
  categories: Record<OwaspCategory, OwaspCategoryMeta>;
}

export interface Finding {
  /** Unique finding id: ruleId + first line + first column + fileUri hash. */
  id: string;
  ruleId: string;
  ruleName: string;
  summary: string;
  description: string;
  severity: Severity;
  category: OwaspCategory;
  cwe?: string[];
  /** The file that owns the finding. */
  uri: string;
  /** Language of the file at scan time. */
  language: string;
  /** 0-indexed line in the file. */
  line: number;
  /** 0-indexed column in the line. */
  column: number;
  /** 0-indexed start offset in the file text. */
  startOffset: number;
  /** 0-indexed end offset in the file text. */
  endOffset: number;
  /** The matched text. */
  matchText: string;
  /** Source excerpt with optional surrounding context. */
  excerpt: string;
  fix?: RuleFix;
  safeToAutoFix?: boolean;
  references?: { label: string; url: string }[];
}

export interface ScanResult {
  uri: string;
  language: string;
  findings: Finding[];
  /** ms elapsed for the scan. */
  durationMs: number;
  /** Total lines scanned. */
  lineCount: number;
  /** Scan timestamp (epoch ms). */
  scannedAt: number;
}

export interface WorkspaceScanResult {
  startedAt: number;
  finishedAt: number;
  files: ScanResult[];
  findings: Finding[];
}

export interface FileScore {
  uri: string;
  language: string;
  score: number;
  grade: string;
  counts: Record<Severity, number>;
  totalFindings: number;
  scannedAt: number;
}

/**
 * A single suggested improvement — a finding plus its projected score
 * impact and a rough effort estimate. Surfaced in the dashboard and
 * tree view so the user can see "what to fix next" at a glance.
 */
export interface Improvement {
  finding: Finding;
  scoreImpact: number;
  effort: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface WorkspaceScore {
  overall: number;
  grade: string;
  counts: Record<Severity, number>;
  totalFindings: number;
  filesScanned: number;
  perFile: FileScore[];
  categoryBreakdown: Record<OwaspCategory, { count: number; weight: number }>;
  scannedAt: number;
}

export interface ScanProgress {
  scanned: number;
  total: number;
  currentFile: string | null;
  phase: 'discovering' | 'scanning' | 'scoring' | 'done';
}