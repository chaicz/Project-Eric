import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ExternalLink,
  Code2,
  Globe,
  Monitor,
  PlayCircle,
  Power,
  PowerOff,
  RefreshCw,
  FileCode,
  ChevronRight,
  Eye,
  Rocket,
  Server,
  Activity,
  Zap,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Cpu,
  Layers,
  Maximize2,
  Minimize2,
  Save,
} from 'lucide-react';
import { useToast } from '../components/Toast';

// ============================================================
// Live IDE — Run Project + code-server
//
// This page is the single launchpad for the full Project Eric dev
// stack. The previous "vscode.dev install 3 extensions" flow has
// been removed; the OWASP scanner now runs *inside* the bundled
// code-server workbench (see the OWASP Analysis page) so the IDE
// page only needs to do two things:
//
//   1. Start the dev stack (Vite + code-server [+ Yjs collab])
//   2. Hand the user a single button to open the code-server UI
//
// From there everything — editing, scanning, fixing — happens
// inside the live workbench. The textarea scan that used to live
// on this page is now a "Quick test" panel on the OWASP Analysis
// page; the canonical scan is the in-editor scanner.
// ============================================================

const VITE_URL    = 'http://127.0.0.1:5173';
const CODE_URL    = 'http://127.0.0.1:8080';
const YJS_URL     = 'ws://127.0.0.1:1234';

const HEALTH = {
  vite: `${VITE_URL}/`,
  code: `${CODE_URL}/healthz`,
};

// Persisted recent-projects strip (recent code-server workspaces / repos
// the user opened). Real recent list lives in code-server itself; this is
// a hint surfaced in the dashboard.
const LS_PROJECTS_KEY = 'project-eric_ide_projects_v1';

// ---- Service status --------------------------------------------------------
//
// Three states: 'unknown' (haven't probed yet), 'checking' (probe in flight),
// 'running' (last probe got a 2xx), 'stopped' (last probe failed).
// We re-probe every 6 seconds while the page is open. Cheap (1 round trip
// per service) so we don't bother pausing on tab visibility.

const useServiceStatus = (probe, intervalMs = 6000) => {
  const [status, setStatus] = useState('unknown');
  const probeRef = useRef(probe);
  probeRef.current = probe;

  const run = useCallback(async () => {
    setStatus('checking');
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2500);
      const res = await probeRef.current({ signal: controller.signal });
      clearTimeout(t);
      if (res && (res.ok || res.type === 'opaque')) setStatus('running');
      else setStatus('stopped');
    } catch {
      setStatus('stopped');
    }
  }, []);

  useEffect(() => {
    void run();
    const id = setInterval(() => { void run(); }, intervalMs);
    return () => clearInterval(id);
  }, [run, intervalMs]);

  return [status, run, setStatus];
};

// Tiny fetch wrapper that uses no-cors so we don't need CORS to be
// configured on the dev server just to know the port is up.
const makeProbe = (url) => async ({ signal }) =>
  fetch(url, { method: 'GET', signal, mode: 'no-cors' });

// ============================================================
// Status pill
// ============================================================
const StatusPill = ({ status, label, accent = 'emerald' }) => {
  const palette = {
    emerald: {
      running:  'bg-emerald-50 text-emerald-700 border-emerald-200',
      checking: 'bg-amber-50 text-amber-700 border-amber-200',
      stopped:  'bg-slate-100 text-slate-600 border-slate-200',
      unknown:  'bg-slate-100 text-slate-500 border-slate-200',
    },
  }[accent];
  const dot = {
    running:  'bg-emerald-500 animate-pulse',
    checking: 'bg-amber-500',
    stopped:  'bg-slate-400',
    unknown:  'bg-slate-300',
  }[status];
  const text = {
    running:  'running',
    checking: 'checking…',
    stopped:  'stopped',
    unknown:  'unknown',
  }[status] || 'unknown';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${palette[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}: {text}
    </span>
  );
};

