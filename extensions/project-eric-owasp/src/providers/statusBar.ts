/**
 * Status bar item showing the live security score for the active editor.
 *
 * Wired up in `extension.ts`. The text uses the same shield emoji as
 * the React dashboard so the two experiences feel consistent.
 */

import * as vscode from 'vscode';
import type { FileScore, Severity } from '../types';

const SEVERITY_GLYPH: Record<Severity, string> = {
  critical: '⛔',
  high: '🔴',
  medium: '🟠',
  low: '🟡',
  info: 'ℹ️',
};

export class ScoreStatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100, // lower priority = further right
    );
    this.item.command = 'projectEric.security.openDashboard';
    this.item.tooltip = 'Open Project Eric security dashboard';
  }

  /** Update the status bar text for the active editor. */
  update(score: FileScore | null): void {
    if (!score) {
      this.item.hide();
      return;
    }

    const parts: string[] = [];
    parts.push(`$(shield) ${score.grade} ${score.score}/100`);
    const counts = score.counts;
    if (counts.critical > 0) parts.push(`${SEVERITY_GLYPH.critical}${counts.critical}`);
    if (counts.high > 0)     parts.push(`${SEVERITY_GLYPH.high}${counts.high}`);
    if (counts.medium > 0)   parts.push(`${SEVERITY_GLYPH.medium}${counts.medium}`);
    if (counts.low > 0)      parts.push(`${SEVERITY_GLYPH.low}${counts.low}`);
    this.item.text = parts.join(' ');
    this.item.tooltip = `Project Eric Security — ${score.language}\nScore: ${score.score}/100 (${score.grade})\nFindings: ${score.totalFindings}\nClick to open the dashboard.`;
    this.item.show();
  }

  /** Show a transient message in the status bar (e.g. "Scanning…"). */
  showProgress(message: string): void {
    this.item.text = `$(loading~spin) ${message}`;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}