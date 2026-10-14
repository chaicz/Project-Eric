/**
 * Diagnostic manager — turns `Finding`s into `vscode.Diagnostic` squigglies
 * on the editor, plus Code Actions for the suggested fixes.
 */

import * as vscode from 'vscode';
import type { Finding, RuleFix } from '../types';

const SEVERITY_TO_DIAGNOSTIC: Record<string, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning,
  low: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

export class DiagnosticManager {
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('projectEric');
  }

  update(uri: vscode.Uri, findings: Finding[]): void {
    const diagnostics: vscode.Diagnostic[] = findings.map((f) => {
      const start = new vscode.Position(f.line, f.column);
      const end = new vscode.Position(
        f.line,
        f.column + Math.max(1, f.matchText.length),
      );
      const range = new vscode.Range(start, end);
      const sev = SEVERITY_TO_DIAGNOSTIC[f.severity] ?? vscode.DiagnosticSeverity.Warning;
      const message = `${f.summary} (${f.ruleId})`;
      const diag = new vscode.Diagnostic(range, message, sev);
      diag.code = {
        target: vscode.Uri.parse(`https://owasp.org/Top10/${f.category}/`),
        value: f.ruleId,
      };
      diag.source = 'Project Eric';
      diag.tags = f.severity === 'info' ? [vscode.DiagnosticTag.Unnecessary] : [];
      diag.relatedInformation = (f.cwe ?? []).map((cwe) => ({
        message: `${cwe} — Common Weakness Enumeration`,
        location: { uri, range },
      }));
      return diag;
    });
    this.collection.set(uri, diagnostics);
  }

  clear(uri?: vscode.Uri): void {
    if (uri) this.collection.delete(uri);
    else this.collection.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }
}

/**
 * Build a Code Action for the given finding. Returns `[]` when no fix
 * is available or when the fix has no replacement snippet.
 */
export function codeActionsFor(finding: Finding, document: vscode.TextDocument): vscode.CodeAction[] {
  const actions: vscode.CodeAction[] = [];

  if (finding.fix) {
    if (finding.fix.replacement) {
      const action = new vscode.CodeAction(
        `Apply fix: ${finding.fix.title}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.isPreferred = finding.safeToAutoFix ?? false;
      action.diagnostics = [
        new vscode.Diagnostic(
          new vscode.Range(finding.line, finding.column, finding.line, finding.column + finding.matchText.length),
          finding.summary,
          SEVERITY_TO_DIAGNOSTIC[finding.severity] ?? vscode.DiagnosticSeverity.Warning,
        ),
      ];
      action.edit = new vscode.WorkspaceEdit();
      const start = new vscode.Position(finding.line, finding.column);
      const end = new vscode.Position(finding.line, finding.column + finding.matchText.length);
      action.edit.replace(document.uri, new vscode.Range(start, end), finding.fix.replacement);
      actions.push(action);
    } else if (finding.fix.hint) {
      const action = new vscode.CodeAction(
        finding.fix.title || 'Show suggested fix',
        vscode.CodeActionKind.QuickFix,
      );
      action.command = {
        command: 'projectEric.security.showFix',
        title: finding.fix.title || 'Show fix',
        arguments: [finding],
      };
      actions.push(action);
    }
  }

  // Always offer "Open docs" so the user can read more.
  const docs = new vscode.CodeAction('Open documentation', vscode.CodeActionKind.Empty);
  docs.command = {
    command: 'vscode.open',
    title: 'Open documentation',
    arguments: [vscode.Uri.parse(`https://owasp.org/Top10/${finding.category}/`)],
  };
  actions.push(docs);

  return actions;
}

/** Convenience constructor for a CodeActionProvider. */
export function createDiagnosticActionProvider(
  getFindings: (uri: vscode.Uri) => Finding[],
): vscode.CodeActionProvider {
  return {
    provideCodeActions(document, _range, context) {
      const findings = getFindings(document.uri);
      const out: vscode.CodeAction[] = [];
      for (const diag of context.diagnostics) {
        if (diag.source !== 'Project Eric') continue;
        const finding = findings.find(
          (f) => f.line === diag.range.start.line && f.column === diag.range.start.character,
        );
        if (finding) {
          out.push(...codeActionsFor(finding, document));
        }
      }
      return out;
    },
  };
}

/** Convenience constructor for a HoverProvider that shows rule metadata. */
export function createHoverProvider(
  getFindings: (uri: vscode.Uri) => Finding[],
): vscode.HoverProvider {
  return {
    provideHover(document, position) {
      const findings = getFindings(document.uri);
      const finding = findings.find(
        (f) =>
          position.line === f.line &&
          position.character >= f.column &&
          position.character <= f.column + f.matchText.length,
      );
      if (!finding) return null;

      const fix = finding.fix
        ? `\n\n**Suggested fix** (${finding.severity === 'info' ? 'manual' : 'auto-fix available'}):\n${finding.fix.hint ?? finding.fix.title ?? ''}`
        : '';

      const refs = (finding.references ?? [])
        .map((r) => `- [${r.label}](${r.url})`)
        .join('\n');

      const md = new vscode.MarkdownString(
        [
          `**${finding.severity.toUpperCase()} — ${finding.ruleName}**`,
          ``,
          finding.description,
          ``,
          `*OWASP ${finding.category}*${finding.cwe?.length ? ` · CWE: ${finding.cwe.join(', ')}` : ''}`,
          fix,
          refs ? `\n**References**\n${refs}` : '',
        ].filter(Boolean).join('\n'),
      );
      md.isTrusted = true;
      return new vscode.Hover(md, finding
        ? new vscode.Range(finding.line, finding.column, finding.line, finding.column + finding.matchText.length)
        : new vscode.Range(position, position));
    },
  };
}

/** Re-export so callers can import everything from one module. */
export type { RuleFix };