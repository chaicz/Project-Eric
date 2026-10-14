/**
 * Tree view shown under the "Project Eric Security" activity-bar
 * container. The root has a "Workspace" node plus one node per file
 * with findings. Each file node expands into its findings, grouped
 * by OWASP category.
 */

import * as vscode from 'vscode';
import { basenamePosix } from '../util/pathSafe';
import type { Finding, FileScore, ScanResult, WorkspaceScore } from '../types';

export type SecurityTreeNode =
  | WorkspaceHeaderNode
  | FileHeaderNode
  | CategoryGroupNode
  | FindingNode;

export interface WorkspaceHeaderNode {
  kind: 'workspace';
  score: WorkspaceScore;
}

export interface FileHeaderNode {
  kind: 'file';
  uri: string;
  relativePath: string;
  score: FileScore;
}

export interface CategoryGroupNode {
  kind: 'category';
  fileUri: string;
  category: string;
  categoryName: string;
  count: number;
  children: FindingNode[];
}

export interface FindingNode {
  kind: 'finding';
  finding: Finding;
}

const SEVERITY_GLYPH: Record<string, string> = {
  critical: '⛔',
  high: '🔴',
  medium: '🟠',
  low: '🟡',
  info: 'ℹ️',
};

export class SecurityTreeProvider implements vscode.TreeDataProvider<SecurityTreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SecurityTreeNode | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceScore: WorkspaceScore | null = null;
  private fileResults: Map<string, { result: ScanResult; score: FileScore }> = new Map();

  setResults(workspaceScore: WorkspaceScore, results: ScanResult[]): void {
    this.workspaceScore = workspaceScore;
    this.fileResults.clear();
    for (const r of results) {
      const score: FileScore = {
        uri: r.uri,
        language: r.language,
        score: 0,
        grade: 'A',
        counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        totalFindings: r.findings.length,
        scannedAt: r.scannedAt,
      };
      for (const f of r.findings) score.counts[f.severity]++;
      // Compute the score using the same formula as the file's own result.
      const fileScore = computeInline(r);
      this.fileResults.set(r.uri, { result: r, score: fileScore ?? score });
    }
    this._onDidChangeTreeData.fire();
  }

  /** Mark a single finding as a false positive (hide it from the tree). */
  suppressFinding(findingId: string): void {
    for (const { result } of this.fileResults.values()) {
      result.findings = result.findings.filter((f) => f.id !== findingId);
    }
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SecurityTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'workspace':
        return this.workspaceItem(element);
      case 'file':
        return this.fileItem(element);
      case 'category':
        return this.categoryItem(element);
      case 'finding':
        return this.findingItem(element);
    }
  }

  getChildren(element?: SecurityTreeNode): vscode.ProviderResult<SecurityTreeNode[]> {
    if (!element) {
      if (!this.workspaceScore) return [];
      return [
        { kind: 'workspace', score: this.workspaceScore },
        ...Array.from(this.fileResults.values()).map(({ result, score }) => ({
          kind: 'file' as const,
          uri: result.uri,
          relativePath: relativeLabel(result.uri),
          score,
        })),
      ];
    }

    if (element.kind === 'workspace') {
      // Show severity totals under the workspace header.
      const ws = element.score;
      const counts = ws.counts;
      const out: SecurityTreeNode[] = [];
      for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as const) {
        if (counts[sev] > 0) {
          out.push({
            kind: 'category',
            fileUri: '',
            category: sev.toUpperCase(),
            categoryName: `${counts[sev]} ${sev}`,
            count: counts[sev],
            children: [],
          });
        }
      }
      return out;
    }

    if (element.kind === 'file') {
      const file = this.fileResults.get(element.uri);
      if (!file) return [];
      // Group findings by category.
      const groups = new Map<string, Finding[]>();
      for (const f of file.result.findings) {
        if (!groups.has(f.category)) groups.set(f.category, []);
        groups.get(f.category)!.push(f);
      }
      return Array.from(groups.entries()).map(([category, findings]) => ({
        kind: 'category' as const,
        fileUri: element.uri,
        category,
        categoryName: `${category} — ${findingCategoryName(category)}`,
        count: findings.length,
        children: findings.map((f) => ({ kind: 'finding' as const, finding: f })),
      }));
    }

    if (element.kind === 'category') {
      return element.children;
    }

    return [];
  }

  getParent(element: SecurityTreeNode): vscode.ProviderResult<SecurityTreeNode> {
    if (element.kind === 'category') {
      // File parent.
      const file = this.fileResults.get(element.fileUri);
      if (!file) return null;
      return {
        kind: 'file',
        uri: element.fileUri,
        relativePath: relativeLabel(element.fileUri),
        score: file.score,
      };
    }
    if (element.kind === 'finding') {
      const file = this.fileResults.get(element.finding.uri);
      if (!file) return null;
      return {
        kind: 'file',
        uri: element.finding.uri,
        relativePath: relativeLabel(element.finding.uri),
        score: file.score,
      };
    }
    return null;
  }

  // ─────────────── tree-item renderers ───────────────

  private workspaceItem(node: WorkspaceHeaderNode): vscode.TreeItem {
    const { score } = node;
    const item = new vscode.TreeItem(
      `Workspace — ${score.grade} ${score.overall}/100  (${score.totalFindings} findings)`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.description = `${score.filesScanned} files scanned`;
    item.contextValue = 'workspace';
    item.iconPath = new vscode.ThemeIcon('shield');
    return item;
  }

  private fileItem(node: FileHeaderNode): vscode.TreeItem {
    const { score, relativePath } = node;
    const item = new vscode.TreeItem(
      relativePath,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.description = `${score.grade} ${score.score}/100  (${score.totalFindings})`;
    item.tooltip = `${node.uri}\nLanguage: ${score.language}\nScore: ${score.score}/100`;
    item.contextValue = 'file';
    item.iconPath = new vscode.ThemeIcon('file-code');
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.parse(node.uri)],
    };
    return item;
  }

  private categoryItem(node: CategoryGroupNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${node.categoryName}`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.description = `${node.count}`;
    item.contextValue = 'category';
    item.iconPath = new vscode.ThemeIcon('folder');
    return item;
  }

  private findingItem(node: FindingNode): vscode.TreeItem {
    const { finding } = node;
    const glyph = SEVERITY_GLYPH[finding.severity] ?? '•';
    const item = new vscode.TreeItem(
      `${glyph} ${finding.ruleName}`,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = `L${finding.line + 1}:${finding.column + 1}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${finding.severity.toUpperCase()}** — ${finding.summary}`,
        '',
        `\`${finding.ruleId}\` · OWASP ${finding.category}`,
        finding.cwe?.length ? `CWE: ${finding.cwe.join(', ')}` : '',
        finding.fix?.title ? `\n*Suggested fix:* ${finding.fix.title}` : '',
      ].filter(Boolean).join('\n'),
    );
    item.contextValue = finding.safeToAutoFix
      ? 'findingWithFix'
      : 'finding';
    item.command = {
      command: 'vscode.open',
      title: 'Open file',
      arguments: [
        vscode.Uri.parse(finding.uri),
        { selection: new vscode.Range(finding.line, finding.column, finding.line, finding.column + finding.matchText.length) },
      ],
    };
    return item;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function relativeLabel(uri: string): string {
  if (uri.startsWith('file://')) {
    const p = uri.slice(7);
    // Try to make it relative to the workspace root.
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const root = folders[0].uri.fsPath.replace(/\\/g, '/');
      const rel = p.replace(root + '/', '');
      if (rel !== p) return rel;
    }
    return basenamePosix(p);
  }
  return uri;
}

