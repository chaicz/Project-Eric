/**
 * Dashboard webview.
 *
 * Renders an interactive score card, vulnerability list, and improvement
 * suggestions. The HTML/CSS lives in the same file as the TypeScript so
 * the asset can be shipped as a single string.
 *
 * Message protocol (extension ↔ webview):
 *   extension → webview:
 *     { type: 'update', data: { workspace, files, findings, improvements } }
 *   webview → extension:
 *     { type: 'jumpTo', uri: string, line: number, column: number }
 *     { type: 'applyFix', findingId: string }
 *     { type: 'markFalsePositive', findingId: string }
 *     { type: 'rescan' }
 */

import * as vscode from 'vscode';
import type {
  FileScore,
  Finding,
  Improvement,
  Severity,
  WorkspaceScore,
} from '../types';
import { GRADES } from '../scoring/scoreCalculator';

/**
 * Payload the webview receives. Top-level so the extension can build it
 * without importing the webview implementation.
 */
export interface PayloadValue {
  workspace: WorkspaceScore;
  files: FileScore[];
  findings: Finding[];
  improvements: Improvement[];
}

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#eab308',
  info: '#3b82f6',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export class DashboardWebview {
  public static readonly viewType = 'projectEric.securityDashboard';

  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext;
  private getPayload: () => PayloadValue | null;

  constructor(
    context: vscode.ExtensionContext,
    getPayload: () => PayloadValue | null,
  ) {
    this.context = context;
    this.getPayload = getPayload;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.pushUpdate();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      DashboardWebview.viewType,
      'Project Eric — Security Dashboard',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(this.context.extensionPath)],
      },
    );

    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    this.render();
  }

  pushUpdate(): void {
    if (!this.panel) return;
    const payload = this.getPayload();
    if (!payload) return;
    this.panel.webview.postMessage({ type: 'update', data: payload });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Message handling
  // ──────────────────────────────────────────────────────────────────────

  private async handleMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'jumpTo':
        await jumpTo(msg.uri as string, msg.line as number, msg.column as number);
        break;
      case 'applyFix':
        vscode.commands.executeCommand('projectEric.security.applyFix', msg.findingId);
        break;
      case 'markFalsePositive':
        vscode.commands.executeCommand('projectEric.security.markFalsePositive', msg.findingId);
        break;
      case 'rescan':
        vscode.commands.executeCommand('projectEric.security.scanWorkspace');
        break;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // HTML
  // ──────────────────────────────────────────────────────────────────────

  private render(): void {
    if (!this.panel) return;
    this.panel.webview.html = this.htmlFor(this.getPayload());
  }

  private htmlFor(payload: PayloadValue | null): string {
    const payloadJson = JSON.stringify(payload ?? emptyPayload());
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;" />
<title>Project Eric Security</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --muted: var(--vscode-descriptionForeground);
    --card: var(--vscode-editorWidget-background);
    --border: var(--vscode-editorWidget-border);
    --accent: var(--vscode-focusBorder);
    --link: var(--vscode-textLink-foreground);
    --critical: #dc2626;
    --high: #ef4444;
    --medium: #f59e0b;
    --low: #eab308;
    --info: #3b82f6;
    --good: #10b981;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
    font-size: 13px;
    background: var(--bg);
    color: var(--fg);
    line-height: 1.5;
  }
  h1, h2, h3 { margin: 0; font-weight: 700; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin: 0 0 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .subtitle { color: var(--muted); margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px;
  }
  .score-row { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .score-ring {
    --pct: 100;
    --color: var(--good);
    width: 110px;
    height: 110px;
    border-radius: 50%;
    background:
      conic-gradient(var(--color) calc(var(--pct) * 1%), var(--border) 0);
    display: grid;
    place-items: center;
    position: relative;
  }
  .score-ring::after {
    content: '';
    position: absolute;
    inset: 6px;
    background: var(--card);
    border-radius: 50%;
  }
  .score-ring-text { position: relative; text-align: center; }
  .score-ring-text .grade { font-size: 22px; font-weight: 800; }
  .score-ring-text .num { font-size: 12px; color: var(--muted); }
  .stat { display: flex; flex-direction: column; }
  .stat .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .stat .value { font-size: 18px; font-weight: 700; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid currentColor;
    margin-right: 6px;
  }
  .badge .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .sev-critical { color: var(--critical); }
  .sev-high { color: var(--high); }
  .sev-medium { color: var(--medium); }
  .sev-low { color: var(--low); }
  .sev-info { color: var(--info); }
  .findings-list { margin-top: 12px; }
  .finding {
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 8px;
    background: var(--bg);
    cursor: pointer;
    transition: transform 0.06s ease, border-color 0.06s ease;
  }
  .finding:hover { transform: translateY(-1px); border-color: var(--accent); }
  .finding-title {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-weight: 600;
  }
  .finding-meta { color: var(--muted); font-size: 11px; margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .finding-desc { margin-top: 6px; }
  .finding-fix {
    margin-top: 8px;
    padding: 8px 10px;
    background: rgba(16, 185, 129, 0.07);
    border-left: 3px solid var(--good);
    border-radius: 4px;
    font-size: 12px;
  }
  .finding-actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
  button {
    padding: 5px 10px;
    font-size: 11px;
    border-radius: 5px;
    background: var(--accent);
    color: var(--bg);
    border: 1px solid var(--accent);
    cursor: pointer;
  }
  button.secondary { background: transparent; color: var(--fg); border-color: var(--border); }
  button:hover { opacity: 0.92; }
  .empty { color: var(--muted); padding: 24px; text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); font-size: 12px; }
  th { color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .file-link { font-family: ui-monospace, monospace; font-size: 12px; cursor: pointer; color: var(--link); }
  .cat-bar { background: var(--border); border-radius: 4px; height: 6px; overflow: hidden; margin-top: 4px; }
  .cat-bar-fill { height: 100%; background: var(--accent); }
  .filter-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .filter-chip {
    padding: 4px 10px;
    border-radius: 999px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    font-size: 11px;
    cursor: pointer;
  }
  .filter-chip.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  .rescan-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
</style>
</head>
<body>
<h1>🛡 Project Eric Security</h1>
<p class="subtitle" id="subtitle">Workspace scan — click any finding to jump to the source.</p>

<section class="card score-row" id="scoreCard">
  <!-- filled in by JS -->
</section>

<section style="margin-top: 24px">
  <h2>OWASP Top 10 Coverage</h2>
  <div class="card" id="categoryCard"></div>
</section>

<section style="margin-top: 24px">
  <h2>Top Improvements</h2>
  <div class="card" id="improvementsCard"></div>
</section>

<section style="margin-top: 24px">
  <h2>Findings</h2>
  <div class="card">
    <div class="rescan-row">
      <button class="secondary" id="rescanBtn">↻ Re-scan workspace</button>
    </div>
    <div class="filter-row" id="filterRow"></div>
    <div id="findings"></div>
  </div>
</section>

<section style="margin-top: 24px">
  <h2>Files</h2>
  <div class="card">
    <table id="filesTable">
      <thead>
        <tr><th>File</th><th>Language</th><th>Score</th><th>Findings</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
</section>

<script>
  const vscode = acquireVsCodeApi();
  let PAYLOAD = ${payloadJson};
  let activeFilter = 'all';

  function send(type, extra) {
    vscode.postMessage(Object.assign({ type }, extra || {}));
  }

  function gradeFor(score) {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    if (score >= 25) return 'E';
    return 'F';
  }
  function gradeColor(score) {
    if (score >= 85) return '#10b981';
    if (score >= 70) return '#84cc16';
    if (score >= 55) return '#eab308';
    if (score >= 40) return '#f97316';
    if (score >= 25) return '#ef4444';
    return '#991b1b';
  }

  function renderScore(score) {
    const card = document.getElementById('scoreCard');
    const ring = document.createElement('div');
    const grade = gradeFor(score.overall);
    const color = gradeColor(score.overall);
    ring.className = 'score-ring';
    ring.style.setProperty('--pct', score.overall);
    ring.style.setProperty('--color', color);
    ring.innerHTML = \`
      <div class="score-ring-text">
        <div class="grade" style="color: \${color}">\${grade}</div>
        <div class="num">\${score.overall}/100</div>
      </div>
    \`;

    const stats = document.createElement('div');
    stats.className = 'grid';
    stats.style.flex = '1';
    stats.innerHTML = \`
      <div class="stat"><span class="label">Files scanned</span><span class="value">\${score.filesScanned}</span></div>
      <div class="stat"><span class="label">Findings</span><span class="value">\${score.totalFindings}</span></div>
      <div class="stat"><span class="label">Categories hit</span><span class="value">\${Object.values(score.categoryBreakdown).filter(c => c.count).length}</span></div>
      <div class="stat"><span class="label">Last scan</span><span class="value" style="font-size: 13px;">\${new Date(score.scannedAt).toLocaleTimeString()}</span></div>
    \`;

    card.innerHTML = '';
    card.appendChild(ring);
    card.appendChild(stats);

    const counts = document.createElement('div');
    counts.style.marginTop = '18px';
    counts.style.flex = '100%';
    counts.innerHTML = \`
      <span class="badge sev-critical"><span class="dot"></span>\${score.counts.critical} critical</span>
      <span class="badge sev-high"><span class="dot"></span>\${score.counts.high} high</span>
      <span class="badge sev-medium"><span class="dot"></span>\${score.counts.medium} medium</span>
      <span class="badge sev-low"><span class="dot"></span>\${score.counts.low} low</span>
      <span class="badge sev-info"><span class="dot"></span>\${score.counts.info} info</span>
    \`;
    card.appendChild(counts);
  }

  function renderCategoryBreakdown(cb) {
    const card = document.getElementById('categoryCard');
    const order = ['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10'];
    const total = Object.values(cb).reduce((s, c) => s + c.count, 0) || 1;
    card.innerHTML = order.map(id => {
      const c = cb[id] || { count: 0, weight: 0 };
      const pct = Math.round((c.count / total) * 100);
      return \`
        <div style="margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span><strong>\${id}</strong> — \${CATEGORY_NAMES[id]}</span>
            <span style="color: var(--muted)">\${c.count} findings · weight \${c.weight}</span>
          </div>
          <div class="cat-bar"><div class="cat-bar-fill" style="width: \${pct}%;"></div></div>
        </div>
      \`;
    }).join('');
  }

  const CATEGORY_NAMES = {
    A01: 'Broken Access Control',
    A02: 'Cryptographic Failures',
    A03: 'Injection',
    A04: 'Insecure Design',
    A05: 'Security Misconfiguration',
    A06: 'Vulnerable & Outdated Components',
    A07: 'Identification & Authentication Failures',
    A08: 'Software & Data Integrity Failures',
    A09: 'Security Logging & Monitoring Failures',
    A10: 'Server-Side Request Forgery (SSRF)',
  };

  function renderImprovements(improvements) {
    const card = document.getElementById('improvementsCard');
    if (!improvements.length) {
      card.innerHTML = '<div class="empty">No improvements to suggest — keep it up!</div>';
      return;
    }
    card.innerHTML = improvements.slice(0, 8).map(imp => \`
      <div class="finding" data-id="\${imp.finding.id}">
        <div class="finding-title">
          <span class="badge sev-\${imp.finding.severity}"><span class="dot"></span>\${imp.finding.severity.toUpperCase()}</span>
          <span>\${imp.finding.ruleName}</span>
          <span style="margin-left: auto; color: var(--muted); font-size: 11px;">+\${imp.scoreImpact} pts · \${imp.effort} effort</span>
        </div>
        <div class="finding-meta">\${imp.finding.uri.replace(/^file:\\/\\//,'')} · L\${imp.finding.line + 1}</div>
        <div class="finding-fix"><strong>Suggestion:</strong> \${imp.rationale}</div>
      </div>
    \`).join('');
    card.querySelectorAll('.finding').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const imp = PAYLOAD.improvements.find(i => i.finding.id === id);
        if (imp) send('jumpTo', { uri: imp.finding.uri, line: imp.finding.line, column: imp.finding.column });
      });
    });
  }

  function renderFilters() {
    const row = document.getElementById('filterRow');
    row.innerHTML = '';
    ['all', 'critical', 'high', 'medium', 'low', 'info'].forEach(sev => {
      const btn = document.createElement('button');
      btn.className = 'filter-chip' + (sev === activeFilter ? ' active' : '');
      btn.textContent = sev === 'all' ? 'All' : sev.toUpperCase();
      btn.addEventListener('click', () => {
        activeFilter = sev;
        renderFindings(PAYLOAD.findings);
        renderFilters();
      });
      row.appendChild(btn);
    });
  }

  function renderFindings(findings) {
    const filtered = activeFilter === 'all' ? findings : findings.filter(f => f.severity === activeFilter);
    const root = document.getElementById('findings');
    if (!filtered.length) {
      root.innerHTML = '<div class="empty">No findings match the current filter.</div>';
      return;
    }
    root.innerHTML = filtered.map(f => \`
      <div class="finding" data-id="\${f.id}">
        <div class="finding-title">
          <span class="badge sev-\${f.severity}"><span class="dot"></span>\${f.severity.toUpperCase()}</span>
          <span>\${f.ruleName}</span>
          <span style="margin-left: auto; color: var(--muted); font-size: 11px;">\${f.ruleId} · \${f.category}</span>
        </div>
        <div class="finding-meta">\${f.uri.replace(/^file:\\/\\//,'')} · L\${f.line + 1}:\${f.column + 1} · \${f.language}</div>
        <div class="finding-desc">\${f.summary}</div>
        \${f.fix ? \`<div class="finding-fix"><strong>Fix:</strong> \${f.fix.title || f.fix.hint || ''}</div>\` : ''}
        <div class="finding-actions">
          <button class="secondary" data-action="jump">Jump to source</button>
          \${f.safeToAutoFix ? '<button data-action="fix">Apply auto-fix</button>' : ''}
          <button class="secondary" data-action="dismiss">Mark false positive</button>
        </div>
      </div>
    \`).join('');
    root.querySelectorAll('.finding').forEach(el => {
      const id = el.getAttribute('data-id');
      el.querySelector('[data-action="jump"]').addEventListener('click', (ev) => {
        ev.stopPropagation();
        const f = PAYLOAD.findings.find(x => x.id === id);
        if (f) send('jumpTo', { uri: f.uri, line: f.line, column: f.column });
      });
      const fixBtn = el.querySelector('[data-action="fix"]');
      if (fixBtn) fixBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        send('applyFix', { findingId: id });
      });
      el.querySelector('[data-action="dismiss"]').addEventListener('click', (ev) => {
        ev.stopPropagation();
        send('markFalsePositive', { findingId: id });
      });
      el.addEventListener('click', () => {
        const f = PAYLOAD.findings.find(x => x.id === id);
        if (f) send('jumpTo', { uri: f.uri, line: f.line, column: f.column });
      });
    });
  }

  function renderFiles(files) {
    const tbody = document.querySelector('#filesTable tbody');
    tbody.innerHTML = files.map(f => {
      const rel = (f.uri || '').replace(/^file:\\/\\//, '');
      return \`<tr>
        <td class="file-link" data-uri="\${f.uri}">\${rel.split(/[\\\\/]/).pop()}</td>
        <td>\${f.language}</td>
        <td><strong style="color: \${gradeColor(f.score)}">\${gradeFor(f.score)}</strong> \${f.score}/100</td>
        <td>\${f.totalFindings}</td>
      </tr>\`;
    }).join('');
    tbody.querySelectorAll('.file-link').forEach(el => {
      el.addEventListener('click', () => {
        const uri = el.getAttribute('data-uri');
        const f = PAYLOAD.files.find(x => x.uri === uri);
        if (f) send('jumpTo', { uri, line: 0, column: 0 });
      });
    });
  }

  function renderAll(payload) {
    PAYLOAD = payload;
    document.getElementById('subtitle').textContent =
      \`Workspace scan · \${payload.workspace.filesScanned} files · \${payload.workspace.totalFindings} findings · grade \${gradeFor(payload.workspace.overall)}\`;
    renderScore(payload.workspace);
    renderCategoryBreakdown(payload.workspace.categoryBreakdown);
    renderImprovements(payload.improvements);
    renderFilters();
    renderFindings(payload.findings);
    renderFiles(payload.files);
  }

  document.getElementById('rescanBtn').addEventListener('click', () => send('rescan'));

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'update') renderAll(msg.data);
  });

  renderAll(PAYLOAD);
</script>
</body>
</html>`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function jumpTo(uri: string, line: number, column: number): Promise<void> {
  try {
    const parsed = vscode.Uri.parse(uri);
    const doc = await vscode.workspace.openTextDocument(parsed);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const range = new vscode.Range(line, column, line, column + 1);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    editor.selection = new vscode.Selection(range.start, range.end);
  } catch (err) {
    vscode.window.showErrorMessage(`Project Eric: cannot open ${uri}: ${String(err)}`);
  }
}

export interface PayloadValue {
  workspace: WorkspaceScore;
  files: FileScore[];
  findings: Finding[];
  improvements: Improvement[];
}

function emptyPayload(): PayloadValue {
  return {
    workspace: {
      overall: 100,
      grade: 'A+',
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      totalFindings: 0,
      filesScanned: 0,
      perFile: [],
      categoryBreakdown: {
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
      },
      scannedAt: Date.now(),
    },
    files: [],
    findings: [],
    improvements: [],
  };
}

// Re-export the grades constant so the renderer can use them for the colour bar.
export { GRADES };