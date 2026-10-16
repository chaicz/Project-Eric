/**
 * Project Eric — OWASP Security Scanner
 *
 * Extension entry point. Loads the rule packs, scans files on demand
 * (or on save), and surfaces findings through:
 *
 *   - Diagnostics on the editor (squiggly underlines).
 *   - A status-bar item with the live file score.
 *   - An activity-bar container with a tree view of all findings.
 *   - A full-page webview dashboard with score, OWASP coverage,
 *     improvements, and per-file breakdown.
 *
 * Works in desktop VS Code AND vscode.dev thanks to the dual
 * `extensionKind: [ui, workspace]` + `browser` field in package.json.
 */

import * as vscode from 'vscode';

import { joinPosix, basenamePosix } from './util/pathSafe';
import type {
  Finding,
  Improvement,
  ScanResult,
} from './types';
import {
  parsePack,
  parseLanguagePack,
  ingestPack,
  languageIdForFile,
  languageIdForContent,
  getPack,
} from './scanner/packLoader';
import {
  scanCode,
  scanFiles,
  flattenFindings,
} from './scanner/scanner';
import {
  scoreFile,
  scoreWorkspace,
  improvementsFor,
} from './scoring/scoreCalculator';
import { ScoreStatusBar } from './providers/statusBar';
import { SecurityTreeProvider } from './providers/securityTreeProvider';
import { DashboardWebview } from './providers/dashboardWebview';
import type { PayloadValue } from './providers/dashboardWebview';
import { StandaloneScannerWebview } from './providers/standaloneScannerWebview';
import {
  DiagnosticManager,
  createDiagnosticActionProvider,
  createHoverProvider,
} from './diagnostics/diagnosticManager';

// ────────────────────────────────────────────────────────────────────────────
// Activation
// ────────────────────────────────────────────────────────────────────────────

let statusBarItem: ScoreStatusBar;
let treeProvider: SecurityTreeProvider;
let dashboard: DashboardWebview;
let diagnosticManager: DiagnosticManager;
let standaloneScanner: StandaloneScannerWebview;

// In-memory state
const lastScan: Map<string, ScanResult> = new Map();        // uri → result
const findingsByUri: Map<string, Finding[]> = new Map();    // uri → findings
const suppressedFindings: Set<string> = new Set();         // ids hidden by user

let isScanning = false;
let scanPending = false;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Project Eric Security');
  outputChannel.appendLine('Activating Project Eric OWASP Scanner…');

  // 1. Load packs.
  try {
    await loadPacks(context);
  } catch (err) {
    outputChannel.appendLine(`Failed to load packs: ${String(err)}`);
    vscode.window.showErrorMessage(
      `Project Eric: failed to load OWASP pack. Run "Project Eric: Open Security Dashboard" to retry.`,
    );
  }

  // 2. Build the UI components.
  statusBarItem = new ScoreStatusBar();
  treeProvider = new SecurityTreeProvider();
  diagnosticManager = new DiagnosticManager();

  dashboard = new DashboardWebview(context, () => buildDashboardPayload());
  standaloneScanner = new StandaloneScannerWebview(context);

  context.subscriptions.push(
    statusBarItem,
    diagnosticManager,
    // Use createTreeView so the activity bar shield entry stays visible.
    // registerTreeDataProvider alone would auto-mount the view into the
    // Explorer secondary side bar instead of the dedicated
    // projectEric.securityContainer activity bar entry.
    vscode.window.createTreeView('projectEric.securityView', {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    }),
    vscode.languages.registerCodeActionsProvider(
      { scheme: '*' },
      createDiagnosticActionProvider((uri) => findingsByUri.get(uri.toString()) ?? []),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.languages.registerHoverProvider(
      { scheme: '*' },
      createHoverProvider((uri) => findingsByUri.get(uri.toString()) ?? []),
    ),
  );

  // 3. Register commands.
  registerCommands(context);

  // 4. Wire up event listeners.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((ev) => {
      const cfg = vscode.workspace.getConfiguration('projectEric');
      if (cfg.get<boolean>('scanOnType', false)) {
        scheduleScanForFile(ev.document.uri);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const cfg = vscode.workspace.getConfiguration('projectEric');
      if (cfg.get<boolean>('autoScan', true)) {
        scheduleScanForFile(doc.uri);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        statusBarItem.update(null);
        return;
      }
      const result = lastScan.get(editor.document.uri.toString());
      statusBarItem.update(result ? scoreFile(result) : null);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnosticManager.clear(doc.uri);
      lastScan.delete(doc.uri.toString());
      findingsByUri.delete(doc.uri.toString());
      treeProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((ev) => {
      if (ev.affectsConfiguration('projectEric.minSeverity') ||
          ev.affectsConfiguration('projectEric.enabledCategories')) {
        // Re-scan the active file so changes apply immediately.
        const editor = vscode.window.activeTextEditor;
        if (editor) scheduleScanForFile(editor.document.uri);
      }
    }),
  );

  // 5. Initial scan of the active editor (if any).
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    scheduleScanForFile(editor.document.uri);
  }
}

