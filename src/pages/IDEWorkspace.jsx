import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ExternalLink,
  Users,
  Code2,
  Globe,
  Monitor,
  Sparkles,
  FileCode,
  ChevronRight,
  Download,
  Languages,
  Bot,
  Rocket,
  Package,
  Settings as SettingsIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  PlayCircle,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';

// ============================================================
// vscode.dev — the official Microsoft-hosted VS Code for the Web.
// https://vscode.dev/ is a no-install, browser-based IDE that reads
// files from your GitHub repos or local workspace. It supports the
// same extensions as desktop VS Code (installed via the Open VSX
// marketplace). This page replaces the previous self-hosted
// code-server with vscode.dev — no Docker, no certs, no proxy.
// ============================================================

const VSCODE_DEV_URL = 'https://vscode.dev/';
const VSCODE_DEV_INSIDERS_URL = 'https://insiders.vscode.dev/';
const OPEN_VSX_BASE = 'https://open-vsx.org/extension';

// Persisted key so the extension manager remembers what's been "installed"
// (marked) across reloads. Real install state lives in the user's VS Code
// instance — this is a hint, not ground truth.
const LS_INSTALL_KEY = 'project-eric_vscode_installs_v1';
const LS_PROJECTS_KEY = 'project-eric_ide_projects_v1';

// Curated extensions to auto-install when the user opens this page.
// Each entry exposes both the marketplace id (for the `vscode:` URI
// scheme that desktop VS Code understands) and the Open VSX id (for
// vscode.dev and the manual fallback link).
const DEFAULT_EXTENSIONS = [
  {
    id: 'ms-ceintl.vscode-language-pack-zh-hans',
    openVsxId: 'ms-ceintl/vscode-language-pack-zh-hans',
    name: 'Chinese (Simplified) Language Pack',
    shortName: 'Language Pack',
    tagline: 'Microsoft · 中文 (简体) 界面',
    description:
      'Localises the entire VS Code UI (menus, commands, settings, dialogs) into Simplified Chinese. Auto-detects from your system locale and falls back to English when a string is missing.',
    icon: Languages,
    accent: 'from-red-500 to-amber-500',
    category: 'localization',
    size: '~3 MB',
  },
  {
    id: 'saoudrizwan.claude-dev',
    openVsxId: 'saoudrizwan/claude-dev',
    name: 'Cline',
    shortName: 'Cline AI',
    tagline: 'AI coding agent · Claude / GPT in your editor',
    description:
      'Brings a full AI agent into VS Code — reads your project, edits files, runs terminal commands, and iterates until the task is done. Supports Anthropic Claude, OpenAI, and local models. Pairs naturally with the OWASP analysis you can run inside this dashboard.',
    icon: Bot,
    accent: 'from-violet-500 to-fuchsia-500',
    category: 'ai',
    size: '~12 MB',
  },
  {
    id: 'ms-vsliveshare.vsliveshare',
    openVsxId: 'ms-vsliveshare/vsliveshare',
    name: 'Live Share',
    shortName: 'Live Share',
    tagline: 'Microsoft · real-time collaborative editing',
    description:
      'Share your local VS Code (or vscode.dev session) with a teammate in real time — shared editing, integrated voice chat, shared terminal, and shared debugging. They get the same view, you keep the cursor.',
    icon: Users,
    accent: 'from-blue-500 to-cyan-500',
    category: 'collab',
    size: '~8 MB',
  },
];

// ============================================================
// Helpers
// ============================================================

// Fire a `vscode:extension/<id>` URI. If the user has VS Code installed
// locally (and on macOS/Windows the OS knows about the protocol), the
// VS Code window will open with the install dialog ready to confirm.
// We listen for `blur` to heuristically confirm — when focus leaves the
// browser for a non-browser window, the install almost certainly started.
const triggerVSCodeInstall = (extensionId) => {
  return new Promise((resolve) => {
    const uri = `vscode:extension/${extensionId}`;

    // Create a hidden anchor so the browser fires the protocol handler.
    const a = document.createElement('a');
    a.href = uri;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);

    let focusLeft = false;
    const onBlur = () => {
      focusLeft = true;
      window.removeEventListener('blur', onBlur);
    };
    window.addEventListener('blur', onBlur);

    a.click();

    // Most browsers prompt synchronously when no handler is registered.
    // Give it a beat, then resolve and clean up.
    setTimeout(() => {
      document.body.removeChild(a);
      window.removeEventListener('blur', onBlur);
      resolve({ focusLeft });
    }, 600);
  });
};

