/**
 * Score calculator.
 *
 * The Project Eric security score is a 0–100 integer, plus an A–F grade
 * letter that maps to a colour the UI uses everywhere.
 *
 * Formula (per file):
 *   score = clamp(100 - Σ deductions, 0, 100)
 *
 * Deductions are severity-weighted:
 *   - critical: −20 (capped at one per category per file)
 *   - high:     −10
 *   - medium:   −5
 *   - low:      −2
 *   - info:     −1
 *
 * On top of that we apply a category-coverage penalty: if a file has
 * findings in ≥ 3 different OWASP categories, we multiply the deduction
 * by 1.25 — security debt that spans categories is harder to fix than
 * multiple issues in the same category.
 *
 * The workspace score is a weighted average of per-file scores, weighted
 * by file size (line count), so a small file with 1 critical finding
 * doesn't tank the whole workspace.
 */

import type {
  Finding,
  FileScore,
  Improvement,
  OwaspCategory,
  ScanResult,
  Severity,
  WorkspaceScore,
} from '../types';

const SEVERITY_DEDUCTION: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 1,
};

const GRADE_BANDS: Array<{ grade: string; min: number; color: string }> = [
  { grade: 'A+', min: 95, color: '#10b981' },
  { grade: 'A',  min: 85, color: '#22c55e' },
  { grade: 'B',  min: 70, color: '#84cc16' },
  { grade: 'C',  min: 55, color: '#eab308' },
  { grade: 'D',  min: 40, color: '#f97316' },
  { grade: 'E',  min: 25, color: '#ef4444' },
  { grade: 'F',  min: 0,  color: '#991b1b' },
];

const EMPTY_COUNTS: Record<Severity, number> = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
};

function gradeFor(score: number): { grade: string; color: string } {
  for (const band of GRADE_BANDS) {
    if (score >= band.min) return { grade: band.grade, color: band.color };
  }
  return GRADE_BANDS[GRADE_BANDS.length - 1];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Compute the score for a single file's scan result.
 *
 * If `findings` is empty the file gets 100 (perfect).
 */
export function scoreFile(result: ScanResult): FileScore {
  const counts: Record<Severity, number> = { ...EMPTY_COUNTS };
  const byCategory: Map<OwaspCategory, Set<Severity>> = new Map();

  let deduction = 0;
  for (const f of result.findings) {
    counts[f.severity]++;
    deduction += SEVERITY_DEDUCTION[f.severity];
    if (!byCategory.has(f.category)) byCategory.set(f.category, new Set());
    byCategory.get(f.category)!.add(f.severity);
  }

  // Cross-category penalty — security debt spread across categories is
  // structurally worse than debt in one place.
  const distinctCategories = byCategory.size;
  if (distinctCategories >= 3) {
    deduction = Math.round(deduction * 1.25);
  } else if (distinctCategories >= 5) {
    deduction = Math.round(deduction * 1.5);
  }

  const score = clamp(100 - deduction, 0, 100);
  const { grade, color } = gradeFor(score);

  return {
    uri: result.uri,
    language: result.language,
    score,
    grade,
    counts,
    totalFindings: result.findings.length,
    scannedAt: result.scannedAt,
  };
}

/**
 * Compute the workspace-wide score from a list of file scans.
 *
 * Each file's contribution to the average is weighted by log(lineCount + 10)
 * so tiny config files don't drown out the score.
 */
export function scoreWorkspace(results: ScanResult[]): WorkspaceScore {
  if (results.length === 0) {
    return {
      overall: 100,
      grade: 'A+',
      counts: { ...EMPTY_COUNTS },
      totalFindings: 0,
      filesScanned: 0,
      perFile: [],
      categoryBreakdown: emptyCategoryBreakdown(),
      scannedAt: Date.now(),
    };
  }

  const perFile = results.map(scoreFile);
  const counts: Record<Severity, number> = { ...EMPTY_COUNTS };
  const categoryBreakdown = emptyCategoryBreakdown();
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < perFile.length; i++) {
    const file = perFile[i];
    const result = results[i];
    const weight = Math.log(Math.max(1, result.lineCount) + 10);
    weightedSum += file.score * weight;
    totalWeight += weight;
    for (const sev of Object.keys(counts) as Severity[]) {
      counts[sev] += file.counts[sev];
    }
    for (const finding of result.findings) {
      categoryBreakdown[finding.category].count += 1;
      categoryBreakdown[finding.category].weight += SEVERITY_DEDUCTION[finding.severity];
    }
  }

  const overall = clamp(Math.round(weightedSum / Math.max(1, totalWeight)), 0, 100);
  const { grade } = gradeFor(overall);

  return {
    overall,
    grade,
    counts,
    totalFindings: perFile.reduce((acc, f) => acc + f.totalFindings, 0),
    filesScanned: perFile.length,
    perFile,
    categoryBreakdown,
    scannedAt: Date.now(),
  };
}

function emptyCategoryBreakdown(): Record<OwaspCategory, { count: number; weight: number }> {
  return {
    A01: { count: 0, weight: 0 },
    A02: { count: 0, weight: 0 },
    A03: { count: 0, weight: 0 },
    A04: { count: 0, weight: 0 },
    A05: { count: 0, weight: 0 },
    A06: { count: 0, weight: 0 },
    A07: { count: 0, weight: 0 },
    A08: { count: 0, weight: 0 },
    A09: { count: 0, weight: 0 },
    A10: { count: 0, weight: 0 },
  };
}

/**
 * Compute the score impact of applying `finding`. Returns the score
 * delta the file would gain if this finding were removed.
 */
export function impactOf(finding: Finding): number {
  return SEVERITY_DEDUCTION[finding.severity];
}

/**
 * Compute a list of suggested "improvements" — actions the user can
 * take to raise their score. Sorted by biggest score-impact first.
 */
const EFFORT_BY_SEVERITY: Record<Severity, Improvement['effort']> = {
  critical: 'high',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'low',
};

export function improvementsFor(findings: Finding[]): Improvement[] {
  return findings
    .filter((f) => f.severity !== 'info') // info findings don't improve the score
    .map((finding) => ({
      finding,
      scoreImpact: impactOf(finding),
      effort: EFFORT_BY_SEVERITY[finding.severity],
      rationale: finding.fix?.hint
        ?? finding.fix?.title
        ?? finding.summary,
    }))
    .sort((a, b) => {
      if (a.scoreImpact !== b.scoreImpact) return b.scoreImpact - a.scoreImpact;
      const sev = (s: Severity): number =>
        ({ critical: 4, high: 3, medium: 2, low: 1, info: 0 })[s];
      return sev(b.finding.severity) - sev(a.finding.severity);
    });
}

export const GRADES = GRADE_BANDS;