// ============================================================
// Page
// ============================================================
const IDEWorkspace = () => {
  const { showToast } = useToast();

  const [viteStatus,   probeVite,   setViteStatus  ] = useServiceStatus(makeProbe(HEALTH.vite));
  const [codeStatus,   probeCode,   setCodeStatus  ] = useServiceStatus(makeProbe(HEALTH.code));
  const [busy, setBusy] = useState(false);          // "Run Project" / "Stop" in flight
  const [yjsOn,  setYjsOn]  = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [recentProjects, setRecentProjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_PROJECTS_KEY) || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify(recentProjects));
  }, [recentProjects]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([probeVite(), probeCode()]);
  }, [probeVite, probeCode]);

  // ---- Launch helpers ------------------------------------------------------
  const runProject = useCallback(async (mode = 'start') => {
    if (busy) return;
    setBusy(true);
    try {
      // The dashboard can't directly spawn Node child processes, so we proxy
      // through the same /api/run-project endpoint the IDE launcher uses.
      // (The endpoint is a tiny shim; if the backend isn't running the call
      // fails gracefully and we show the user the npm command instead.)
      const res = await fetch('/api/run-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, yjs: yjsOn }),
      }).catch(() => null);

      if (res && res.ok) {
        showToast(
          mode === 'start'
            ? 'Project Eric dev stack launching in the background…'
            : 'Stopping Project Eric dev stack…',
          'success'
        );
      } else {
        // Backend not available — show the command for the user to run.
        showToast(
          mode === 'start'
            ? 'Run `npm run run:project` in the project root to start the stack.'
            : 'Run `npm run run:project:stop` to stop the stack.',
          'info',
          8000
        );
      }
      // Give the processes a moment, then re-probe.
      setTimeout(() => { void refreshAll(); }, 2500);
    } finally {
      setBusy(false);
    }
  }, [busy, yjsOn, showToast, refreshAll]);

  const openInWindow = useCallback((url, label) => {
    const win = window.open(url, `eric-${label}`, 'noopener,noreferrer');
    if (!win) {
      showToast('Pop-up blocked — allow pop-ups to open the IDE.', 'warning');
      return;
    }
    setRecentProjects((prev) => {
      const without = prev.filter((p) => p.path !== url);
      return [{ name: label, path: url, openedAt: Date.now() }, ...without].slice(0, 8);
    });
    showToast(`${label} opened in a new window.`, 'success');
  }, [showToast]);

  // Open the dashboard's own embedded workbench view. The OWASP analysis
  // page hosts the actual workbench; this button just routes the user there
  // with the embed already expanded.
  const openOwaspInIde = useCallback(() => {
    window.location.href = '/owasp-analysis?embed=1';
  }, []);

  // ---- Derived UI flags ---------------------------------------------------
  const bothRunning = viteStatus === 'running' && codeStatus === 'running';
  const anyRunning  = viteStatus === 'running' || codeStatus === 'running';
  const readyToRun  = !anyRunning;

  // ---- Layout -------------------------------------------------------------
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <Monitor className="w-3.5 h-3.5" />
            Tools / Live IDE
          </div>
          <h1 className="mt-1.5 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
            Run Project &amp; Live IDE
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            One click starts the full Project Eric dev stack — Vite for the
            dashboard, code-server with the bundled{' '}
            <strong className="text-slate-700 dark:text-slate-200">project-eric-owasp</strong>{' '}
            extension for the in-editor OWASP scan, and the Yjs collab relay for
            real-time editing. The OWASP scanner runs inside code-server now;
            this page is just the launchpad.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={viteStatus} label="Vite" />
          <StatusPill status={codeStatus} label="code-server" />
        </div>
      </div>

      {/* ============================================================ */}
      {/* Hero — Run Project launcher                                    */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-blue-500/5 pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
              <Rocket className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Run Project
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  Vite + code-server + Yjs
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Starts <strong>Vite</strong> (the dashboard at 5173),{' '}
                <strong>code-server</strong> (the in-browser VS Code at 8080
                with the bundled OWASP extension), and optionally the{' '}
                <strong>Yjs collab relay</strong> (1234) for Eric Collab. All
                three run in the background so the dashboard keeps working.
              </p>
            </div>
          </div>

          {/* Big action button + Yjs toggle */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => runProject('start')}
              disabled={busy || anyRunning}
              className="md:col-span-2 inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Launching…
                </>
              ) : anyRunning ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Stack already running
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  Run Project (Vite + code-server)
                </>
              )}
            </button>

            <button
              onClick={() => runProject('stop')}
              disabled={busy || !anyRunning}
              className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PowerOff className="w-4 h-4" />
              Stop stack
            </button>
          </div>

          {/* Yjs toggle + manual command */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={yjsOn}
                onChange={(e) => setYjsOn(e.target.checked)}
                className="mt-0.5 accent-emerald-600"
              />
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Start Yjs collab relay
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Required for Eric Collab real-time editing. Disable if you
                  don't need collaboration or the port is already in use.
                </div>
              </div>
            </label>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-emerald-300 font-mono text-[11px] flex flex-col gap-1">
              <div className="flex items-center gap-2 text-slate-400">
                <Terminal className="w-3.5 h-3.5" />
                <span>Or run from a terminal:</span>
              </div>
              <code>npm run run:project</code>
              <code>npm run run:project:stop</code>
              <code>npm run run:project:status</code>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Service grid — Vite, code-server, Yjs                          */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ServiceCard
          icon={Layers}
          name="Vite dev server"
          description="React dashboard, HMR, and the OWASP Analysis page itself."
          url={VITE_URL}
          port={5173}
          status={viteStatus}
          onProbe={probeVite}
          onOpen={() => openInWindow(VITE_URL, 'Dashboard')}
        />
        <ServiceCard
          icon={Server}
          name="code-server"
          description="Browser-based VS Code with the project-eric-owasp extension pre-installed."
          url={CODE_URL}
          port={8080}
          status={codeStatus}
          onProbe={probeCode}
          onOpen={() => openInWindow(CODE_URL, 'code-server')}
          highlight
        />
        <ServiceCard
          icon={Activity}
          name="Yjs collab relay"
          description="Real-time editing relay used by Eric Collab (starts with the stack when enabled)."
          url={YJS_URL}
          port={1234}
          status={yjsOn ? 'running' : 'stopped'}
          onProbe={() => {}}
          onOpen={null}
          badge={!yjsOn ? 'Disabled' : null}
        />
      </div>

      {/* ============================================================ */}
      {/* Open the workbench — primary action                            */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center flex-shrink-0">
            <Code2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Where do I scan code now?
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              The OWASP Top 10 scanner runs <strong>inside</strong> the
              code-server workbench — open the IDE, create a file, and the
              scanner flags issues live as you type. The{' '}
              <a
                href="/owasp-analysis"
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                OWASP Analysis
              </a>{' '}
              page hosts the embedded workbench plus a "Quick test" panel
              for one-off snippets.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <button
                onClick={() => openInWindow(CODE_URL, 'code-server')}
                disabled={codeStatus !== 'running'}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white shadow-md shadow-blue-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open code-server
              </button>
              <button
                onClick={openOwaspInIde}
                disabled={codeStatus !== 'running'}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-3.5 h-3.5" />
                Open embedded IDE + scan
              </button>
              <button
                onClick={() => openInWindow(VITE_URL + '/owasp-analysis', 'OWASP Analysis')}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/40"
              >
                <Globe className="w-3.5 h-3.5" />
                Open OWASP page
              </button>
              <button
                onClick={refreshAll}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh status
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Recent + logs                                                  */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileCode className="w-4 h-4 text-blue-500" />
            <h3 className="font-bold text-slate-900 dark:text-white">
              Recent IDE sessions
            </h3>
          </div>
          {recentProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-slate-400 text-sm">
              No recent sessions. Open the code-server window or the OWASP
              Analysis page to start one.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentProjects.map((p, i) => (
                <button
                  key={i}
                  onClick={() => openInWindow(p.path, p.name)}
                  className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                    <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 truncate flex-1">
                      {p.name}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400 font-mono truncate">{p.path}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-slate-900 dark:text-white">Logs</h3>
            <div className="flex-1" />
            <button
              onClick={() => setShowLog((s) => !s)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            >
              {showLog ? 'Hide' : 'Show'}
            </button>
          </div>
          {showLog ? (
            <div className="grid grid-cols-1 gap-2 text-[11px] font-mono">
              <LogSnippet name="vite" path="/logs/vite.log" />
              <LogSnippet name="code-server" path="/logs/code-server.log" />
              <LogSnippet name="yjs" path="/logs/yjs.log" />
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              The launcher pipes stdout/stderr to{' '}
              <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                ./logs/
              </code>{' '}
              so you can inspect a stuck process. Click <strong>Show</strong> to
              peek at the tail.
            </p>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Footer note                                                     */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3 text-xs text-slate-500 dark:text-slate-400">
        <Eye className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-700 dark:text-slate-300">Heads up.</strong>{' '}
          The previous "install Cline + Live Share + language pack into
          vscode.dev" flow has been removed. Project Eric now ships its own
          real-time collab (<strong>Eric Collab</strong>) and its own OWASP
          scanner (<strong>project-eric-owasp</strong>) as bundled VS Code
          extensions inside code-server. The bundled Live Share is auto-disabled
          to avoid the <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">liveshare.startFromActivityBar</code>{' '}
          error on first launch.
        </p>
      </div>
    </div>
  );
};

// ============================================================
// Service card
// ============================================================
const ServiceCard = ({ icon: Icon, name, description, url, port, status, onProbe, onOpen, highlight = false, badge = null }) => (
  <div className={`relative overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 ${highlight ? 'border-emerald-200 dark:border-emerald-500/30 shadow-md' : 'border-slate-200 dark:border-slate-800'}`}>
    {highlight && (
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-blue-500" />
    )}
    <div className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
              {badge}
            </span>
          )}
          <button
            onClick={onProbe}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Re-probe"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-sm font-bold text-slate-900 dark:text-white">{name}</div>
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {description}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate">
          {url}
        </code>
        {onOpen && (
          <button
            onClick={onOpen}
            disabled={status !== 'running'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            title="Open in a new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusPill status={status} label={`port ${port}`} />
      </div>
    </div>
  </div>
);

// ============================================================
// Log snippet (last 5 lines of a file fetched over /logs/...)
// ============================================================
const LogSnippet = ({ name, path }) => {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch(path)
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (cancelled) return;
        const arr = text.split(/\r?\n/).filter(Boolean);
        setLines(arr.slice(-5));
      })
      .catch(() => { /* log file may not exist yet */ });
    return () => { cancelled = true; };
  }, [path]);
  return (
    <div className="rounded-md bg-slate-950 text-slate-200 px-2 py-1.5">
      <div className="text-slate-500 text-[10px]">{name}</div>
      <pre className="whitespace-pre-wrap break-all">
        {lines.length === 0 ? '(no log yet)' : lines.join('\n')}
      </pre>
    </div>
  );
};

export default IDEWorkspace;
