/**
 * Standalone scanner webview.
 *
 * A lightweight panel that loads `dist/project-eric-scanner.min.js`
 * (a self-contained bundle with the OWASP pack inlined) and exposes
 * a textarea where the user can paste code, OR a button that pulls
 * the active editor's contents. The scan runs entirely in the
 * browser via `window.ProjectEric.scan(...)` — no round-trip to the
 * extension host, no server.
 *
 * This is what makes the scanner "a function inside code-server"
 * rather than a separate MCP server or React page.
 */

import * as vscode from 'vscode';
import { joinPosix } from '../util/pathSafe';

export class StandaloneScannerWebview {
  public static readonly viewType = 'projectEric.standaloneScanner';
  private panel: vscode.WebviewPanel | null = null;

  /**
   * The most recently focused text editor.
   *
   * `vscode.window.activeTextEditor` is undefined while a webview panel
   * holds focus, which is exactly the moment the user clicks "Pull from
   * active editor" — so reading it directly always returned "no active
   * editor". We therefore remember the last real editor and fall back
   * to it when no editor is currently active.
   */
  private lastTextEditor: vscode.TextEditor | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    // Seed the tracker with whatever is open right now, then keep it
    // current for the lifetime of the panel.
    this.lastTextEditor = vscode.window.activeTextEditor;
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.lastTextEditor = editor;
      }
    });
    this.panel = vscode.window.createWebviewPanel(
      StandaloneScannerWebview.viewType,
      'Project Eric — Scan Key Code',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // Allow loading the bundled scanner + any local resources.
        localResourceRoots: [
          vscode.Uri.file(this.context.extensionPath),
        ],
      },
    );
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.panel.onDidDispose(() => {
      this.panel = null;
    });
    this.panel.webview.html = this.html();
  }

  private html(): string {
    const scriptUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(
        joinPosix(this.context.extensionPath, 'dist', 'project-eric-scanner.min.js'),
      ),
    );
    const stylesUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(
        joinPosix(this.context.extensionPath, 'media', 'standalone-scanner.css'),
      ),
    );
    const cspSource = this.panel!.webview.cspSource;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; img-src data: ${cspSource};" />
  <title>Project Eric — Scan Key Code</title>
  <link rel="stylesheet" href="${stylesUri}" />
</head>
<body>
  <header>
    <h1>🛡️ Project Eric — scanKeyCode()</h1>
    <p class="subtitle">
      Reads the user's "key code" right here inside code-server.
      No separate server, no paste-form detour — pure function:
      <code>ProjectEric.scan(code, language)</code>.
    </p>
  </header>

  <section class="actions">
    <button id="fromEditor" type="button">📥 Pull from active editor</button>
    <label>
      Language:
      <select id="language">
        <option value="">auto-detect</option>
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
        <option value="python">Python</option>
        <option value="java">Java</option>
        <option value="php">PHP</option>
        <option value="go">Go</option>
        <option value="rust">Rust</option>
        <option value="ruby">Ruby</option>
        <option value="sql">SQL</option>
        <option value="cpp">C++</option>
        <option value="csharp">C#</option>
        <option value="html">HTML</option>
        <option value="css">CSS</option>
        <option value="mcp">MCP server</option>
      </select>
    </label>
    <button id="scan" type="button" class="primary">🔍 Scan</button>
    <button id="scanMcp" type="button" class="mcp">📡 Scan as MCP</button>
    <span class="spacer"></span>
    <span id="status" class="status"></span>
  </section>

  <section class="panes">
    <textarea id="code" spellcheck="false" placeholder="Paste code or pull from the active editor…"></textarea>
    <aside id="results" aria-live="polite"></aside>
  </section>

  <section class="console">
    <details>
      <summary>DevTools console entrypoint</summary>
      <p>Once this panel is open, run any of these in the browser DevTools (F12):</p>
      <pre>ProjectEric.scan(code, 'javascript')              // scan a string