// Opens the Open VSX extension page (works inside vscode.dev's iframe-
// free workflow). Used as the manual fallback when the protocol handler
// isn't available.
const openOpenVSX = (openVsxId) => {
  const url = `${OPEN_VSX_BASE}/${openVsxId}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

// Opens the vscode.dev extension page — the user can click "Install"
// in the browser, which works without any local install.
const openVSCodeDevExtension = (openVsxId) => {
  const url = `https://vscode.dev/editor/extension/${openVsxId}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

// ============================================================
// Extension card — install, manual fallback, status
// ============================================================
const ExtensionCard = ({ ext, status, onInstall, onOpenVSX, onOpenVSCodeDev }) => {
  const Icon = ext.icon;
  const isInstalled = status === 'installed';
  const isInstalling = status === 'installing';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${ext.accent}`} />

      {/* Status pill (top-right) */}
      <div className="absolute top-4 right-4 z-10">
        {isInstalled ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Marked installed
          </span>
        ) : isInstalling ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
            <Loader2 className="w-3 h-3 animate-spin" />
            Installing…
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <Download className="w-3 h-3" />
            Not installed
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3 pr-24">
          <div
            className={`w-11 h-11 rounded-xl bg-gradient-to-br ${ext.accent} flex items-center justify-center flex-shrink-0 shadow-md`}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">
              {ext.name}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{ext.tagline}</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {ext.description}
        </p>

        {/* Marketplace + Open VSX ids */}
        <div className="mt-3 grid grid-cols-1 gap-1.5">
          <div className="px-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              VS Code Marketplace
            </div>
            <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate">
              {ext.id}
            </div>
          </div>
          <div className="px-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Open VSX · {ext.size}
            </div>
            <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate">
              {ext.openVsxId}
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="mt-4 grid grid-cols-1 gap-2">
          {/* Primary: protocol-handler install (auto-triggers local VS Code) */}
          <button
            onClick={() => onInstall(ext)}
            disabled={isInstalling}
            className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
              isInstalled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20'
                : isInstalling
                ? 'bg-blue-500 text-white cursor-wait'
                : `bg-gradient-to-r ${ext.accent} hover:opacity-90 text-white shadow-md hover:shadow-lg active:scale-[0.98]`
            }`}
          >
            {isInstalling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Triggering installer…
              </>
            ) : isInstalled ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Re-trigger install
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Auto-install via VS Code
              </>
            )}
          </button>

          {/* Secondary: manual fallbacks */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onOpenVSCodeDev(ext)}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-[10px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Open the extension page on vscode.dev and click Install"
            >
              <Globe className="w-3 h-3" />
              vscode.dev
            </button>
            <button
              onClick={() => onOpenVSX(ext)}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-[10px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Open the Open VSX page (download the .VSIX and drag-drop into VS Code)"
            >
              <Package className="w-3 h-3" />
              Open VSX
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Recent projects strip
// ============================================================
const RecentProjects = ({ projects, onOpen }) => {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-5 sm:p-6 text-center">
        <FileCode className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          No recent projects yet. Open a folder or repo inside vscode.dev and it will
          show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {projects.slice(0, 6).map((p, i) => (
        <button
          key={i}
          onClick={() => onOpen(p)}
          className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all group"
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
  );
};

// ============================================================
// "How auto-install works" panel
// ============================================================
const HowItWorks = () => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
    <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <div>
        <h3 className="font-bold text-slate-900 dark:text-white">How auto-install works</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          What happens when you click an "Auto-install" button.
        </p>
      </div>
    </div>
    <div className="p-5 sm:p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-700 dark:text-blue-300 font-bold text-xs">
          1
        </div>
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            We fire a <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">vscode:extension/&lt;id&gt;</code> URL
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
            This is the same URL the "Install in VS Code" button on the marketplace
            generates. Your OS dispatches it to VS Code if VS Code is installed and
            registered as the protocol handler.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-700 dark:text-blue-300 font-bold text-xs">
          2
        </div>
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            VS Code opens with the install dialog
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
            VS Code shows the extension page with a one-click <em>Install</em> button.
            You confirm once and the extension is added to your VS Code instance.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-700 dark:text-blue-300 font-bold text-xs">
          3
        </div>
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            Settings Sync brings it to vscode.dev
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
            If you're signed into the same Microsoft / GitHub account in both
            desktop VS Code and vscode.dev, Settings Sync will mirror the
            extensions within a few seconds. Otherwise, use the{' '}
            <strong>vscode.dev</strong> fallback button on each card to install
            straight into the browser IDE.
          </p>
        </div>
      </div>

      <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
          No VS Code installed yet? Download the free build from{' '}
          <a
            href="https://code.visualstudio.com/Download"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            code.visualstudio.com
          </a>{' '}
          first, then come back. The installer registers the{' '}
          <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 font-mono">
            vscode:
          </code>{' '}
          protocol so this auto-install flow works for every extension on this page.
        </p>
      </div>
    </div>
  </div>
);

// ============================================================
// Page
// ============================================================
const IDEWorkspace = () => {
  const { showToast } = useToast();
  const { user } = useApp();

  // Marked-installed state — a hint to the user that they've initiated an
  // install (real install state lives in their VS Code, not in the browser).
  const [installs, setInstalls] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_INSTALL_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [extensions, setExtensions] = useState(DEFAULT_EXTENSIONS);
  const [projects, setProjects] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_PROJECTS_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    // Allow user to swap in additional extensions later (e.g. Python, Java).
    extras: '',
  });

  // Persist
  useEffect(() => {
    localStorage.setItem(LS_INSTALL_KEY, JSON.stringify(installs));
  }, [installs]);
  useEffect(() => {
    localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

  // ============================================================
  // Install handlers
  // ============================================================
  const handleInstall = useCallback(
    async (ext) => {
      // Set to "installing" immediately so the UI shows progress.
      setInstalls((prev) => ({
        ...prev,
        [ext.id]: { ...(prev[ext.id] || {}), status: 'installing', updatedAt: Date.now() },
      }));

      const { focusLeft } = await triggerVSCodeInstall(ext.id);

      // If focus left the browser, the VS Code window almost certainly opened.
      // Mark the extension as "installed" (meaning "install initiated") so
      // the UI updates immediately. The user can re-trigger if VS Code didn't
      // actually open (e.g. headless server, no protocol handler).
      setInstalls((prev) => ({
        ...prev,
        [ext.id]: {
          status: 'installed',
          focusLeft,
          installedAt: Date.now(),
          installedBy: user?.email || 'you',
        },
      }));

      if (focusLeft) {
        showToast(
          `VS Code opened — confirm the install for ${ext.shortName}.`,
          'success'
        );
      } else {
        showToast(
          `No VS Code handler detected — try the "vscode.dev" fallback on the ${ext.shortName} card.`,
          'warning'
        );
      }
    },
    [showToast, user]
  );

  const handleInstallAll = useCallback(async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const ext of extensions) {
        // eslint-disable-next-line no-await-in-loop
        await handleInstall(ext);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 700));
      }
      showToast('All 3 install requests dispatched.', 'success');
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, extensions, handleInstall, showToast]);

  // ============================================================
  // Launch helpers
  // ============================================================
  const handleLaunch = useCallback(
    (url, label) => {
      const win = window.open(url, 'eric-vscode', 'noopener,noreferrer');
      if (!win) {
        showToast('Pop-up blocked — allow pop-ups to launch vscode.dev.', 'error');
        return;
      }
      // Track the visit so it shows up in "Recent projects" with a clock skew.
      const proj = {
        name: label || 'vscode.dev',
        path: url,
        openedAt: Date.now() + Math.random(), // ensure unique sort
      };
      setProjects((prev) => {
        const without = prev.filter((p) => p.path !== proj.path);
        return [proj, ...without].slice(0, 12);
      });
      showToast(`${label || 'vscode.dev'} opened in a new window.`, 'success');
    },
    [showToast]
  );

  const openRepo = useCallback(
    (repoUrl) => {
      // Accepts any GitHub repo URL; vscode.dev has a special shortcut
      // https://vscode.dev/github/<owner>/<repo> for one-click open.
      let target = repoUrl;
      const ghMatch = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i);
      if (ghMatch) {
        target = `https://vscode.dev/github/${ghMatch[1]}/${ghMatch[2]}`;
      }
      handleLaunch(target, ghMatch ? `${ghMatch[1]}/${ghMatch[2]}` : repoUrl);
    },
    [handleLaunch]
  );

  const openProject = useCallback(
    (p) => {
      handleLaunch(p.path, p.name);
    },
    [handleLaunch]
  );

  // ============================================================
  // Add custom extensions from a comma/newline separated string
  // ============================================================
  const parsedExtras = useMemo(() => {
    return settings.extras
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((raw) => {
        // Accept "publisher.name" → marketplace id; vsid Open VSX format.
        const parts = raw.split('.');
        if (parts.length >= 2) {
          return {
            id: raw,
            openVsxId: parts.slice(0, 2).join('/'),
            name: raw,
            shortName: raw,
            tagline: 'Custom extension',
            description: 'Added manually from the settings panel.',
            icon: Package,
            accent: 'from-slate-500 to-slate-700',
            category: 'custom',
            size: 'unknown',
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [settings.extras]);

  const allExtensions = [...extensions, ...parsedExtras];

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
            vscode.dev IDE
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            The official Microsoft-hosted VS Code for the Web. No install, no Docker,
            no code-server. Open{' '}
            <a
              href={VSCODE_DEV_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
            >
              vscode.dev
            </a>{' '}
            and use it like desktop VS Code — including{' '}
            <strong>Cline</strong>, <strong>Live Share</strong>, and your{' '}
            <strong>language pack</strong>, all installed with one click from below.
          </p>
        </div>
        <a
          href={VSCODE_DEV_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
        >
          <ExternalLink className="w-4 h-4" />
          Open vscode.dev
        </a>
      </div>

      {/* ============================================================ */}
      {/* Hero: vscode.dev launcher + quick repo shortcuts                */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
              <Code2 className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  vscode.dev
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  Microsoft · VS Code for the Web
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                A full VS Code editor that runs entirely in your browser. Open a
                folder from your machine, a GitHub repo, or a remote container — no
                install, no Docker. Extensions you install below sync via{' '}
                <strong>Settings Sync</strong> so the same set of tools works whether
                you're on desktop or in the browser.
              </p>
            </div>
          </div>

          {/* Launch buttons */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => handleLaunch(VSCODE_DEV_URL, 'vscode.dev')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white shadow-md shadow-blue-500/30 hover:shadow-lg hover:shadow-blue-500/40 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Rocket className="w-4 h-4" />
              Launch vscode.dev
            </button>
            <button
              onClick={() => handleLaunch(VSCODE_DEV_INSIDERS_URL, 'vscode.dev Insiders')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" />
              Launch Insiders build
            </button>
            <button
              onClick={() => handleLaunch(`${VSCODE_DEV_URL}?vscode-revision=stable`, 'vscode.dev')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <PlayCircle className="w-4 h-4" />
              Open with stable channel
            </button>
          </div>

          {/* Quick open: GitHub repo */}
          <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Open a GitHub repo in vscode.dev
              </span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const url = e.target.elements.repoUrl.value;
                if (url.trim()) openRepo(url.trim());
              }}
              className="flex items-center gap-2"
            >
              <input
                name="repoUrl"
                type="url"
                placeholder="https://github.com/<owner>/<repo>"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white transition-colors"
              >
                Open
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Extensions — auto-install + manual fallback                     */}
      {/* ============================================================ */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <Package className="w-5 h-5 text-violet-500" />
              Extensions setup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Three extensions configured for this IDE. Click <em>Auto-install</em>{' '}
              on each card to trigger VS Code's installer via the{' '}
              <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                vscode:
              </code>{' '}
              protocol. No VS Code installed? Use the <em>vscode.dev</em> fallback
              button on each card.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              {showSettings ? 'Hide settings' : 'Settings'}
            </button>
            <button
              onClick={handleInstallAll}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-md shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Installing…
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Install all 3
                </>
              )}
            </button>
          </div>
        </div>

        {/* Settings panel (custom extensions) */}
        {showSettings && (
          <div className="mb-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <SettingsIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Custom extensions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Add any extra extensions to auto-install. Use the marketplace id
                  format:{' '}
                  <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                    publisher.extension-name
                  </code>
                  . One per line, or comma-separated.
                </p>
                <textarea
                  value={settings.extras}
                  onChange={(e) => setSettings({ ...settings, extras: e.target.value })}
                  rows={4}
                  placeholder="dbaeumer.vscode-eslint&#10;esbenp.prettier-vscode&#10;ms-python.python"
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {parsedExtras.length > 0 && (
                  <p className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                    {parsedExtras.length} custom extension
                    {parsedExtras.length === 1 ? '' : 's'} added below.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allExtensions.map((ext) => (
            <ExtensionCard
              key={ext.id}
              ext={ext}
              status={installs[ext.id]?.status}
              onInstall={handleInstall}
              onOpenVSX={openOpenVSX}
              onOpenVSCodeDev={openVSCodeDevExtension}
            />
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Two columns: How it works | Recent projects                     */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <HowItWorks />
        </div>
        <div className="lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white inline-flex items-center gap-2 mb-3">
            <FileCode className="w-5 h-5 text-blue-500" />
            Recent IDE sessions
          </h2>
          <RecentProjects projects={projects} onOpen={openProject} />
        </div>
      </div>

      {/* Footer note: why no iframe */}
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3 text-xs text-slate-500 dark:text-slate-400">
        <Eye className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-700 dark:text-slate-300">Why a launch button instead of an embedded iframe?</strong>{' '}
          vscode.dev sends{' '}
          <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
            Content-Security-Policy: frame-ancestors 'none'
          </code>{' '}
          — Microsoft explicitly disallows embedding from any origin. The launcher
          above opens vscode.dev in a fresh window so it can use the full set of
          browser APIs (clipboard, IndexedDB, File System Access) that the in-page
          experience needs.
        </p>
      </div>
    </div>
  );
};

export default IDEWorkspace;