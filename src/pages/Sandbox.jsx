import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Play,
  Loader2,
  Eye,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Download,
  Upload,
  Globe,
  ShieldCheck,
  Terminal as TerminalIcon,
  Zap,
  FileCode,
  Folder,
  Save,
  Bot,
  Send,
  X,
  ChevronRight,
  ChevronDown,
  File,
  FilePlus,
  FolderPlus,
  Search,
  Sparkle,
  MessageSquare,
  Wand2,
  AlertCircle,
  AlertTriangle,
  Info,
  HardDrive,
  Cpu,
  Code,
  Code2,
  Pencil,
  MoreVertical,
  FolderOpen,
  ListTree,
  ShieldAlert,
  KeyRound,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import {
  LANGUAGES,
  TEMPLATES,
  RUNNERS,
  SANDBOX_BRIDGE_ONLY,
  inlineLocalAssets,
  languageFromName,
  runAllLanguageTests,
} from '../services/codeRunner';
import {
  callAI,
  hasAIKey,
  getAIConfig,
  generateFix,
  suggestBuildImprovements,
  extractCodeBlock,
} from '../services/aiService';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';

// ---------------------------------------------------------------------------
// File-system model
// ---------------------------------------------------------------------------
//
// A "project" is a tree of nodes:
//   { id, name, type: 'folder' | 'file', language?, content?, children? }
//
// We keep everything in localStorage so refreshes don't lose work. New
// projects are seeded with a small multi-file demo (HTML + CSS + JS).
// ---------------------------------------------------------------------------

const LS_KEY = 'project-eric_sandbox_project_v1';

const buildSeedProject = () => ({
  id: 'root',
  name: 'my-app',
  type: 'folder',
  expanded: true,
  children: [
    {
      id: 'index-html',
      name: 'index.html',
      type: 'file',
      language: 'html',
      content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>My App</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="card">
    <h1>Hello, sandbox 👋</h1>
    <p>Edit any file in the explorer on the left. Click <b>Run</b> to preview.</p>
    <button id="ping">Ping</button>
    <pre id="out"></pre>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
    },
    {
      id: 'styles-css',
      name: 'styles.css',
      type: 'file',
      language: 'css',
      content: `body {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
}

.card {
  background: white;
  padding: 32px;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,.3);
  text-align: center;
  max-width: 480px;
  width: 90%;
}

button {
  background: #667eea;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: transform .15s;
}
button:hover { transform: translateY(-2px); }

pre { background: #f1f5f9; padding: 12px; border-radius: 8px; text-align: left; }`,
    },
    {
      id: 'app-js',
      name: 'app.js',
      type: 'file',
      language: 'javascript',
      content: `// app.js
const out = document.getElementById('out');
const btn = document.getElementById('ping');

function log(...args) {
  out.textContent += args.map((a) =>
    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
  ).join(' ') + '\\n';
}

log('Script loaded at', new Date().toLocaleTimeString());

btn.addEventListener('click', () => {
  log('Ping at', Date.now());
});

console.log('app.js ready');`,
    },
  ],
});

const loadProject = () => {
  try {
    const parsed = readUserScoped(LS_KEY, null);
    if (!parsed) return buildSeedProject();
    return parsed;
  } catch {
    return buildSeedProject();
  }
};

const saveProject = (tree) => {
  try { writeUserScoped(LS_KEY, tree); } catch {}
};

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------
//
// Every language in the IDE is described here. `canRun` is one of:
//   true     — executes in a sandboxed iframe
//   'partial'— runs a lightweight check (parse, syntax) in the browser
//   false    — preview only, browser can't execute it
//
// `runner` is the id of the function in `RUNNERS` below that knows how to
// turn the file's content into output (logs, an HTML preview, or both).
//
// NOTE: LANGUAGES, TEMPLATES, RUNNERS, SANDBOX_BRIDGE_ONLY and
// runAllLanguageTests live in `../services/codeRunner.js` and are imported
// at the top of this file. Do not redeclare them here.
// ---------------------------------------------------------------------------

// Quick "Quick template" catalog per language. User picks one in the
// "New file" dialog. Templates are filled in verbatim and tagged with
// their language. (Imported from codeRunner.js above.)

// ---------------------------------------------------------------------------
// Per-language runners
// ---------------------------------------------------------------------------
//
// Each runner receives `{ file, allFiles, addLog }` and returns one of:
//   { kind: 'html',  html }          — load `html` in the preview iframe
//   { kind: 'logs' }                 — already wrote to `addLog`
//   { kind: 'silent' }               — no-op (used for the source-only case)
//
// `addLog(type, message)` appends a console line. The console panel already
// shows those lines, and we still flip the preview tab to 'console' so the
// user sees something happened.
//
// NOTE: RUNNERS and SANDBOX_BRIDGE_ONLY are imported from codeRunner.js
// at the top of this file. The local RUNNERS and SANDBOX_BRIDGE_ONLY
// blocks that used to live here have been removed; the imports are the
// canonical source.
// ---------------------------------------------------------------------------