ProjectEric.scanMcp(code)                           // force MCP rules
ProjectEric.score(scanResult)                       // 0–100 + A–F
ProjectEric.languages()                             // list detected languages</pre>
      <p>The bundled scanner lives at <code>window.ProjectEric</code>.</p>
    </details>
  </section>

  <script src="${scriptUri}"></script>
  <script>
    const vscode = acquireVsCodeApi();
    const codeEl   = document.getElementById('code');
    const langEl   = document.getElementById('language');
    const resultsEl= document.getElementById('results');
    const statusEl = document.getElementById('status');
    const fromEditorBtn = document.getElementById('fromEditor');
    const scanBtn = document.getElementById('scan');
    const scanMcpBtn = document.getElementById('scanMcp');

    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.className = 'status' + (kind ? ' ' + kind : '');
    }

    function severityColour(sev) {
      return ({
        critical: '#dc2626', high: '#ef4444',
        medium:   '#f59e0b', low:  '#eab308',
        info:     '#3b82f6',
      })[sev] || '#9ca3af';
    }

    function renderResult(result) {
      if (!result || !result.findings || result.findings.length === 0) {
        resultsEl.innerHTML =
          '<div class="empty">No findings — clean scan (' +
          escapeHtml(result && result.language || 'unknown') + ')</div>';
        return;
      }
      const score = window.ProjectEric.score(result);
      const heading =
        '<div class="score" style="border-color:' +
        (score.score >= 85 ? '#10b981' :
         score.score >= 70 ? '#84cc16' :
         score.score >= 55 ? '#eab308' :
         score.score >= 40 ? '#f97316' : '#ef4444') +
        ';">' +
          '<div class="big">' + escapeHtml(score.grade) + '</div>' +
          '<div class="num">' + score.score + '/100</div>' +
        '</div>';
      const findingsHtml = result.findings.map(function (f) {
        return '<div class="finding sev-' + f.severity + '" data-id="' + f.id + '">' +
          '<div class="finding-head">' +
            '<span class="badge" style="background:' + severityColour(f.severity) + ';">' + f.severity.toUpperCase() + '</span>' +
            '<strong>' + escapeHtml(f.ruleName) + '</strong>' +
            '<span class="meta">' + escapeHtml(f.ruleId) + ' · ' + escapeHtml(f.category) + ' · L' + (f.line + 1) + ':' + (f.column + 1) + '</span>' +
          '</div>' +
          '<div class="summary">' + escapeHtml(f.summary) + '</div>' +
          (f.fix && (f.fix.title || f.fix.hint)
            ? '<div class="fix"><strong>Fix:</strong> ' + escapeHtml(f.fix.title || f.fix.hint) + '</div>'
            : '') +
        '</div>';
      }).join('');
      resultsEl.innerHTML =
        heading +
        '<div class="finding-list">' + findingsHtml + '</div>';
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function runScan(asMcp) {
      const code = codeEl.value || '';
      if (!code.trim()) {
        setStatus('no code to scan', 'warn');
        return;
      }
      const lang = langEl.value || undefined;
      let result;
      try {
        if (asMcp) {
          result = window.ProjectEric.scanMcp(code, lang ? { minSeverity: 'low' } : {});
        } else if (lang) {
          result = window.ProjectEric.scan(code, lang);
        } else {
          result = window.ProjectEric.scan(code);
        }
      } catch (err) {
        setStatus('scan failed: ' + err, 'err');
        return;
      }
      if (!result || !result.language) {
        setStatus('no rules for this code', 'warn');
        return;
      }
      renderResult(result);
      const counts = result.findings.reduce(function (acc, f) {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.keys(counts).map(function (k) { return counts[k] + ' ' + k; }).join(', ');
      setStatus('scanned (' + result.language + ') · ' + result.findings.length + ' findings' + (summary ? ' (' + summary + ')' : ''), 'ok');
    }

    scanBtn.addEventListener('click', function () { runScan(false); });
    scanMcpBtn.addEventListener('click', function () { runScan(true); });

    fromEditorBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'pullActiveEditor' });
    });

    // Ctrl/Cmd + Enter inside the textarea triggers a scan.
    codeEl.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
        ev.preventDefault();
        runScan(ev.shiftKey);
      }
    });

    window.addEventListener('message', function (ev) {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      switch (msg.type) {
        case 'activeEditorContent':
          if (typeof msg.text === 'string') {
            codeEl.value = msg.text;
            if (msg.languageId) langEl.value = msg.languageId;
            setStatus('pulled ' + msg.fileName + ' from active editor (' + msg.languageId + ')', 'ok');
          } else {
            setStatus('no active editor', 'warn');
          }
          break;
      }
    });
  </script>
</body>
</html>`;
  }

  private async handleMessage(msg: { type?: string }): Promise<void> {
    if (!msg || msg.type !== 'pullActiveEditor') return;
    // Prefer the live active editor; fall back to the last one we saw,
    // because focusing this webview clears `activeTextEditor`.
    const editor = vscode.window.activeTextEditor ?? this.lastTextEditor;
    if (!editor) {
      this.panel?.webview.postMessage({ type: 'activeEditorContent', text: null });
      return;
    }
    const text = editor.document.getText();
    const fileName = editor.document.fileName.split(/[\\/]/).pop() ?? '';
    this.panel?.webview.postMessage({
      type: 'activeEditorContent',
      text,
      languageId: editor.document.languageId,
      fileName,
    });
  }
}