export function deactivate(): void {
  outputChannel?.appendLine('Deactivating Project Eric OWASP Scanner');
  outputChannel?.dispose();
}

// ────────────────────────────────────────────────────────────────────────────
// Pack loading — reads the bundled JSON files from the extension root.
// ────────────────────────────────────────────────────────────────────────────

async function loadPacks(context: vscode.ExtensionContext): Promise<void> {
  const packText = await readExtensionFile(context, ['data', 'owasp-pack.json']);
  const pack = parsePack(packText);
  ingestPack(pack);

  // Per-language packs.
  for (const lang of pack.languages) {
    try {
      const txt = await readExtensionFile(context, ['data', 'languages', `${lang.id}.lang.json`]);
      const parsed = parseLanguagePack(txt);
      // Replace the stub entry from the manifest with the full pack.
      const idx = pack.languages.findIndex((l) => l.id === lang.id);
      if (idx >= 0) pack.languages[idx] = parsed;
    } catch (err) {
      outputChannel.appendLine(`Skipped language pack ${lang.id}: ${String(err)}`);
    }
  }
  ingestPack(pack);
  outputChannel.appendLine(`Loaded OWASP pack with ${pack.globalRules.length} global rules + ${pack.languages.length} language packs`);
}

/**
 * Read a file from the extension's data directory. Uses
 * `vscode.workspace.fs.readFile` which works in both desktop VS Code
 * and vscode.dev (no Node-only APIs).
 */