function findingCategoryName(id: string): string {
  const names: Record<string, string> = {
    A01: 'Broken Access Control',
    A02: 'Cryptographic Failures',
    A03: 'Injection',
    A04: 'Insecure Design',
    A05: 'Security Misconfiguration',
    A06: 'Vulnerable & Outdated Components',
    A07: 'Identification & Authentication Failures',
    A08: 'Software & Data Integrity Failures',
    A09: 'Security Logging & Monitoring Failures',
    A10: 'Server-Side Request Forgery',
  };
  return names[id] ?? id;
}

/** Same formula as `scoring/scoreCalculator.ts` but inline, so the
 *  tree view can render file grades without importing the module. */
function computeInline(result: ScanResult): FileScore | null {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const deduction: Record<string, number> = { critical: 20, high: 10, medium: 5, low: 2, info: 1 };
  let total = 0;
  for (const f of result.findings) {
    counts[f.severity]++;
    total += deduction[f.severity] ?? 0;
  }
  const cats = new Set(result.findings.map((f) => f.category));
  if (cats.size >= 5) total = Math.round(total * 1.5);
  else if (cats.size >= 3) total = Math.round(total * 1.25);
  const score = Math.max(0, Math.min(100, 100 - total));
  const grade = score >= 95 ? 'A+' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : score >= 25 ? 'E' : 'F';
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