// Helper: HTML-escape a string for safe interpolation into preview HTML.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Build a preview shell: header + dark code panel + clear labels. Used by
// the source-only path so the user always sees *something* when they click
// Run on a file the browser cannot execute.
const sourceOnlyPreview = (file, language) => {
  const head = LANGUAGES[language] || LANGUAGES.text;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body { margin: 0; font: 13px/1.5 ui-monospace, Menlo, monospace; background: #0f172a; color: #e2e8f0; }
  .banner { display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: linear-gradient(90deg, #1e293b, #0f172a); border-bottom: 1px solid #1e293b; }
  .banner .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
  .banner .title { font-weight: 600; }
  .banner .sub { color: #94a3b8; font-size: 12px; }
  pre { margin: 0; padding: 20px; white-space: pre-wrap; word-break: break-word; color: #e2e8f0; }
  .hl-kw { color: #60a5fa; }
  .hl-str { color: #34d399; }
  .hl-com { color: #64748b; font-style: italic; }
</style></head>
<body>
  <div class="banner">
    <div class="dot"></div>
    <div>
      <div class="title">${esc(head.icon)} ${esc(head.label)} — preview only</div>
      <div class="sub">${esc(head.description)}</div>
    </div>
  </div>
  <pre id="code">${esc(file.content || '(empty file)')}</pre>
  <script>
    // Light-touch syntax tint (keywords + strings + comments).
    (function () {
      var el = document.getElementById('code');
      var html = el.textContent;
      html = html.replace(/(\/\/[^\n]*)/g, '<span class="hl-com">$1</span>');
      html = html.replace(/("[^"]*"|'[^']*'|\`[^\`]*\`)/g, '<span class="hl-str">$1</span>');
      el.innerHTML = html;
      parent.postMessage({ __sandboxLog: true, level: 'warn', message: '⚠ ' + ${JSON.stringify(head.label)} + ' cannot run in the browser. Showing source preview.' }, '*');
      parent.postMessage({ __sandboxLog: true, level: 'log',   message: 'To execute this file, use a matching local toolchain or backend runner.' }, '*');
      parent.postMessage({ __sandboxDone: true, ok: true }, '*');
    })();
  </script>
</body></html>`;
};

// Build an in-memory index of all files in the tree.
const flatten = (nodes, parents = []) => {
  const out = [];
  for (const n of nodes || []) {
    const path = [...parents, n.name].join('/');
    if (n.type === 'file') out.push({ ...n, path });
    if (n.children) out.push(...flatten(n.children, [...parents, n.name]));
  }
  return out;
};

// Recursive helpers (immutable updates) -----------------------------------

const mapTree = (nodes, fn, parents = []) => {
  return (nodes || []).map((n) => {
    const updated = fn(n, [...parents, n.name]);
    if (updated?.children) {
      return { ...updated, children: mapTree(updated.children, fn, [...parents, updated.name]) };
    }
    return updated;
  });
};

const updateNode = (tree, id, updater) =>
  ({ ...tree, children: mapTree(tree.children, (n) => n.id === id ? updater(n) : n) });

const addNode = (tree, parentId, node) =>
  ({ ...tree, children: mapTree(tree.children, (n) => {
    if (n.id === parentId && n.type === 'folder') {
      return { ...n, expanded: true, children: [...(n.children || []), node] };
    }
    return n;
  })});

const removeNode = (tree, id) => {
  const strip = (nodes) => (nodes || []).flatMap((n) => {
    if (n.id === id) return [];
    if (n.children) return [{ ...n, children: strip(n.children) }];
    return [n];
  });
  return { ...tree, children: strip(tree.children) };
};

// ---------------------------------------------------------------------------
// Sandboxed iframe runner
// ---------------------------------------------------------------------------

const SANDBOX_RUNNER_HTML = (files) => {
  // Inline every file into a single HTML document so external script/css
  // references inside the user's code resolve. Then run JS in a way that
  // mirrors the original Sandbox (console → postMessage, error capture).
  const html = files.find((f) => f.name.endsWith('.html'))?.content || '';
  const css  = files.find((f) => f.name.endsWith('.css'))?.content || '';
  const js   = files.find((f) => /\.(js|mjs|cjs)$/.test(f.name))?.content || '';

  // If the user wrote a full HTML doc, inject our console bridge before </body>.
  let body = html;
  if (!body.trim()) {
    body = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Preview</title></head><body><pre id="log"></pre></body></html>`;
  }
  // Resolve `<script src>` / `<link href>` against the project files —
  // inside a srcdoc iframe they would otherwise be fetched from the dev
  // server, which answers with the app's HTML.
  const resolved = inlineLocalAssets(body, files);
  body = resolved.html;
  const alreadyInlined = new Set(resolved.inlined);
  if (css && !alreadyInlined.has(css.name)) {
    body = body.replace(/<\/head>/i, `<style>${css}</style></head>`);
  }
  const bridge = `
<script>
(function () {
  var logEl = document.getElementById('log');
  function stamp() { return new Date().toTimeString().slice(0,8); }
  function render(level, args) {
    if (!logEl) return;
    var text = Array.from(args).map(function (a) {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch (e) { return String(a); } }
      return String(a);
    }).join(' ');
    var div = document.createElement('div');
    div.className = 'log-line log-' + level;
    div.innerHTML = '<span class="stamp">' + stamp() + '</span>' + text;
    logEl.appendChild(div);
  }
  function send(level, args) {
    try {
      var parts = [];
      for (var i = 0; i < args.length; i++) {
        var v = args[i];
        if (v === null) parts.push('null');
        else if (v === undefined) parts.push('undefined');
        else if (typeof v === 'object') { try { parts.push(JSON.stringify(v, null, 2)); } catch (e) { parts.push(String(v)); } }
        else parts.push(String(v));
      }
      parent.postMessage({ __sandboxLog: true, level: level, message: parts.join(' ') }, '*');
    } catch (e) {}
  }
  var oLog = console.log, oErr = console.error, oWarn = console.warn, oInfo = console.info;
  console.log   = function () { send('log',   arguments); try { render('log',   arguments); } catch (e) { try { oLog.apply(console, arguments); } catch (e2) {} } };
  console.error = function () { send('error', arguments); try { render('error', arguments); } catch (e) { try { oErr.apply(console, arguments); } catch (e2) {} } };
  console.warn  = function () { send('warn',  arguments); try { render('warn',  arguments); } catch (e) { try { oWarn.apply(console, arguments); } catch (e2) {} } };
  console.info  = function () { send('info',  arguments); try { render('info',  arguments); } catch (e) { try { oInfo.apply(console, arguments); } catch (e2) {} } };
  window.addEventListener('error', function (e) {
    parent.postMessage({ __sandboxLog: true, level: 'error', message: (e.error && e.error.stack) || e.message }, '*');
  });
  window.addEventListener('unhandledrejection', function (e) {
    parent.postMessage({ __sandboxLog: true, level: 'error', message: 'Unhandled promise rejection: ' + ((e.reason && e.reason.stack) || e.reason) }, '*');
  });
  parent.postMessage({ __sandboxReady: true }, '*');
})();
</script>
<style>
  body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
  .log-line { padding: 2px 8px; border-left: 3px solid transparent; white-space: pre-wrap; }
  .log-log   { background: #f1f5f9; border-color: #94a3b8; }
  .log-info  { background: #dbeafe; border-color: #3b82f6; color: #1e3a8a; }
  .log-warn  { background: #fef3c7; border-color: #f59e0b; color: #78350f; }
  .log-error { background: #fee2e2; border-color: #ef4444; color: #7f1d1d; }
  .stamp { color: #94a3b8; margin-right: 8px; }
</style>`;
  body = body.replace(/<\/body>/i, `${bridge}</body>`);

  // Run JS after DOM ready.
  if (js && js.trim()) {
    body = body.replace(/<\/body>/i, `<script>
(function () { function run() { try { ${js} } catch (e) { parent.postMessage({ __sandboxLog: true, level: 'error', message: (e && e.stack) || String(e) }, '*'); } parent.postMessage({ __sandboxDone: true, ok: true }, '*'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
</script></body>`);
  } else {
    body = body.replace(/<\/body>/i, `<script>parent.postMessage({ __sandboxDone: true, ok: true }, '*');</script></body>`);
  }
  return body;
};

// ---------------------------------------------------------------------------
// File tree renderer
// ---------------------------------------------------------------------------

const FileTree = ({ items, depth, activeId, expanded, onToggle, onOpen, onAddFile, onAddFolder, onRename, onDelete }) => (
  <>
    {items.map((item) => {
      const isOpen = expanded.includes(item.id);
      const isActive = activeId === item.id;
      const langMeta = item.type === 'file' ? (LANGUAGES[item.language || languageFromName(item.name)] || LANGUAGES.text) : null;
      return (
        <div key={item.id}>
          <div
            className={`group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer text-sm transition-colors ${
              isActive ? 'bg-blue-500/15 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onDoubleClick={() => item.type === 'file' && onOpen(item.id)}
            onClick={() => item.type === 'folder' ? onToggle(item.id) : onOpen(item.id)}
          >
            {item.type === 'folder' ? (
              isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            ) : <span className="w-3.5" />}
            {item.type === 'folder' ? (
              <Folder className={`w-4 h-4 ${isOpen ? 'text-amber-500' : 'text-amber-400'}`} />
            ) : (
              <span className="w-4 h-4 inline-flex items-center justify-center text-[11px]" title={langMeta?.label}>{langMeta?.icon || '📄'}</span>
            )}
            <span className="flex-1 truncate">{item.name}</span>
            <div className="hidden group-hover:flex items-center gap-0.5">
              {item.type === 'folder' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddFile(item.id); }}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                    title="New file"
                  >
                    <FilePlus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddFolder(item.id); }}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                    title="New folder"
                  >
                    <FolderPlus className="w-3 h-3" />
                  </button>
                </>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onRename(item); }}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                title="Rename"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                className="p-1 hover:bg-red-100 rounded text-slate-500 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          {item.type === 'folder' && item.children && isOpen && (
            <FileTree
              items={item.children}
              depth={depth + 1}
              activeId={activeId}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
              onAddFile={onAddFile}
              onAddFolder={onAddFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          )}
        </div>
      );
    })}
  </>
);

// ---------------------------------------------------------------------------
// Language tests panel (OWASP-style findings)
// ---------------------------------------------------------------------------

const STATUS_VISUAL = {
  pass:    { dot: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Pass' },
  warning: { dot: 'bg-amber-500',   text: 'text-amber-700',   chip: 'bg-amber-100 text-amber-700 border-amber-200',     label: 'Warning' },
  fail:    { dot: 'bg-red-500',     text: 'text-red-700',     chip: 'bg-red-100 text-red-700 border-red-200',           label: 'Fail' },
};

const SEVERITY_VISUAL = {
  critical: { bg: 'bg-red-100 text-red-700' },
  high:     { bg: 'bg-orange-100 text-orange-700' },
  medium:   { bg: 'bg-amber-100 text-amber-700' },
  low:      { bg: 'bg-blue-100 text-blue-700' },
  info:     { bg: 'bg-slate-100 text-slate-600' },
};

const LanguageTestsPanel = ({ results, isRunning, filter, onFilter, onRun, onStop, total }) => {
  const items = results?.results || [];
  const filtered = filter === 'all' ? items : items.filter((r) => r.status === filter);
  const passCount = items.filter((r) => r.status === 'pass').length;
  const warnCount = items.filter((r) => r.status === 'warning').length;
  const failCount = items.filter((r) => r.status === 'fail').length;

  return (
    <div className="h-full flex bg-slate-50">
      {/* Left summary column */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 p-4 overflow-auto bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-violet-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Language test sweep</span>
        </div>

        <div className="mb-4">
          <button
            onClick={isRunning ? onStop : onRun}
            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white'
            }`}
          >
            {isRunning ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Stop ({items.length}/{total})</>
            ) : (
              <><Play className="w-4 h-4" /> Run all language tests</>
            )}
          </button>
        </div>

        {results ? (
          <>
            {/* Score ring */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                  <circle cx="40" cy="40" r="34" stroke="#e2e8f0" strokeWidth="8" fill="none" />
                  <circle
                    cx="40" cy="40" r="34"
                    stroke={results.score >= 80 ? '#10b981' : results.score >= 65 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8" fill="none"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - results.score / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-lg font-bold ${
                    results.score >= 80 ? 'text-emerald-600' :
                    results.score >= 65 ? 'text-amber-600' : 'text-red-600'
                  }`}>{results.score}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  results.summary === 'Low Risk' ? 'bg-emerald-100 text-emerald-700' :
                  results.summary === 'Medium Risk' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {results.summary}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  {items.length} of {total} languages tested
                </div>
              </div>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="text-lg font-bold text-emerald-600">{passCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-700">Pass</div>
              </div>
              <div className="text-center py-2 rounded-lg bg-amber-50 border border-amber-100">
                <div className="text-lg font-bold text-amber-600">{warnCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-amber-700">Warn</div>
              </div>
              <div className="text-center py-2 rounded-lg bg-red-50 border border-red-100">
                <div className="text-lg font-bold text-red-600">{failCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-red-700">Fail</div>
              </div>
            </div>

            {/* Filter chips */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Filter</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: `All (${items.length})` },
                  { id: 'pass', label: `Pass (${passCount})` },
                  { id: 'warning', label: `Warn (${warnCount})` },
                  { id: 'fail', label: `Fail (${failCount})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onFilter(f.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      filter === f.id
                        ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 text-[10px] text-slate-400 leading-relaxed">
              Each test loads a built-in sample through the matching language runner and reports pass / warning / fail in the same shape as the OWASP Analysis page.
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-500 leading-relaxed">
            Click <strong>Run all language tests</strong> to verify which coding types actually execute in this IDE. Languages that need a backend toolchain (Python, Java, C++, …) will surface as <em>Pass</em> with a preview-only status, while browser-native ones (HTML, CSS, JS, JSON, Markdown) execute live in a sandboxed iframe.
          </div>
        )}
      </div>

      {/* Right findings list */}
      <div className="flex-1 overflow-auto p-4">
        {!results && !isRunning && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
            <ShieldCheck className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm font-medium text-slate-500">No language tests yet</p>
            <p className="text-xs mt-1 max-w-xs">Click <strong>Run all language tests</strong> on the left to verify every supported coding type.</p>
          </div>
        )}

        {isRunning && items.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="w-8 h-8 mb-2 animate-spin text-violet-500" />
            <p className="text-sm">Starting language sweep…</p>
          </div>
        )}

        <div className="space-y-2.5">
          {filtered.map((r) => {
            const sv = STATUS_VISUAL[r.status] || STATUS_VISUAL.fail;
            const sev = SEVERITY_VISUAL[r.severity] || SEVERITY_VISUAL.info;
            return (
              <div key={r.langId} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3 p-3.5">
                  <div className={`w-2 h-2 rounded-full ${sv.dot} flex-shrink-0 ${r.status === 'pass' ? '' : 'animate-pulse'}`} />
                  <span className="text-xl flex-shrink-0">{r.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{r.label}</span>
                      <span className="font-mono text-[10px] text-slate-400">.{r.ext}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${sev.bg}`}>
                        {r.severity}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${sv.chip}`}>
                        {sv.label}
                      </span>
                      {r.canRun === 'partial' && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          browser check
                        </span>
                      )}
                      {r.canRun === false && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          preview only
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-1 leading-relaxed">{r.message}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{r.duration}ms</div>
                </div>
                {r.output && (
                  <details className="border-t border-slate-100 bg-slate-50">
                    <summary className="px-3.5 py-2 text-[11px] font-medium text-slate-500 cursor-pointer hover:bg-slate-100">
                      Show runner log
                    </summary>
                    <pre className="px-3.5 pb-3 text-[11px] font-mono text-slate-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-auto">
                      {r.output}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>

        {results && !isRunning && filtered.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-8">
            No languages match this filter.
          </div>
        )}

        {isRunning && items.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-violet-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Testing {items.length + 1} / {total}…
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AI assistant panel
// ---------------------------------------------------------------------------

const AssistantPanel = ({
  file,
  files,
  onApplyFix,
  onApplyCreate,
  showToast,
}) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi! I can help you with this project.\n\n• Ask me to explain or refactor the current file\n• Ask for a security review\n• Ask for build-quality improvements across all files\n\nAdd your AI key in **AI API Keys → AI Provider** if I cannot reach the model yet.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content) return;
    if (!hasAIKey()) {
      showToast('Add an AI key in AI API Keys → AI Provider first', 'error');
      return;
    }
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await callAI(
        next.filter((m) => m.role !== 'system'),
        { signal: controller.signal, temperature: 0.3, maxTokens: 1500 },
      );
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `⚠ ${e.message}` }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const improveCurrentFile = async () => {
    if (!file) return showToast('No file open', 'error');
    if (!hasAIKey()) return showToast('Add an AI key in AI API Keys → AI Provider', 'error');
    setBusy(true);
    try {
      const reply = await generateFix({
        code: file.content || '',
        language: file.language || languageFromName(file.name),
        findings: [],
      });
      const fixed = extractCodeBlock(reply);
      setMessages((m) => [
        ...m,
        { role: 'user', content: `Improve ${file.name}` },
        { role: 'assistant', content: reply, action: { kind: 'fix', code: fixed, fileId: file.id } },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const reviewProject = async () => {
    if (!files.length) return showToast('No files in project', 'error');
    if (!hasAIKey()) return showToast('Add an AI key in AI API Keys → AI Provider', 'error');
    setBusy(true);
    try {
      const reply = await suggestBuildImprovements({ files });
      setMessages((m) => [
        ...m,
        { role: 'user', content: 'Review the project end-to-end' },
        { role: 'assistant', content: reply },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 backdrop-blur">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white">
          <Bot className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI Assistant</div>
          <div className="text-[11px] text-slate-500">
            {hasAIKey() ? `${getAIConfig().provider} · ${getAIConfig().model}` : 'Not configured'}
          </div>
        </div>
        <button
          onClick={improveCurrentFile}
          disabled={busy || !file}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 inline-flex items-center gap-1"
          title="Generate a fixed version of the current file"
        >
          <Wand2 className="w-3.5 h-3.5" /> Improve file
        </button>
        <button
          onClick={reviewProject}
          disabled={busy}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
          title="Project-wide review"
        >
          <ListTree className="w-3.5 h-3.5" /> Review project
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-auto p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 flex-shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm'
              }`}
            >
              {m.content}
              {m.action?.kind === 'fix' && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => onApplyFix(m.action.fileId, m.action.code)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Apply to {file?.name}
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(m.action.code)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 flex-shrink-0 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold">
                You
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
              <button onClick={stop} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 ml-1">Stop</button>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="p-2.5 border-t border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 backdrop-blur"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={hasAIKey() ? 'Ask about this file or your project…' : 'Add an AI key in AI API Keys to chat'}
            rows={1}
            className="flex-1 resize-none px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none max-h-32"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="p-2.5 rounded-xl bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Language test runner
// ---------------------------------------------------------------------------
//
// Runs the runner pipeline for every language in LANGUAGES with a sample
// snippet, then reports pass / warning / fail in the same shape as the
// OWASP findings list. Used by the "Test all languages" feature so the user
// can see at a glance which coding types actually execute in this IDE and
// which only get a preview / browser-side syntax check.

const TEST_SAMPLES = {
  html: '<!DOCTYPE html><html><head><title>t</title></head><body><h1>Test</h1><p id="o">ready</p><script>document.getElementById("o").textContent="ok";</script></body></html>',
  css: 'body { background:#0f172a; color:#fff; font: 14px system-ui; padding: 20px; } h1 { color:#60a5fa; }',
  javascript: 'console.log("hello");\nconsole.log(1+2);\nconsole.log(JSON.stringify({ok:true}));',
  typescript: '// TypeScript — preview only (browser cannot execute .ts)\nconst n: number = 42;\nconsole.log("answer", n);',
  jsx: '// JSX — preview only\nimport React from "react";\nexport default function Hi(){ return <h1>hi</h1>; }',
  tsx: '// TSX — preview only\nimport React from "react";\nexport default function Hi(): JSX.Element { return <h1>hi</h1>; }',
  json: '{ "name": "test", "version": "1.0.0", "ok": true, "items": [1,2,3] }',
  markdown: '# Hello\n\nThis is a **test** of the markdown runner.\n\n- one\n- two\n- three',
  python: '# Python — preview only\nprint("hello from python")\nfor i in range(3): print(i)',
  java: '// Java — preview only\npublic class T { public static void main(String[] a) { System.out.println("ok"); } }',
  cpp: '// C++ — preview only\n#include <iostream>\nint main(){ std::cout<<"ok"; return 0; }',
  c: '// C — preview only\n#include <stdio.h>\nint main(){ printf("ok"); return 0; }',
  csharp: '// C# — preview only\nclass P{ static void Main(){ System.Console.WriteLine("ok"); } }',
  go: '// Go — preview only\npackage main\nimport "fmt"\nfunc main(){ fmt.Println("ok") }',
  rust: '// Rust — preview only\nfn main(){ println!("ok"); }',
  php: '<?php // PHP — preview only\necho "ok";',
  ruby: '# Ruby — preview only\nputs "ok"',
  sql: 'SELECT id, name FROM users WHERE status = \'active\' ORDER BY created_at DESC LIMIT 10;',
  yaml: 'name: test\nversion: 1.0.0\nservices:\n  web:\n    image: nginx\n    port: 80',
  text: 'Just some plain text.',
};

const buildSampleForLanguage = (langId) => {
  const meta = LANGUAGES[langId];
  if (!meta) return '';
  // Prefer templates when present, fall back to curated samples.
  const tplSet = TEMPLATES[langId];
  if (tplSet && Object.keys(tplSet).length > 0) {
    return Object.values(tplSet)[0];
  }
  return TEST_SAMPLES[langId] || `// Sample ${meta.label} code`;
};

// Run one language test. Returns a result object shaped like an OWASP finding:
// { langId, label, icon, status, severity, message, output, duration, canRun }
const runSingleLanguageTest = async (langId) => {
  const meta = LANGUAGES[langId];
  if (!meta) {
    return { langId, label: langId, icon: '❓', status: 'fail', severity: 'high', message: 'Unknown language', output: '', duration: 0, canRun: false };
  }

  const sampleContent = buildSampleForLanguage(langId);
  const testFile = { id: '__test__', name: `test.${meta.ext}`, language: langId, content: sampleContent };

  const logs = [];
  const addLog = (type, message) => logs.push({ type, message });

  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let status = 'pass';
  let severity = 'info';
  let message = '';

  try {
    const result = RUNNERS[meta.runner]({ file: testFile, allFiles: [testFile], addLog });

    // Validator-only / source-preview languages: inspect the captured logs.
    if (meta.runner === 'source' || meta.runner === 'sql' || meta.runner === 'yaml') {
      const errors = logs.filter((l) => l.type === 'error');
      const warnings = logs.filter((l) => l.type === 'warn');
      if (errors.length > 0) {
        status = 'fail'; severity = 'high';
        message = errors.map((e) => e.message).join(' · ');
      } else if (warnings.length > 0) {
        status = 'warning'; severity = 'medium';
        message = warnings.map((w) => w.message).join(' · ');
      } else {
        const ok = logs.find((l) => l.type === 'success');
        status = 'pass'; severity = 'info';
        message = ok?.message || (meta.canRun === 'partial' ? 'Browser-side check passed.' : 'Source preview only — no execution attempted.');
      }
    } else {
      // Browser-executable languages: actually load the runner output in a
      // hidden iframe and wait for the sandbox to signal done / error.
      const iframeHtml = result?.kind === 'html' ? result.html : '';
      if (!iframeHtml) {
        status = 'warning'; severity = 'medium';
        message = 'Runner did not produce a preview payload.';
      } else {
        const testResult = await new Promise((resolve) => {
          const iframe = document.createElement('iframe');
          iframe.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;border:0;';
          iframe.setAttribute('sandbox', 'allow-scripts');
          document.body.appendChild(iframe);

          const onMsg = (e) => {
            const data = e.data;
            if (!data || typeof data !== 'object') return;
            if (data.__sandboxLog) {
              logs.push({ type: data.level === 'ok' ? 'success' : data.level, message: data.message });
            }
            if (data.__sandboxDone) {
              cleanup();
              resolve({ ok: !!data.ok });
            }
          };

          const cleanup = () => {
            window.removeEventListener('message', onMsg);
            clearTimeout(timer);
            try { document.body.removeChild(iframe); } catch {}
          };

          const timer = setTimeout(() => { cleanup(); resolve({ ok: false, timeout: true }); }, 4000);
          window.addEventListener('message', onMsg);
          iframe.srcdoc = iframeHtml;
        });

        if (testResult.timeout) {
          status = 'warning'; severity = 'medium';
          message = 'Execution timed out after 4s (likely an infinite animation or wait).';
        } else if (!testResult.ok) {
          status = 'fail'; severity = 'high';
          const errs = logs.filter((l) => l.type === 'error');
          message = errs.length ? errs.map((e) => e.message).join(' · ') : 'Execution failed without an error message.';
        } else {
          status = 'pass'; severity = 'info';
          message = 'Executed successfully in a sandboxed iframe.';
        }
      }
    }
  } catch (e) {
    status = 'fail'; severity = 'high';
    message = `Runner threw: ${e?.message || String(e)}`;
  }

  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  return {
    langId,
    label: meta.label,
    icon: meta.icon,
    ext: meta.ext,
    status,
    severity,
    message,
    output: logs.map((l) => `[${l.type}] ${l.message}`).slice(0, 20).join('\n'),
    duration: Math.round((t1 - t0) * 10) / 10,
    canRun: meta.canRun,
    description: meta.description,
  };
};

// ---------------------------------------------------------------------------
// Main Sandbox (now the "Code IDE" page)
// ---------------------------------------------------------------------------

const Sandbox = () => {
  const { showToast } = useToast();
  const [project, setProject] = useState(loadProject);
  const [expanded, setExpanded] = useState(['root']);
  const [openFiles, setOpenFiles] = useState(() => {
    const seed = loadProject();
    return [seed.children[0]]; // index.html
  });
  const [activeFileId, setActiveFileId] = useState(() => {
    const seed = loadProject();
    return seed.children[0].id;
  });
  const [bottomTab, setBottomTab] = useState('console'); // console | tests | terminal (preview moved to right pane)
  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLeftPane, setShowLeftPane] = useState(false); // Compact explorer — hidden by default in IDE Code mode (toggle to show)
  const [showRightPane, setShowRightPane] = useState(false); // AI assistant is opt-in; default = preview on the right
  const [showPreviewPane, setShowPreviewPane] = useState(true); // Preview is the default surface on the RIGHT in IDE Code mode
  const [showBottomPane, setShowBottomPane] = useState(false); // Console / Tests / Terminal strip — hidden by default to keep IDE Code view clean
  const [previewFullscreen, setPreviewFullscreen] = useState(false); // fullscreen preview overlay
  const [previewSrcdoc, setPreviewSrcdoc] = useState(''); // last preview payload (for fullscreen)
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTerminalLines, setShowTerminalLines] = useState([
    { type: 'system', message: 'Project Eric Code IDE ready.' },
    { type: 'system', message: 'Type "help" for a list of commands.' },
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  // --- "New file" dialog state ---------------------------------------
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileLang, setNewFileLang] = useState('javascript');
  const [newFileStart, setNewFileStart] = useState('blank'); // 'blank' | 'existing' | 'template'
  const [newFileName, setNewFileName] = useState('');
  const [newFileTemplate, setNewFileTemplate] = useState('');
  // The path of the file to duplicate when the dialog starts from an
  // existing one. It holds a path rather than an id because the
  // dropdown lists `f.path`.
  const [newFileSource, setNewFileSource] = useState('');

  // --- Language test runner state ------------------------------------
  // Mirrors the OWASP findings shape: one entry per language with
  // { status, severity, message, output, duration, canRun }.
  const [testResults, setTestResults] = useState(null); // null when never run, otherwise { results, score, summary, total }
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testFilter, setTestFilter] = useState('all'); // all | pass | warning | fail
  const testAbortRef = useRef(false);

  // --- Incoming vulnerability from Analysis "View in IDE" -------------------
  const [searchParams] = useSearchParams();
  const [incomingVuln, setIncomingVuln] = useState(null); // { id, title, severity, location, description, category, cwe }
  const [fixingVuln, setFixingVuln] = useState(false);    // true while AI is generating
  const [vulnFixReply, setVulnFixReply] = useState(null); // raw AI reply
  const [vulnFixCode, setVulnFixCode] = useState('');     // extracted code block

  // Read ?vulnId= URL params on mount / when searchParams change
  useEffect(() => {
    const id = searchParams.get('vulnId');
    if (!id) { setIncomingVuln(null); return; }
    setIncomingVuln({
      id,
      title: searchParams.get('title') || 'Unknown vulnerability',
      severity: searchParams.get('severity') || 'medium',
      location: searchParams.get('location') || '',
      description: searchParams.get('description') || '',
      category: searchParams.get('category') || '',
      cwe: searchParams.get('cwe') || '',
    });
  }, [searchParams]);

  const iframeRef = useRef(null);
  const messageHandlerRef = useRef(null);
  const safetyTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Persist project on every change.
  useEffect(() => saveProject(project), [project]);

  // Derived state
  const allFiles = useMemo(() => flatten(project.children || []), [project]);
  const activeFile = useMemo(
    () => allFiles.find((f) => f.id === activeFileId) || null,
    [allFiles, activeFileId],
  );

  // --- Cleanup on unmount
  useEffect(() => () => {
    if (messageHandlerRef.current) window.removeEventListener('message', messageHandlerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
  }, []);

  // --- File ops ----------------------------------------------------------

  const openFile = (id) => {
    const f = allFiles.find((x) => x.id === id);
    if (!f) return;
    if (!openFiles.find((x) => x.id === id)) setOpenFiles((arr) => [...arr, f]);
    setActiveFileId(id);
  };

  const closeFile = (id, e) => {
    e?.stopPropagation();
    setOpenFiles((arr) => {
      const next = arr.filter((f) => f.id !== id);
      if (activeFileId === id) {
        setActiveFileId(next.length ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  const updateFileContent = (id, content) => {
    setProject((p) => updateNode(p, id, (n) => ({ ...n, content })));
    // Keep open tab in sync
    setOpenFiles((arr) => arr.map((f) => f.id === id ? { ...f, content } : f));
  };

  const addFile = (parentId, name) => {
    const id = `file-${Date.now()}`;
    const newFile = {
      id,
      name,
      type: 'file',
      language: languageFromName(name),
      content: '',
    };
    setProject((p) => addNode(p, parentId, newFile));
    setExpanded((arr) => arr.includes(parentId) ? arr : [...arr, parentId]);
    openFile(id);
    showToast(`Created ${name}`, 'success');
  };

  // Build a new file from the "New file" dialog.
  const createFileFromDialog = () => {
    const meta = LANGUAGES[newFileLang] || LANGUAGES.text;
    const finalName = (newFileName || '').trim() || `untitled.${meta.ext}`;

    let content = '';
    if (newFileStart === 'blank') {
      content = '';
    } else if (newFileStart === 'existing') {
      const src = allFiles.find((f) => f.path === newFileSource);
      content = src?.content || '';
    } else if (newFileStart === 'template') {
      const tplSet = TEMPLATES[newFileLang] || {};
      content = tplSet[newFileTemplate] ?? Object.values(tplSet)[0] ?? '';
    }

    const id = `file-${Date.now()}`;
    const newFile = {
      id,
      name: finalName,
      type: 'file',
      language: newFileLang,
      content,
    };
    setProject((p) => addNode(p, 'root', newFile));
    setExpanded((arr) => arr.includes('root') ? arr : [...arr, 'root']);
    openFile(id);
    setShowNewFile(false);
    showToast(`Created ${finalName}`, 'success');
  };

  // Change the language of the active file (also re-tags by extension).
  const changeActiveLanguage = (lang) => {
    if (!activeFile) return;
    const meta = LANGUAGES[lang] || LANGUAGES.text;
    // Update the file node: language and (if extension matches a known one) the name.
    setProject((p) => mapTree([p], (n) => {
      if (n.id !== activeFile.id) return n;
      const newName = (() => {
        const dot = n.name.lastIndexOf('.');
        const base = dot > 0 ? n.name.slice(0, dot) : n.name;
        return `${base}.${meta.ext}`;
      })();
      // also keep openFiles in sync
      setOpenFiles((arr) => arr.map((f) => f.id === n.id ? { ...f, name: newName, language: lang } : f));
      setActiveFileId(n.id);
      return { ...n, language: lang, name: newName };
    })[0] || p);
  };

  const addFolder = (parentId) => {
    const id = `folder-${Date.now()}`;
    const folder = { id, name: 'new-folder', type: 'folder', expanded: true, children: [] };
    setProject((p) => addNode(p, parentId, folder));
    setExpanded((arr) => [...arr, id]);
    showToast('Folder created', 'success');
  };

  const renameItem = (item) => {
    const next = window.prompt('Rename to:', item.name);
    if (!next || next === item.name) return;
    setProject((p) => {
      const mapped = mapTree([p], (n) => n.id === item.id ? { ...n, name: next } : n);
      return mapped[0] || p;
    });
    if (item.type === 'file') {
      setOpenFiles((arr) => arr.map((f) => (
        f.id === item.id ? { ...f, name: next, language: languageFromName(next) } : f
      )));
    }
  };

  const deleteItem = (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    setProject((p) => removeNode(p, item.id));
    if (item.type === 'file') closeFile(item.id);
    showToast(`Deleted ${item.name}`, 'info');
  };

  // --- Upload / download ------------------------------------------------

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        addFile('root', file.name);
        // Persist the uploaded content into the just-created file.
        setTimeout(() => {
          setProject((p) => updateNode(p, 'root', (n) => ({
            ...n,
            children: (n.children || []).map((c) =>
              c.name === file.name && c.type === 'file' ? { ...c, content: evt.target.result } : c
            ),
          })));
        }, 0);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
    showToast(`Imported ${files.length} file${files.length === 1 ? '' : 's'}`, 'success');
  };

  const handleFolderUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split('/');
      const name = parts.pop();
      // Create nested folders
      let parentId = 'root';
      for (const folder of parts) {
        // find existing folder under parent with this name
        const parentNode = parentId === 'root'
          ? project
          : flatten([findNode(project, parentId)]).find((x) => x.id === parentId);
        const existing = parentNode?.children?.find((c) => c.type === 'folder' && c.name === folder);
        if (existing) { parentId = existing.id; continue; }
        const newId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const folderNode = { id: newId, name: folder, type: 'folder', expanded: true, children: [] };
        setProject((p) => addNode(p, parentId, folderNode));
        parentId = newId;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        const newId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const fileNode = {
          id: newId,
          name,
          type: 'file',
          language: languageFromName(name),
          content: evt.target.result,
        };
        setProject((p) => addNode(p, parentId, fileNode));
      };
      reader.readAsText(file);
    });
    e.target.value = '';
    showToast(`Imported ${files.length} file${files.length === 1 ? '' : 's'} from folder`, 'success');
  };

  // Helper: find a node by id.
  function findNode(tree, id) {
    if (tree.id === id) return tree;
    for (const c of tree.children || []) {
      const found = findNode(c, id);
      if (found) return found;
    }
    return null;
  }

  const handleDownloadAll = () => {
    // Dump the project as a single text file (zip would need a lib).
    let out = `# ${project.name}\nExported ${new Date().toISOString()}\n\n`;
    for (const f of allFiles) {
      out += `// ===== ${f.path} =====\n${f.content || ''}\n\n`;
    }
    const blob = new Blob([out], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'project'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Project downloaded', 'success');
  };

  const handleDownloadFile = (file) => {
    const blob = new Blob([file.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Run / preview ---------------------------------------------------
  //
  // Dispatches to the per-language runner in `RUNNERS`. The runner returns
  // either a payload for the preview iframe or a "logs only" result for
  // validators (JSON, SQL, YAML). The console tab always receives a few
  // lines explaining what happened.

  const run = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs([]);
    // Default to the Preview tab when running — the iframe itself shows
    // console lines via the bridge, so the user sees rendered output first.
    setBottomTab('preview');

    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    const stamp = () => new Date().toLocaleTimeString();
    const addLog = (type, message) => setLogs((prev) => [...prev, { type, message, timestamp: stamp() }]);

    if (!activeFile) {
      addLog('warn', 'No file open. Open or create a file in the explorer.');
      setIsRunning(false);
      return;
    }

    const language = activeFile.language || languageFromName(activeFile.name);
    const meta = LANGUAGES[language] || LANGUAGES.text;

    addLog('log', `▶ ${meta.icon} ${meta.label} · ${activeFile.name} (${activeFile.content?.length ?? 0} chars)`);
    addLog('log', meta.description);

    // Validate-only or source-only languages: don't open the iframe.
    if (meta.runner === 'source' || meta.runner === 'sql' || meta.runner === 'yaml') {
      try {
        const result = RUNNERS[meta.runner]({ file: activeFile, allFiles, addLog });
        if (result?.kind === 'html') {
          if (iframeRef.current) iframeRef.current.srcdoc = result.html;
          setPreviewSrcdoc(result.html);
          setBottomTab('preview');
        }
      } catch (e) {
        addLog('error', `Runner error: ${e.message}`);
      }
      addLog(meta.canRun === 'partial' ? 'warn' : 'warn',
        meta.canRun === 'partial'
          ? `Done — partial check only (${meta.label}).`
          : `Done — ${meta.label} cannot run in the browser. Use a local toolchain to execute it.`);
      setIsRunning(false);
      return;
    }

    // Full iframe execution: html, css, js, markdown.
    const onMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.__sandboxReady) return;
      if (data.__sandboxLog) {
        addLog(data.level === 'ok' ? 'success' : data.level, data.message);
      }
      if (data.__sandboxDone) {
        addLog(data.ok ? 'success' : 'error', data.ok ? '✓ Execution finished' : '✗ Execution failed');
        setIsRunning(false);
        window.removeEventListener('message', onMessage);
        messageHandlerRef.current = null;
        if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
      }
    };
    window.addEventListener('message', onMessage);
    messageHandlerRef.current = onMessage;

    try {
      const result = RUNNERS[meta.runner]({ file: activeFile, allFiles, addLog });
      if (result?.kind === 'html') {
        if (iframeRef.current) iframeRef.current.srcdoc = result.html;
        setPreviewSrcdoc(result.html);
        setBottomTab('preview');
      } else {
        addLog('warn', 'Runner produced no preview output.');
        setIsRunning(false);
      }
    } catch (e) {
      addLog('error', `Runner error: ${e.message}`);
      setIsRunning(false);
    }

    safetyTimerRef.current = setTimeout(() => {
      addLog('warn', '⏱ Execution timed out after 8s — aborting.');
      setIsRunning(false);
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
      }
    }, 8000);
  }, [activeFile, allFiles, isRunning]);

  // --- Terminal --------------------------------------------------------

  const appendTerm = (type, message) =>
    setShowTerminalLines((arr) => [...arr, { type, message, timestamp: new Date().toLocaleTimeString() }]);

  const runTerminalCommand = (raw) => {
    const cmd = (raw || '').trim();
    if (!cmd) return;
    appendTerm('input', cmd);
    const [name, ...args] = cmd.split(/\s+/);
    switch ((name || '').toLowerCase()) {
      case 'help':
        appendTerm('system', 'Commands: help · clear · ls · tree · run · save · open <name> · new <name> · rm <name> · cat <name> · export');
        break;
      case 'clear':
        setShowTerminalLines([]);
        break;
      case 'ls': {
        const names = (project.children || []).map((c) => c.name).join('  ');
        appendTerm('system', names || '(empty)');
        break;
      }
      case 'tree': {
        const lines = [];
        const walk = (nodes, depth = 0) => nodes.forEach((n) => {
          lines.push(`${'  '.repeat(depth)}${n.type === 'folder' ? '📁' : '📄'} ${n.name}`);
          if (n.children) walk(n.children, depth + 1);
        });
        walk(project.children || []);
        appendTerm('system', lines.join('\n') || '(empty)');
        break;
      }
      case 'run':
        run();
        break;
      case 'save':
        saveProject(project);
        appendTerm('success', 'Project saved to local storage.');
        break;
      case 'new': {
        const name = args.join(' ').trim();
        if (!name) { appendTerm('error', 'Usage: new <filename>'); break; }
        addFile('root', name);
        break;
      }
      case 'open': {
        const name = args.join(' ').trim().toLowerCase();
        const file = allFiles.find((f) => f.name.toLowerCase() === name);
        if (!file) { appendTerm('error', `No such file: ${name}`); break; }
        openFile(file.id);
        break;
      }
      case 'rm': {
        const name = args.join(' ').trim().toLowerCase();
        const file = allFiles.find((f) => f.name.toLowerCase() === name);
        if (!file) { appendTerm('error', `No such file: ${name}`); break; }
        deleteItem(file);
        break;
      }
      case 'cat': {
        const name = args.join(' ').trim().toLowerCase();
        const file = allFiles.find((f) => f.name.toLowerCase() === name);
        if (!file) { appendTerm('error', `No such file: ${name}`); break; }
        appendTerm('system', file.content || '(empty)');
        break;
      }
      case 'export':
        handleDownloadAll();
        break;
      default:
        appendTerm('error', `Unknown command: ${name}. Try "help".`);
    }
  };

  // --- Apply AI fix ----------------------------------------------------

  const handleApplyFix = (fileId, code) => {
    updateFileContent(fileId, code);
    showToast('Fix applied', 'success');
  };

  // --- AI fix for incoming vulnerability ---------------------------------

  const generateVulnFix = async () => {
    if (!incomingVuln) return;
    if (!hasAIKey()) return showToast('Add an AI key in AI API Keys → AI Provider', 'error');
    setFixingVuln(true);
    setVulnFixReply(null);
    setVulnFixCode('');
    try {
      const reply = await generateFix({
        code: activeFile?.content || '',
        language: activeFile?.language || languageFromName(activeFile?.name || ''),
        findings: [{
          id: incomingVuln.id,
          severity: incomingVuln.severity,
          name: incomingVuln.title,
          description: incomingVuln.description,
          cwe: incomingVuln.cwe,
        }],
      });
      setVulnFixReply(reply);
      const extracted = extractCodeBlock(reply);
      setVulnFixCode(extracted);
    } catch (e) {
      setVulnFixReply(`⚠ ${e.message}`);
    } finally {
      setFixingVuln(false);
    }
  };

  const applyVulnFix = () => {
    if (!vulnFixCode || !activeFile) return;
    handleApplyFix(activeFile.id, vulnFixCode);
    setVulnFixReply(null);
    setVulnFixCode('');
    setIncomingVuln(null);
    // Clear the URL params so a refresh doesn't re-trigger
    window.history.replaceState({}, '', '/sandbox');
  };

  const dismissVuln = () => {
    setIncomingVuln(null);
    setVulnFixReply(null);
    setVulnFixCode('');
    window.history.replaceState({}, '', '/sandbox');
  };

  // --- Language test runner --------------------------------------------
  //
  // Iterates every entry in LANGUAGES, runs the runner pipeline against a
  // built-in sample, captures the status, and pushes a finding-shaped row
  // into `testResults`. The UI shows the same pass/warning/fail visuals as
  // the OWASP Analysis page so the two pages feel like the same tool.
  const runAllTests = useCallback(async () => {
    if (isTestingAll) return;
    setIsTestingAll(true);
    testAbortRef.current = false;
    setTestResults({ results: [], score: 0, summary: 'Running…', total: 0, runAt: Date.now() });
    setBottomTab('tests');

    const collected = [];
    const updateProgress = (r, all) => {
      const passCount = all.filter((x) => x.status === 'pass').length;
      const warnCount = all.filter((x) => x.status === 'warning').length;
      const failCount = all.filter((x) => x.status === 'fail').length;
      const total = all.length;
      // OWASP-style score: higher = healthier. Failures weigh most.
      const score = Math.max(0, Math.min(100, Math.round(100 - failCount * 12 - warnCount * 3)));
      const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';
      setTestResults({ results: all, score, summary, total, passCount, warnCount, failCount, runAt: Date.now() });
    };

    try {
      for (const langId of Object.keys(LANGUAGES)) {
        if (testAbortRef.current) break;
        const r = await runSingleLanguageTest(langId);
        collected.push(r);
        updateProgress(r, collected);
      }
      showToast(`Tested ${collected.length} language${collected.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      showToast(`Test runner error: ${e.message}`, 'error');
    } finally {
      setIsTestingAll(false);
    }
  }, [isTestingAll]);

  const stopTests = () => {
    testAbortRef.current = true;
    setIsTestingAll(false);
    showToast('Stopped tests', 'info');
  };

  // --- Render ----------------------------------------------------------

  return (
    <div className="relative h-[calc(100vh-56px)] flex flex-col">
      {/* Background grid + glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.04]"
             style={{
               backgroundImage: 'linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)',
               backgroundSize: '52px 52px',
             }} />
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.10] animate-orb-1 blur-3xl"
             style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)', top: '-180px', left: '-120px' }} />
        <div className="absolute w-[420px] h-[420px] rounded-full opacity-[0.10] animate-orb-2 blur-3xl"
             style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.5) 0%, transparent 70%)', bottom: '-140px', right: '-100px' }} />
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <PageTip
          pageId="sandbox"
          variant="info"
          title="Code IDE"
          body="Edit files in the explorer, click Run to preview, or talk to the AI assistant on the right. Files persist in your browser. Add an AI key in AI API Keys → AI Provider to unlock AI features."
        />

        {/* Top bar */}
        <div className="glass-strong rounded-2xl mx-4 mt-4 px-4 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{project.name}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{allFiles.length} file{allFiles.length === 1 ? '' : 's'} · {openFiles.length} open</div>
            </div>
          </div>

          <div className="flex-1" />

          <button
            onClick={run}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run
          </button>

          {/* Test all languages — OWASP-style pass/warning/fail sweep */}
          <button
            onClick={isTestingAll ? stopTests : runAllTests}
            disabled={isRunning}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              isTestingAll
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600'
            }`}
            title="Run a sample through every language's runner and report pass/warning/fail"
          >
            {isTestingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing… {testResults?.results?.length || 0}/{Object.keys(LANGUAGES).length}
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Test all
              </>
            )}
          </button>
          <button
            onClick={() => { saveProject(project); showToast('Saved to browser', 'success'); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" /> Save
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            <Upload className="w-4 h-4" /> Import
          </button>
          <button
            onClick={handleDownloadAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            title="Download entire project"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* New file */}
          <button
            onClick={() => { setShowNewFile(true); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700"
            title="New file (pick language, start from blank/existing/template)"
          >
            <FilePlus className="w-4 h-4" /> New file
          </button>

          {/* AI Assistant toggle — sits next to "New file" so it's the
              second obvious action. Default state: hidden (Preview shows
              on the right). Clicking opens the AI panel on the right,
              replacing the live preview. */}
          <button
            onClick={() => setShowRightPane((v) => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg ${
              showRightPane
                ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-violet-500/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            title={showRightPane ? 'Hide AI assistant (preview returns to right)' : 'Open AI assistant on the right'}
          >
            <Bot className="w-4 h-4" /> AI Assistant
            {showRightPane && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-[10px] font-bold">×</span>
            )}
          </button>

          {/* Preview toggle — in IDE Code mode the preview lives on the
              RIGHT side, equal weight with the editor on the LEFT. This
              button hides that right-side preview when the user wants a
              code-only view. Toggling it back on reveals the live preview
              pane on the right again. */}
          <button
            onClick={() => setShowPreviewPane((v) => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg ${
              showPreviewPane
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            title={showPreviewPane ? 'Hide preview on the right' : 'Show preview on the right'}
          >
            <Eye className="w-4 h-4" /> Preview
            {showPreviewPane && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-[10px] font-bold">×</span>
            )}
          </button>

          {/* Explorer toggle — compact file tree on the left rail. Hidden
              by default in IDE Code mode so the editor and preview get the
              full height; click to surface it when you need to navigate. */}
          <button
            onClick={() => setShowLeftPane((v) => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg ${
              showLeftPane
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            title={showLeftPane ? 'Hide file explorer' : 'Show file explorer'}
          >
            <FolderOpen className="w-4 h-4" /> Explorer
            {showLeftPane && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-[10px] font-bold">×</span>
            )}
          </button>

          {/* Language picker for the active file */}
          {activeFile && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Lang</span>
              <select
                value={activeFile.language || languageFromName(activeFile.name)}
                onChange={(e) => changeActiveLanguage(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                title="Change the language of the active file"
              >
                {Object.entries(LANGUAGES).map(([id, m]) => (
                  <option key={id} value={id}>{m.icon} {m.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Workspace — IDE Code Mode layout
            ┌─────────────────────────┬─────────────────────────┐
            │ Compact Explorer │ Code  │   Preview (right)       │
            │                  │ IDE   │   or AI Assistant      │
            │                  │ (LEFT)│   (RIGHT)               │
            │                  │       │                         │
            │                  │ ───── │                         │
            │                  │ Btm   │                         │
            │                  │ strip │                         │
            └─────────────────────────┴─────────────────────────┘ */}
        <div className="flex-1 flex gap-3 px-4 py-3 min-h-0">
          {/* LEFT SIDE — Explorer (compact) + Code IDE (main) */}
          <div className={`flex flex-row gap-3 min-w-0 min-h-0 ${
            (showPreviewPane || showRightPane) ? 'flex-1' : 'w-full'
          }`}>
            {/* Vulnerability context banner — shown when navigated from Analysis "View in IDE" */}
            {incomingVuln && (
              <div className="w-full glass-strong rounded-2xl overflow-hidden flex flex-col min-h-0">
                <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200/50 dark:border-amber-700/30">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                    <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                        {incomingVuln.title}
                      </h3>
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        incomingVuln.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                        incomingVuln.severity === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                        incomingVuln.severity === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {incomingVuln.severity}
                      </span>
                      {incomingVuln.cwe && (
                        <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                          {incomingVuln.cwe}
                        </span>
                      )}
                      {incomingVuln.category && (
                        <span className="text-[11px] text-amber-700 dark:text-amber-400">
                          {incomingVuln.category}
                        </span>
                      )}
                    </div>
                    {incomingVuln.description && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed mb-3">
                        {incomingVuln.description}
                      </p>
                    )}
                    {incomingVuln.location && (
                      <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400 mb-3">
                        📍 {incomingVuln.location}
                      </p>
                    )}
                    {/* AI fix controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={generateVulnFix}
                        disabled={fixingVuln || !activeFile}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {fixingVuln ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating fix…</>
                        ) : (
                          <><Wand2 className="w-3.5 h-3.5" /> AI Fix with {getAIConfig().provider} · {getAIConfig().model}</>
                        )}
                      </button>
                      {!activeFile && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400">
                          Open a file first to apply the fix
                        </span>
                      )}
                      <button
                        onClick={dismissVuln}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                      >
                        <X className="w-3 h-3" /> Dismiss
                      </button>
                    </div>
                    {/* Fix preview */}
                    {(vulnFixReply || fixingVuln) && (
                      <div className="mt-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-auto max-h-64">
                        {fixingVuln && !vulnFixReply && (
                          <div className="p-4 flex items-center gap-2 text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> Sending to AI model…
                          </div>
                        )}
                        {vulnFixReply && (
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] text-slate-400 uppercase tracking-wider">AI response</span>
                              <div className="flex gap-1">
                                {vulnFixCode && (
                                  <button
                                    onClick={applyVulnFix}
                                    className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600"
                                  >
                                    Apply fix
                                  </button>
                                )}
                                <button
                                  onClick={() => navigator.clipboard.writeText(vulnFixCode || vulnFixReply)}
                                  className="px-2 py-1 rounded text-[11px] font-semibold bg-slate-700 text-slate-200 hover:bg-slate-600"
                                >
                                  <Copy className="w-3 h-3 inline" />
                                </button>
                              </div>
                            </div>
                            {vulnFixCode ? (
                              <pre className="whitespace-pre-wrap leading-relaxed text-emerald-400">{vulnFixCode}</pre>
                            ) : (
                              <pre className="whitespace-pre-wrap leading-relaxed text-slate-300">{vulnFixReply}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Compact Explorer (toggleable, narrow) */}
            {showLeftPane && (
              <div className="w-56 flex-shrink-0 glass-strong rounded-2xl overflow-hidden flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <FolderOpen className="w-4 h-4" /> Explorer
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowNewFile(true)} className="p-1 rounded hover:bg-slate-200 text-slate-500" title="New file">
                      <FilePlus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => addFolder('root')} className="p-1 rounded hover:bg-slate-200 text-slate-500" title="New folder">
                      <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  <FileTree
                    items={project.children || []}
                    depth={0}
                    activeId={activeFileId}
                    expanded={expanded}
                    onToggle={(id) => setExpanded((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])}
                    onOpen={openFile}
                    onAddFile={addFile}
                    onAddFolder={addFolder}
                    onRename={renameItem}
                    onDelete={deleteItem}
                  />
                </div>
              </div>
            )}

            {/* Code IDE (main editor area) */}
            <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
              {/* Tabs */}
              <div className="glass-strong rounded-2xl flex items-center px-2 py-1.5 gap-1 overflow-x-auto">
                {openFiles.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => setActiveFileId(f.id)}
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer text-sm transition-colors whitespace-nowrap ${
                      activeFileId === f.id
                        ? 'bg-slate-900 dark:bg-blue-600 text-white'
                        : 'bg-white/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{f.name}</span>
                    <button
                      onClick={(e) => closeFile(f.id, e)}
                      className={`p-0.5 rounded ${activeFileId === f.id ? 'hover:bg-white/20' : 'hover:bg-slate-200'}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {openFiles.length === 0 && (
                  <div className="text-xs text-slate-400 px-2">No files open. Pick one from the explorer.</div>
                )}
              </div>

              {/* Editor */}
              <div className="glass-strong rounded-2xl flex-1 flex flex-col overflow-hidden min-h-0">
                {activeFile ? (
                  <>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold uppercase tracking-wider text-slate-500">
                          {activeFile.language || languageFromName(activeFile.name)}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500 font-mono">{activeFile.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { navigator.clipboard.writeText(activeFile.content || ''); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          title="Copy"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDownloadFile(activeFile)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          title="Download this file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 relative bg-slate-950">
                      <pre className="absolute inset-0 p-4 font-mono text-sm leading-6 text-slate-300 whitespace-pre-wrap break-words overflow-auto pointer-events-none">
                        {(activeFile.content || '').split('\n').map((line, i) => (
                          <div key={i} className="flex">
                            <span className="w-10 pr-3 text-slate-600 select-none text-right">{i + 1}</span>
                            <span className={`
                              ${/^\s*(\/\/|\*|\/\*)/.test(line) ? 'text-slate-500 italic' : ''}
                              ${/\b(import|export|from|require|const|let|var|function|return|class|new|if|else|for|while|switch|try|catch|await|async|true|false|null|undefined)\b/.test(line) ? 'text-blue-300' : ''}
                              ${/(['"`])[^'"`]*\1/.test(line) ? 'text-emerald-300' : ''}
                              ${/[{}\[\]();,]/.test(line) ? 'text-slate-400' : ''}
                            `}>{line || ' '}</span>
                          </div>
                        ))}
                      </pre>
                      <textarea
                        value={activeFile.content || ''}
                        onChange={(e) => updateFileContent(activeFile.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab') {
                            e.preventDefault();
                            const ta = e.currentTarget;
                            const start = ta.selectionStart;
                            const end = ta.selectionEnd;
                            const next = (activeFile.content || '').slice(0, start) + '  ' + (activeFile.content || '').slice(end);
                            updateFileContent(activeFile.id, next);
                            requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
                          } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                            e.preventDefault();
                            saveProject(project);
                            showToast('Saved', 'success');
                          } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            run();
                          }
                        }}
                        spellCheck={false}
                        className="absolute inset-0 w-full h-full p-4 pl-14 font-mono text-sm leading-6 text-transparent caret-white bg-transparent resize-none outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <Code2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Open a file from the explorer to start editing.</p>
                      {!showLeftPane && (
                        <button
                          onClick={() => setShowLeftPane(true)}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          <FolderOpen className="w-3.5 h-3.5" /> Show explorer
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom: console / tests / terminal — collapsible strip.
                  Hidden by default in IDE Code mode so the editor and
                  preview get the full height. Toggle via the status bar
                  or the small chevron in the strip header. */}
              {showBottomPane && (
                <div className="glass-strong rounded-2xl flex flex-col overflow-hidden min-h-0 h-[260px] transition-all">
                  <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50 overflow-x-auto">
                    {[
                      { id: 'console',   label: 'Console',     icon: TerminalIcon, badge: logs.length || null },
                      { id: 'tests',     label: 'Tests',       icon: ShieldCheck, badge: testResults?.results?.length || null },
                      { id: 'terminal',  label: 'Terminal',    icon: HardDrive,   badge: null },
                    ].map((t) => {
                      const Icon = t.icon;
                      const active = bottomTab === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setBottomTab(t.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                            active ? 'bg-slate-900 dark:bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" /> {t.label}
                          {t.badge && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                              active ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>{t.badge}</span>
                          )}
                        </button>
                      );
                    })}
                    <div className="flex-1" />
                    {bottomTab === 'console' && (
                      <button onClick={() => setLogs([])} className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1">
                        <Trash2 className="w-3 h-3" /> Clear
                      </button>
                    )}
                    <button
                      onClick={() => setShowBottomPane(false)}
                      className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      title="Hide bottom panel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden">
                    {bottomTab === 'console' && (
                      <div className="h-full overflow-auto p-3 font-mono text-xs bg-slate-950 text-slate-100">
                        {logs.length === 0 && !isRunning && (
                          <div className="h-full flex flex-col items-center justify-center text-slate-500">
                            <Play className="w-8 h-8 mb-2 opacity-50" />
                            Click <kbd className="px-1 mx-1 bg-slate-800 rounded text-slate-300">Run</kbd> to execute
                          </div>
                        )}
                        {logs.map((log, i) => (
                          <div key={i} className={`flex items-start gap-2 py-0.5 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'warn' ? 'text-amber-300' :
                            log.type === 'success' ? 'text-emerald-400' :
                            log.type === 'info' ? 'text-blue-300' :
                            'text-slate-200'
                          }`}>
                            <span className="text-slate-500 select-none">{log.timestamp}</span>
                            <span className="whitespace-pre-wrap break-words">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {bottomTab === 'tests' && (
                      <LanguageTestsPanel
                        results={testResults}
                        isRunning={isTestingAll}
                        filter={testFilter}
                        onFilter={setTestFilter}
                        onRun={runAllTests}
                        onStop={stopTests}
                        total={Object.keys(LANGUAGES).length}
                      />
                    )}
                    {bottomTab === 'terminal' && (
                      <div className="h-full flex flex-col bg-slate-950 font-mono text-xs text-slate-100">
                        <div className="flex-1 overflow-auto p-3 space-y-0.5">
                          {showTerminalLines.map((l, i) => (
                            <div key={i} className={
                              l.type === 'error' ? 'text-red-400' :
                              l.type === 'success' ? 'text-emerald-400' :
                              l.type === 'input' ? 'text-blue-300' :
                              'text-slate-300'
                            }>
                              {l.type === 'input' ? `$ ${l.message}` : l.message}
                            </div>
                          ))}
                        </div>
                        <form
                          onSubmit={(e) => { e.preventDefault(); runTerminalCommand(terminalInput); setTerminalInput(''); }}
                          className="flex items-center gap-2 px-3 py-2 border-t border-slate-800"
                        >
                          <span className="text-emerald-400">$</span>
                          <input
                            autoFocus
                            value={terminalInput}
                            onChange={(e) => setTerminalInput(e.target.value)}
                            placeholder='type "help" for commands'
                            className="flex-1 bg-transparent outline-none text-slate-100 placeholder-slate-600"
                          />
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE — Preview (default) or AI Assistant. This is the
              primary preview surface for IDE Code mode: it lives on the
              right so the user sees code on the LEFT and live output on
              the RIGHT without scrolling. */}
          {(showPreviewPane || showRightPane) && (
            <div className={`flex-shrink-0 flex flex-col min-h-0 ${
              showRightPane ? 'w-[40%]' : 'w-[44%]'
            }`}>
              {showRightPane ? (
                <AssistantPanel
                  file={activeFile}
                  files={allFiles}
                  onApplyFix={handleApplyFix}
                  showToast={showToast}
                />
              ) : (
                /* Live preview — own panel on the RIGHT */
                <div className="glass-strong rounded-2xl flex flex-col overflow-hidden min-h-0 h-full">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <Eye className="w-4 h-4 text-emerald-600" />
                      <span>Live preview</span>
                      {activeFile && (
                        <span className="text-xs text-slate-500 font-mono font-normal">
                          · {activeFile.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { if (iframeRef.current && activeFile) run(); }}
                        disabled={isRunning}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Re-run the active file"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} /> Re-run
                      </button>
                      <button
                        onClick={() => setPreviewFullscreen(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                        title="Open preview in fullscreen"
                      >
                        <Maximize2 className="w-3.5 h-3.5" /> Full
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 relative bg-white min-h-0">
                    {/* Active-file / run-status strip overlaid on the preview */}
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/80 text-white text-[10px] font-semibold uppercase tracking-wider backdrop-blur">
                      <Eye className="w-3 h-3" />
                      <span>Live preview</span>
                      {activeFile && (
                        <span className="text-slate-300 font-mono normal-case">
                          · {activeFile.name}
                        </span>
                      )}
                      {isRunning && (
                        <span className="ml-1 inline-flex items-center gap-1 text-emerald-300 normal-case">
                          <Loader2 className="w-3 h-3 animate-spin" /> running
                        </span>
                      )}
                    </div>
                    <iframe
                      ref={iframeRef}
                      title="preview"
                      sandbox="allow-scripts"
                      srcDoc={previewSrcdoc || undefined}
                      className="w-full h-full bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="mx-4 mb-3 mt-1 px-3 py-1.5 rounded-xl bg-slate-900/90 text-slate-300 text-[11px] font-mono flex items-center gap-3 flex-wrap">
          <span className="text-emerald-400">●</span> <span>Ready</span>
          <span className="text-slate-600">|</span>
          <span>Files: {allFiles.length}</span>
          <span className="text-slate-600">|</span>
          <span>Open: {openFiles.length}</span>
          <span className="text-slate-600">|</span>
          {activeFile ? (() => {
            const meta = LANGUAGES[activeFile.language || languageFromName(activeFile.name)] || LANGUAGES.text;
            const runBadge = meta.canRun === true
              ? <span className="text-emerald-400">● runs in browser</span>
              : meta.canRun === 'partial'
                ? <span className="text-amber-400">● browser-side check</span>
                : <span className="text-rose-400">● preview only</span>;
            return (
              <>
                <span>Active: {activeFile.name}</span>
                <span className="text-slate-600">·</span>
                <span>{meta.icon} {meta.label}</span>
                <span className="text-slate-600">·</span>
                {runBadge}
              </>
            );
          })() : <span>Active: —</span>}
          <div className="flex-1" />
          <span>{hasAIKey() ? `AI: ${getAIConfig().provider}/${getAIConfig().model}` : 'AI: not configured'}</span>
          <span className="text-slate-600">|</span>
          <button
            onClick={() => setShowLeftPane((v) => !v)}
            className={`hover:text-white ${showLeftPane ? 'text-amber-300' : ''}`}
            title="Toggle explorer (left rail)"
          >Explorer {showLeftPane ? '◨' : '◧'}</button>
          <button
            onClick={() => setShowBottomPane((v) => !v)}
            className={`hover:text-white ${showBottomPane ? 'text-cyan-300' : ''}`}
            title="Toggle bottom panel (Console / Tests / Terminal)"
          >Bottom {showBottomPane ? '◨' : '◧'}</button>
          <button
            onClick={() => setShowRightPane((v) => !v)}
            className={`hover:text-white ${showRightPane ? 'text-violet-300' : ''}`}
            title={showRightPane ? 'Hide AI assistant (preview returns to right)' : 'Open AI assistant on the right'}
          >Assistant {showRightPane ? '◨' : '◧'}</button>
          <button
            onClick={() => setShowPreviewPane((v) => !v)}
            className={`hover:text-white ${showPreviewPane ? 'text-emerald-300' : ''}`}
            title={showPreviewPane ? 'Hide preview on the right' : 'Show preview on the right'}
          >Preview {showPreviewPane ? '◨' : '◧'}</button>
        </div>

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
        <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={handleFolderUpload} />
      </div>

      {/* Import modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowImportModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import into your project</h3>
              <button onClick={() => setShowImportModal(false)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              Import one or more local files into <code className="px-1 bg-slate-100 rounded">{project.name}</code>.
              Everything stays in your browser — nothing is uploaded.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => { fileInputRef.current?.click(); setShowImportModal(false); }}
                className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FilePlus className="w-5 h-5 text-blue-500" />
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">Import files</div>
                    <div className="text-xs text-slate-500">Pick one or more .html, .css, .js, .ts, .json, …</div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { folderInputRef.current?.click(); setShowImportModal(false); }}
                className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-violet-400 hover:bg-violet-50/50 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderPlus className="w-5 h-5 text-violet-500" />
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">Import folder</div>
                    <div className="text-xs text-slate-500">Preserve the folder structure on disk.</div>
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-5 text-[11px] text-slate-400 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> Files are kept in <code>localStorage</code> for this browser.
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen preview overlay — opened from the "Full" button in the
          preview tab. Lets the user pop the live preview out of the bottom
          panel for a closer look without leaving the IDE. */}
      {previewFullscreen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full h-full max-w-[1400px] max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Live preview
                {activeFile && (
                  <span className="text-xs text-slate-500 font-mono font-normal">
                    · {activeFile.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (activeFile) run(); }}
                  disabled={isRunning}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  title="Re-run"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} /> Re-run
                </button>
                <button
                  onClick={() => setPreviewFullscreen(false)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700"
                  title="Close fullscreen"
                >
                  <Minimize2 className="w-3.5 h-3.5" /> Exit
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-white">
              {/* Reuse the same iframe node so any in-flight run lands here. */}
              <iframe
                title="preview-fullscreen"
                sandbox="allow-scripts"
                srcDoc={previewSrcdoc || undefined}
                className="w-full h-full bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* New file dialog */}
      {showNewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowNewFile(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New file</h3>
                <p className="text-xs text-slate-500">Pick an existing file as a starting point, or construct a brand-new one.</p>
              </div>
              <button onClick={() => setShowNewFile(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-auto">
              {/* Step 1 — Source: existing vs new (front and center) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-[10px] mr-2">1</span>
                  Source
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: 'existing',
                      label: 'Use existing file',
                      desc: 'Duplicate another file in this project.',
                      icon: FileCode,
                      accent: 'from-blue-500 to-indigo-500',
                    },
                    {
                      id: 'blank',
                      label: 'Construct new file',
                      desc: 'Start empty or from a template.',
                      icon: Sparkles,
                      accent: 'from-violet-500 to-fuchsia-500',
                    },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = newFileStart === opt.id || (opt.id === 'blank' && newFileStart !== 'existing');
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setNewFileStart(opt.id === 'blank' ? (newFileTemplate ? 'template' : 'blank') : opt.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all hover:-translate-y-0.5 ${
                          active
                            ? 'border-slate-900 dark:border-blue-500 bg-slate-900 dark:bg-blue-600 text-white shadow-lg shadow-slate-900/20 dark:shadow-blue-500/30'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${opt.accent} flex items-center justify-center text-white`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-sm">{opt.label}</span>
                        </div>
                        <div className={`text-xs leading-relaxed ${active ? 'text-slate-300' : 'text-slate-500'}`}>{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>

                {newFileStart === 'existing' && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Pick the file to duplicate</label>
                    <select
                      value={newFileSource}
                      onChange={(e) => {
                        setNewFileSource(e.target.value);
                        const src = allFiles.find((f) => f.path === e.target.value);
                        if (src?.language) setNewFileLang(src.language);
                        if (src && !newFileName) setNewFileName(`copy-of-${src.name}`);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-800 font-mono"
                    >
                      {allFiles.length === 0 && <option value="">(no files yet — switch to Construct new file)</option>}
                      {allFiles.map((f) => (
                        <option key={f.id} value={f.path}>{f.path}</option>
                      ))}
                    </select>
                    {newFileSource && (() => {
                      const src = allFiles.find((f) => f.path === newFileSource);
                      if (!src) return null;
                      const meta = LANGUAGES[src.language || languageFromName(src.name)] || LANGUAGES.text;
                      return (
                        <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                          <div className="flex items-center gap-2 text-slate-700 font-medium">
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-mono text-slate-500">{src.name}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{(src.content || '').length} chars</span>
                          </div>
                          <div className="mt-1 text-slate-500">{meta.description}</div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {newFileStart === 'blank' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setNewFileStart('template')}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-500 bg-white dark:bg-slate-800 text-left transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Use template</div>
                      <div className="text-xs text-slate-500 mt-0.5">Pre-filled boilerplate for the chosen language.</div>
                    </button>
                    <button
                      onClick={() => { setNewFileStart('blank'); setNewFileTemplate(''); }}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-left transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Truly blank</div>
                      <div className="text-xs text-slate-500 mt-0.5">Start with an empty file.</div>
                    </button>
                  </div>
                )}
              </div>

              {/* Step 2 — Language */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-[10px] mr-2">2</span>
                  Language
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Object.entries(LANGUAGES).map(([id, m]) => {
                    const active = newFileLang === id;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          setNewFileLang(id);
                          // Reset the source/template if the new language has neither.
                          const tplKeys = Object.keys(TEMPLATES[id] || {});
                          if (newFileStart === 'template' && (!newFileTemplate || !tplKeys.includes(newFileTemplate))) {
                            setNewFileTemplate(tplKeys[0] || '');
                          }
                          if (!newFileName.endsWith('.' + m.ext)) {
                            setNewFileName(`untitled.${m.ext}`);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-colors ${
                          active ? 'border-slate-900 dark:border-blue-500 bg-slate-900 dark:bg-blue-600 text-white' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <div className="text-base leading-none">{m.icon}</div>
                        <div className="text-xs font-semibold mt-1">{m.label}</div>
                        <div className={`text-[10px] mt-0.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                          {m.canRun === true ? 'runs in browser' : m.canRun === 'partial' ? 'browser check' : 'preview only'}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-slate-500">{(LANGUAGES[newFileLang] || LANGUAGES.text).description}</div>
              </div>

              {/* Step 3 — File name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-[10px] mr-2">3</span>
                  File name
                </label>
                <input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder={`untitled.${(LANGUAGES[newFileLang] || LANGUAGES.text).ext}`}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
                />
              </div>

              {/* Optional template chooser when 'template' mode is on */}
              {newFileStart === 'template' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Template</label>
                  <select
                    value={newFileTemplate}
                    onChange={(e) => setNewFileTemplate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-800"
                  >
                    {Object.keys(TEMPLATES[newFileLang] || {}).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    {Object.keys(TEMPLATES[newFileLang] || {}).length === 0 && (
                      <option value="">(no templates for this language)</option>
                    )}
                  </select>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNewFile(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={createFileFromDialog}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 inline-flex items-center gap-1.5"
              >
                <FilePlus className="w-4 h-4" /> Create file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sandbox;