async function readExtensionFile(context: vscode.ExtensionContext, parts: string[]): Promise<string> {
  const filePath = joinPosix(context.extensionPath, ...parts);
  const uri = vscode.Uri.file(filePath);
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

// ────────────────────────────────────────────────────────────────────────────
// Scanning
// ────────────────────────────────────────────────────────────────────────────

async function scanDocument(doc: vscode.TextDocument): Promise<ScanResult | null> {
  const lang = languageIdForFile(doc.uri.fsPath || doc.uri.toString(), getPack());
  if (!lang) return null; // unsupported language

  const cfg = vscode.workspace.getConfiguration('projectEric');
  const minSeverity = cfg.get<string>('minSeverity', 'low') as Finding['severity'];
  const skipCategories = (cfg.get<string[]>('enabledCategories', []) ?? [])
    .filter((c) => !['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'].includes(c))
    .map(String);

  const text = doc.getText();
  const result = scanCode({
    uri: doc.uri.toString(),
    language: lang,
    text,
    minSeverity: minSeverity ?? 'low',
    skipCategories,
  });
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// scanKeyCode — the canonical "function inside code-server"
//
// The previous "MCP Security Scanner" flow ran as a standalone web app
// (the React OWASP Analysis page) that the user pasted code into. That
// server-style flow is gone. The scanner is now a single, first-class
// function that lives inside code-server itself:
//
//   const result = await scanKeyCode(activeEditor.document);
//
// It reads whatever file the user has open (their "key code"), runs the
// OWASP pack against it, and returns a ScanResult. The command wrapper
// `projectEric.security.scanKeyCode` below calls this function, surfaces
// the findings as diagnostics + status-bar score + dashboard update,
// and pops a summary notification. Bind it to Ctrl+Shift+K (default)
// or invoke it from the command palette.
//
// Pure function: no UI side effects, no module-level state. Safe to
// call from other extensions, code-server tasks, or your own commands.
// ────────────────────────────────────────────────────────────────────────────

export async function scanKeyCode(doc: vscode.TextDocument): Promise<ScanResult | null> {
  return scanDocument(doc);
}

/**
 * Variant of `scanKeyCode` that forces the MCP-server language pack,
 * regardless of file extension. Useful for `.ts` / `.py` files that
 * import `@modelcontextprotocol/sdk` — we still want to apply the MCP
 * rules on top of the normal language rules.
 *
 * Implementation: temporarily injects the file's path as
 * `<basename>.mcp.<ext>` so the extension matcher picks the MCP pack.
 * Pure function — does not mutate the pack cache permanently.
 */
export async function scanKeyCodeAsMcp(doc: vscode.TextDocument): Promise<ScanResult | null> {
  const lang = languageIdForFile(doc.uri.fsPath || doc.uri.toString(), getPack());
  if (!lang) return null;
  // Force the scanner to treat the file as MCP. The path override only
  // affects pack lookup, not the editor's URI.
  const fakePath = (doc.uri.fsPath || doc.uri.toString()) + '.mcp';
  const result = await scanDocumentWithLangOverride(doc, fakePath);
  return result;
}

async function scanDocumentWithLangOverride(
  doc: vscode.TextDocument,
  pathForLanguageLookup: string,
): Promise<ScanResult | null> {
  const lang = languageIdForFile(pathForLanguageLookup, getPack());
  if (!lang) return null;
  const cfg = vscode.workspace.getConfiguration('projectEric');
  const minSeverity = cfg.get<string>('minSeverity', 'low') as Finding['severity'];
  const skipCategories = (cfg.get<string[]>('enabledCategories', []) ?? [])
    .filter((c) => !['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'].includes(c))
    .map(String);
  const text = doc.getText();
  return scanCode({
    uri: doc.uri.toString(),
    language: lang,
    text,
    minSeverity: minSeverity ?? 'low',
    skipCategories,
  });
}

function scheduleScanForFile(uri: vscode.Uri): void {
  if (isScanning) {
    scanPending = true;
    return;
  }
  void scanFileNow(uri);
}

async function scanFileNow(uri: vscode.Uri): Promise<void> {
  isScanning = true;
  try {
    statusBarItem.showProgress('Scanning…');
    const doc = await vscode.workspace.openTextDocument(uri);
    const result = await scanDocument(doc);
    if (!result) return;

    lastScan.set(uri.toString(), result);
    findingsByUri.set(
      uri.toString(),
      result.findings.filter((f) => !suppressedFindings.has(f.id)),
    );
    diagnosticManager.update(uri, result.findings);
    statusBarItem.update(scoreFile(result));
    treeProvider.refresh();
    dashboard.pushUpdate();
  } catch (err) {
    outputChannel.appendLine(`Scan failed for ${uri.toString()}: ${String(err)}`);
  } finally {
    isScanning = false;
    if (scanPending) {
      scanPending = false;
      const editor = vscode.window.activeTextEditor;
      if (editor) scheduleScanForFile(editor.document.uri);
    }
  }
}

async function scanWorkspaceNow(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('projectEric');
  const excludes = cfg.get<string[]>('excludePatterns', []);
  const enabled = cfg.get<string[]>('languages', []);

  const files = await vscode.workspace.findFiles(
    '**/*',
    excludes.length ? `{${excludes.join(',')}}` : undefined,
    500, // cap so the UI stays responsive in large repos
  );

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Project Eric — scanning workspace',
      cancellable: true,
    },
    async (progress, token) => {
      const pack = getPack();
      const inputs: Array<{ uri: string; language: string; text: string }> = [];
      for (const file of files) {
        if (token.isCancellationRequested) break;
        const lang = languageIdForFile(file.fsPath, pack);
        if (!lang || !enabled.includes(lang)) continue;
        try {
          const bytes = await vscode.workspace.fs.readFile(file);
          const text = new TextDecoder().decode(bytes);
          inputs.push({ uri: file.toString(), language: lang, text });
        } catch {
          // skip unreadable files
        }
      }

      const minSeverity = cfg.get<string>('minSeverity', 'low') as Finding['severity'];
      const skipCategories = (cfg.get<string[]>('enabledCategories', []) ?? [])
        .filter((c) => !['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'].includes(c))
        .map(String);

      const results = await scanFiles(
        inputs,
        { minSeverity, skipCategories },
        (done, total, current) =>
          progress.report({ message: `${done}/${total} — ${basenamePosix(current || '')}`, increment: (done / total) * 100 }),
      );

      // Persist results.
      lastScan.clear();
      findingsByUri.clear();
      for (const r of results) {
        lastScan.set(r.uri, r);
        findingsByUri.set(r.uri, r.findings.filter((f) => !suppressedFindings.has(f.id)));
        const uri = vscode.Uri.parse(r.uri);
        diagnosticManager.update(uri, r.findings);
      }

      treeProvider.setResults(scoreWorkspace(results), results);
      dashboard.pushUpdate();

      const editor = vscode.window.activeTextEditor;
      if (editor) statusBarItem.update(scoreFile(lastScan.get(editor.document.uri.toString()) ?? results[0]));

      vscode.window.showInformationMessage(
        `Project Eric: scanned ${results.length} files · ${flattenFindings(results).length} findings`,
      );
    },
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Commands
// ────────────────────────────────────────────────────────────────────────────

function registerCommands(context: vscode.ExtensionContext): void {
  const disposable = [
    vscode.commands.registerCommand('projectEric.security.scanFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Project Eric: open a file to scan.');
        return;
      }
      await scanFileNow(editor.document.uri);
    }),

    // The canonical in-code-server scanner. Reads the active file (the
    // user's "key code") and surfaces findings as a function. Bound to
    // Ctrl+Shift+K by default; can be invoked from any UI via the
    // `projectEric.security.scanKeyCode` command id.
    vscode.commands.registerCommand('projectEric.security.scanKeyCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          'Project Eric scanKeyCode(): open a file in the editor first.',
        );
        return;
      }
      const result = await scanKeyCode(editor.document);
      if (!result) {
        vscode.window.showInformationMessage(
          `Project Eric scanKeyCode(): no rules for ${editor.document.languageId} yet — pick a supported language or open a workspace.`,
        );
        return;
      }

      // Pipe the result through the existing in-editor UI: diagnostics,
      // status-bar score, tree view, dashboard. This keeps the existing
      // surface (squigglies + score + dashboard) in sync without any
      // extra plumbing.
      lastScan.set(result.uri, result);
      findingsByUri.set(
        result.uri,
        result.findings.filter((f) => !suppressedFindings.has(f.id)),
      );
      diagnosticManager.update(editor.document.uri, result.findings);
      statusBarItem.update(scoreFile(result));
      treeProvider.refresh();
      dashboard.pushUpdate();

      // Concise summary notification.
      const file = basenamePosix(editor.document.uri.fsPath || editor.document.uri.toString());
      const total = result.findings.length;
      const critical = result.findings.filter((f) => f.severity === 'critical').length;
      const high = result.findings.filter((f) => f.severity === 'high').length;
      if (total === 0) {
        vscode.window.showInformationMessage(
          `scanKeyCode() · ${file} · clean (0 findings)`,
        );
      } else {
        const sev = [
          critical ? `${critical} critical` : null,
          high ? `${high} high` : null,
        ].filter(Boolean).join(', ');
        const pick = await vscode.window.showWarningMessage(
          `scanKeyCode() · ${file} · ${total} finding${total === 1 ? '' : 's'}${sev ? ' (' + sev + ')' : ''}`,
          'Open Problems',
          'Open Dashboard',
        );
        if (pick === 'Open Problems') {
          await vscode.commands.executeCommand('workbench.actions.view.problems');
        } else if (pick === 'Open Dashboard') {
          dashboard.show();
        }
      }
    }),

    vscode.commands.registerCommand('projectEric.security.scanWorkspace', () => scanWorkspaceNow()),

    // MCP-specific function. Reads the active file as MCP server code
    // and runs the MCP OWASP rules. Use this instead of the standalone
    // "MCP Security Scanner" extension — it's the same rules but lives
    // entirely inside code-server as a callable function.
    // The id is `scanMcpServer` for backward-compat; the more
    // descriptive `scanKeyCodeAsMcp` is also registered as an alias.
    vscode.commands.registerCommand('projectEric.security.scanMcpServer', async () => {
      return runScanKeyCodeAsMcp();
    }),
    vscode.commands.registerCommand('projectEric.security.scanKeyCodeAsMcp', async () => {
      return runScanKeyCodeAsMcp();
    }),

    vscode.commands.registerCommand('projectEric.security.openDashboard', () => dashboard.show()),

    // Open the standalone scanner — a code-server webview that loads
    // the bundled `dist/project-eric-scanner.min.js` and exposes
    // `window.ProjectEric.scan(...)`. This is the function form:
    // reads user code from the active editor and shows findings
    // inline. Replaces the old MCP Security Scanner server UI.
    vscode.commands.registerCommand('projectEric.security.openStandaloneScanner', () => {
      standaloneScanner.show();
    }),

    vscode.commands.registerCommand('projectEric.security.refresh', () => {
      treeProvider.refresh();
      dashboard.pushUpdate();
    }),

    vscode.commands.registerCommand('projectEric.security.toggleAutoscan', async () => {
      const cfg = vscode.workspace.getConfiguration('projectEric');
      const current = cfg.get<boolean>('autoScan', true);
      await cfg.update('autoScan', !current, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(
        `Project Eric: auto-scan on save is now ${!current ? 'ON' : 'OFF'}.`,
      );
    }),

    vscode.commands.registerCommand('projectEric.security.applyFix', async (findingId?: string) => {
      if (!findingId) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const findings = findingsByUri.get(editor.document.uri.toString()) ?? [];
        const f = findings[0]; // simple fallback
        if (f) findingId = f.id;
      }
      if (!findingId) return;
      const finding = findFindingById(findingId);
      if (!finding || !finding.fix?.replacement) {
        vscode.window.showInformationMessage('Project Eric: no auto-fix available for that finding.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(finding.uri));
      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(
        finding.line, finding.column,
        finding.line, finding.column + finding.matchText.length,
      );
      edit.replace(doc.uri, range, finding.fix.replacement);
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(`Project Eric: applied fix for ${finding.ruleName}.`);
    }),

    vscode.commands.registerCommand('projectEric.security.markFalsePositive', (findingId?: string) => {
      if (!findingId) return;
      suppressedFindings.add(findingId);
      treeProvider.suppressFinding(findingId);
      // Re-render the dashboard so the suppressed item disappears.
      dashboard.pushUpdate();
    }),

    vscode.commands.registerCommand('projectEric.security.openDocs', async (findingId?: string) => {
      const finding = findingId ? findFindingById(findingId) : null;
      const url = finding
        ? `https://owasp.org/Top10/${finding.category}/`
        : 'https://owasp.org/Top10/';
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand('projectEric.security.showFix', (finding: Finding) => {
      vscode.window.showInformationMessage(
        `${finding.ruleName}: ${finding.fix?.hint ?? finding.fix?.title ?? 'No fix available'}`,
        { modal: false },
      );
    }),
  ];
  context.subscriptions.push(...disposable);
}

function findFindingById(id: string): Finding | null {
  for (const list of findingsByUri.values()) {
    const hit = list.find((f) => f.id === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * The shared handler behind both `projectEric.security.scanMcpServer`
 * and `projectEric.security.scanKeyCodeAsMcp`. Reads the active file
 * (the user's "key code"), runs the MCP OWASP rules on it, and
 * surfaces the findings inline via diagnostics, status bar, tree view,
 * and dashboard. A summary notification closes the loop.
 */
async function runScanKeyCodeAsMcp(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      'Project Eric scanKeyCodeAsMcp(): open a .ts / .js / .py file that imports the MCP SDK first.',
    );
    return;
  }
  const result = await scanKeyCodeAsMcp(editor.document);
  if (!result) {
    vscode.window.showInformationMessage(
      'Project Eric scanKeyCodeAsMcp(): no rules available yet.',
    );
    return;
  }
  lastScan.set(result.uri, result);
  findingsByUri.set(
    result.uri,
    result.findings.filter((f) => !suppressedFindings.has(f.id)),
  );
  diagnosticManager.update(editor.document.uri, result.findings);
  statusBarItem.update(scoreFile(result));
  treeProvider.refresh();
  dashboard.pushUpdate();

  const file = basenamePosix(editor.document.uri.fsPath || editor.document.uri.toString());
  const total = result.findings.length;
  if (total === 0) {
    vscode.window.showInformationMessage(`scanKeyCodeAsMcp() · ${file} · clean (0 findings)`);
    return;
  }
  const critical = result.findings.filter((f) => f.severity === 'critical').length;
  const high = result.findings.filter((f) => f.severity === 'high').length;
  const sev = [critical ? `${critical} critical` : null, high ? `${high} high` : null]
    .filter(Boolean)
    .join(', ');
  const pick = await vscode.window.showWarningMessage(
    `scanKeyCodeAsMcp() · ${file} · ${total} MCP finding${total === 1 ? '' : 's'}${sev ? ' (' + sev + ')' : ''}`,
    'Open Problems',
    'Open Dashboard',
  );
  if (pick === 'Open Problems') {
    await vscode.commands.executeCommand('workbench.actions.view.problems');
  } else if (pick === 'Open Dashboard') {
    dashboard.show();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard payload builder
// ────────────────────────────────────────────────────────────────────────────

function buildDashboardPayload(): PayloadValue | null {
  const results = Array.from(lastScan.values());
  if (results.length === 0) return null;
  const ws = scoreWorkspace(results);
  const findings = flattenFindings(results).filter((f) => !suppressedFindings.has(f.id));
  const improvements: Improvement[] = improvementsFor(findings);
  const files = results.map(scoreFile);
  return { workspace: ws, files, findings, improvements };
}