import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  LayoutDashboard, 
  Code2,
  ScanSearch,
  AlertTriangle,
  Bell,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  Search,
  FileText,
  Users,
  Key,
  ClipboardList,
  Home,
  X,
  HelpCircle,
  Bot,
  Sun,
  Moon,
  Keyboard,
  User,
  Rocket,
  Sparkles,
  ShieldCheck,
  Server,
} from 'lucide-react';
import { useToast } from '../Toast';
import ThemeToggle from './ThemeToggle';
import { dashboardAPI } from '../../services/api';
import {
  buildWorkbenchUrl,
  getCodeServerStatus,
  getUserWorkspace,
  getUserWorkbenchStatus,
  launchUserWorkbench,
  startCodeServer,
  waitForCodeServer,
} from '../../services/codeServer';
import { applyAccentColor, DEFAULT_ACCENT } from '../../utils/accentColor';

// Animated Background Component
const AnimatedBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {/* Gradient Orbs — slightly brighter in dark mode for visibility */}
    <div 
      className="absolute w-[600px] h-[600px] rounded-full opacity-10 dark:opacity-25 animate-orb-1"
      style={{
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.6) 0%, transparent 70%)',
        top: '-200px',
        right: '-100px',
      }}
    />
    <div 
      className="absolute w-[400px] h-[400px] rounded-full opacity-10 dark:opacity-20 animate-orb-2"
      style={{
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.5) 0%, transparent 70%)',
        bottom: '-100px',
        left: '-100px',
      }}
    />
    <div 
      className="absolute w-[300px] h-[300px] rounded-full opacity-[0.08] dark:opacity-20 animate-orb-3"
      style={{
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.5) 0%, transparent 70%)',
        top: '40%',
        left: '30%',
      }}
    />
    
    {/* Floating Particles */}
    {[...Array(15)].map((_, i) => (
      <div
        key={i}
        className="absolute w-2 h-2 bg-blue-400/20 dark:bg-blue-300/30 rounded-full animate-particle"
        style={{
          left: `${5 + i * 6}%`,
          top: `${10 + (i % 5) * 18}%`,
          animationDelay: `${i * 0.5}s`,
          animationDuration: `${8 + i % 4}s`,
        }}
      />
    ))}
    
    {/* Grid Pattern */}
    <div 
      className="absolute inset-0 opacity-[0.02] dark:opacity-[0.06]"
      style={{
        backgroundImage: `linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }}
    />
  </div>
);

// Wrapper component that re-mounts its Outlet every time the location
// pathname changes, so the entrance animation plays on every navigation
// between nested routes (Dashboard -> IDE -> Analysis, etc).
const OutletWrapper = () => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="h-full page-slide-enter">
      <Outlet />
    </div>
  );
};

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/security', label: 'Security', icon: ShieldCheck },
  { path: '/team', label: 'Team', icon: Users },
];

// Tools nav. Most items are local React routes. The Code Server entry
// is an action rather than a link: it launches the real coder/code-server
// workbench, starting it first if it is not already listening on port
// 8080.
const CODE_SERVER_URL = 'http://127.0.0.1:8080';

const TOOLS_ITEMS = [
  {
    label: 'Code Server',
    icon: Server,
    action: 'code-server',
  },
  { path: '/owasp', label: 'OWASP Scanner', icon: ShieldCheck },
];

// Render a short loading card inside the freshly opened popup so the user
// sees something meaningful while code-server boots. The popup starts on
// `about:blank`, which is same-origin, so we can write into it directly.
const writeLauncherCard = (win, message, detail) => {
  if (!win || win.closed) return;
  try {
    win.document.title = 'Project Eric — code-server';
    win.document.body.innerHTML = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;height:100vh;margin:0;
                  display:flex;flex-direction:column;align-items:center;justify-content:center;
                  gap:14px;background:#0b1220;color:#e2e8f0;text-align:center;padding:24px">
        <div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#06b6d4);
                    display:flex;align-items:center;justify-content:center;font-size:22px">&#60;/&gt;</div>
        <div style="font-size:15px;font-weight:600">${message}</div>
        <div style="font-size:12px;color:#94a3b8;max-width:420px;line-height:1.5">${detail || ''}</div>
        <div style="width:220px;height:4px;border-radius:999px;background:#1e293b;overflow:hidden">
          <div style="width:40%;height:100%;border-radius:999px;background:linear-gradient(90deg,#2563eb,#06b6d4);
                      animation:ericSlide 1.1s ease-in-out infinite"></div>
        </div>
      </div>
      <style>@keyframes ericSlide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}</style>`;
  } catch {
    /* the popup already navigated away — nothing to paint */
  }
};

const SYSTEM_ITEMS = [
  { path: '/audit-logs', label: 'Audit Logs', icon: ClipboardList },
];

const Layout = () => {
  const { user, logout, resolvedTheme, setTheme, accentColor } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // The account's own alerts. The list used to be a fixed set of demo
  // entries, so a brand-new account was told about a SQL injection in a
  // project it does not own. The API owns the list now.
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await dashboardAPI.getNotifications();
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(list);
      setUnreadCount(typeof data?.unread === 'number' ? data.unread : list.filter((n) => !n.read).length);
    } catch {
      // The backend is unreachable. An empty list is the honest answer:
      // there is nothing to report.
      setNotifications([]);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Refresh the bell whenever the window regains focus, so a scan that
  // finished in another tab shows up without a manual reload.
  useEffect(() => {
    const onFocus = () => loadNotifications();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadNotifications]);

  // Initialize dark mode + accent color from localStorage on mount (before paint to avoid flash)
  useEffect(() => {
    const savedTheme = localStorage.getItem('project-eric_theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
    const savedAccent = localStorage.getItem('project-eric_accent') || DEFAULT_ACCENT;
    applyAccentColor(savedAccent);
  }, []);

  // Keep <html> in sync if theme changes from elsewhere.
  // `resolvedTheme` is used rather than `theme`, so the 'system'
  // option keeps following the operating system instead of being
  // forced back to light.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // Keep <html> accent custom property in sync if accent changes elsewhere
  useEffect(() => {
    if (accentColor) {
      applyAccentColor(accentColor);
    }
  }, [accentColor]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.dropdown-container') && !e.target.closest('.search-container')) {
        setNotificationsOpen(false);
        setProfileOpen(false);
        setHelpOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Toggle dark mode — flips the theme immediately on click so the
  // transition begins the moment the user presses the button. The
  // existing `html.theme-transition` rule in index.css animates all
  // colors over 300ms for a smooth blend across every surface.
  //
  // With the 'system' theme selected the toggle switches to the
  // opposite of what is on screen, which turns the choice into an
  // explicit one rather than fighting the operating system.
  const toggleDarkMode = useCallback(() => {
    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.add('theme-transition');
    root.classList.toggle('dark', newTheme === 'dark');
    setTheme(newTheme);
    // Drop the helper class after the animation so it doesn't affect
    // normal hover/focus transitions.
    setTimeout(() => root.classList.remove('theme-transition'), 350);
  }, [resolvedTheme, setTheme]);

  // Signing out has to finish *before* the navigation.
  //
  // `logout()` is asynchronous: it calls the API, clears the token and
  // drops the user. Navigating to /login before that happened left the
  // session state saying "signed in", so the auth guard bounced the
  // browser back to /dashboard, and the cleared session then pushed it
  // to /landing — the visitor ended up on the marketing page instead of
  // the sign-in page.
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // ---- Launch the coder/code-server workbench ----------------------------
  //
  // The sidebar entry is the app's shortcut into the real editor. It
  // talks to the workbench through `src/services/codeServer.js`: we probe
  // the health endpoint, and — while the Vite dev server is running — we
  // can start code-server on demand through scripts/start-ide.ps1.
  //
  // The workbench belongs to the signed-in account. The API owns that
  // mapping (it is stored in MySQL), so we ask it which workspace to
  // open and let the dev middleware bring that account's instance up.
  // When the API or the middleware cannot be reached we fall back to the
  // shared workbench, still opening the account's folder in it.
  //
  // The popup is opened synchronously so the browser's pop-up blocker
  // sees a user gesture. While code-server boots we paint a loading card
  // into that window instead of leaving a blank page behind.
  const [codeServerState, setCodeServerState] = useState('idle'); // idle | starting

  const handleOpenCodeServer = useCallback(async () => {
    if (codeServerState !== 'idle') return;
    setCodeServerState('starting');

    const win = window.open('about:blank', 'eric-code-server');
    if (win) {
      writeLauncherCard(win, 'Connecting to code-server…', CODE_SERVER_URL);
    }

    try {
      // ---- The account's own workspace ----------------------------------
      const account = await getUserWorkspace();
      const workspaceName = account?.workspace?.name || null;
      const workspacePath = account?.workspace?.path || null;

      if (workspaceName) {
        writeLauncherCard(
          win,
          'Starting your workbench…',
          `Project Eric is opening the IDE workspace that belongs to ${account?.user?.name || 'your account'}.`
        );

        const launched = await launchUserWorkbench({ workspaceName });

        if (launched.ok) {
          // The instance may still be booting — poll until it answers.
          let ready = false;
          for (let i = 0; i < 60 && !ready; i++) {
            const state = await getUserWorkbenchStatus({ workspaceName });
            ready = state.running;
            if (!ready) {
              await new Promise((r) => setTimeout(r, 1000));
              writeLauncherCard(win, 'Starting your workbench…', 'Waiting for your workbench to answer.');
            }
          }

          if (ready) {
            const target = buildWorkbenchUrl({
              url: launched.url || account?.workspace?.codeServerUrl,
              folder: workspacePath,
            });
            if (win) {
              win.location.href = target;
            } else {
              showToast('Pop-up blocked — opening code-server in this tab instead.', 'warning');
              window.location.href = target;
            }
            showToast('Your code-server workbench is open.', 'success');
            return;
          }
        }

        // The per-account instance could not be started (no dev server,
        // or code-server is not installed). Fall through to the shared
        // workbench below, still on the account's folder.
        writeLauncherCard(
          win,
          'Connecting to code-server…',
          'Opening the shared workbench on your account folder.'
        );
      }

      // ---- Shared workbench (fallback) -----------------------------------
      let status = await getCodeServerStatus();

      if (!status.running) {
        if (!status.managed) {
          // Production build — there is no dev middleware to launch it for us.
          showToast(
            'code-server is not running. Start it with `npm run ide:start`, then click Code Server again.',
            'warning',
            9000
          );
          win?.close();
          return;
        }

        writeLauncherCard(
          win,
          'Starting code-server…',
          'Project Eric is launching the workbench from coder/code-server. This takes a few seconds.'
        );
        showToast('Starting code-server — this takes a few seconds…', 'info');

        const started = await startCodeServer();
        if (!started.ok) {
          showToast(started.error || 'Could not start code-server.', 'error', 10000);
          win?.close();
          return;
        }

        const up = await waitForCodeServer({
          timeoutMs: 60000,
          onTick: () =>
            writeLauncherCard(win, 'Starting code-server…', 'Waiting for the workbench to answer on port 8080.'),
        });

        if (!up) {
          showToast(
            'code-server did not come up in time. Check C:\\tools\\code-server\\logs\\code-server.log.',
            'error',
            12000
          );
          win?.close();
          return;
        }

        status = await getCodeServerStatus();
      }

      // Open the workbench with the Project Eric workspace already loaded
      // in the Explorer. The account's own folder wins when we know it.
      const target = buildWorkbenchUrl({
        folder: workspacePath || status.workspace,
      });

      if (win) {
        win.location.href = target;
      } else {
        showToast('Pop-up blocked — opening code-server in this tab instead.', 'warning');
        window.location.href = target;
      }
      showToast('code-server opened.', 'success');
    } catch (err) {
      showToast(err?.message || 'Could not open code-server.', 'error', 10000);
      win?.close();
    } finally {
      setCodeServerState('idle');
    }
  }, [codeServerState, showToast]);

  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    return paths.map((path, index) => ({
      label: path.charAt(0).toUpperCase() + path.slice(1),
      path: '/' + paths.slice(0, index + 1).join('/'),
      isLast: index === paths.length - 1
    }));
  };

  // "2 min ago" style stamps for the bell and the dropdown.
  const relativeTime = (value) => {
    if (!value) return '';
    const then = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(then.getTime())) return String(value);
    const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return then.toLocaleDateString();
  };

  const markAllNotificationsRead = async () => {
    if (unreadCount === 0) return;
    // Update the list locally first so the badge clears at once, then
    // confirm it with the server.
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await dashboardAPI.markAllNotificationsRead();
    } catch {
      loadNotifications();
    }
  };

  const SidebarContent = ({ collapsed = false, onClose = null }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <img src="/Logo.png" alt="Logo" className="w-9 h-9" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Project Eric</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Security Platform</span>
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Main Nav */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 pb-2 pt-1">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Main</span>
            </div>
          )}

          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                  isActive
                    ? 'eric-nav-active'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          ))}

          {/* About Dev Team — pinned under Main so the hierarchy is consistent */}
          <NavLink
            to="/about-team"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'eric-nav-active'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <Users className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">About Dev Team</span>}
          </NavLink>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-slate-100 dark:border-slate-800"></div>

        {/* Tools — Sandbox & OWASP dedicated pages */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 pb-2">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tools</span>
            </div>
          )}

          {TOOLS_ITEMS.map((item) =>
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white ${collapsed ? 'justify-center' : ''}`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </a>
            ) : item.action === 'code-server' ? (
              <button
                key={item.label}
                onClick={handleOpenCodeServer}
                disabled={codeServerState !== 'idle'}
                title={`Open the coder/code-server workbench (${CODE_SERVER_URL}) — starts it if it is not already running`}
                className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-60 disabled:cursor-wait ${collapsed ? 'justify-center' : ''}`}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${codeServerState !== 'idle' ? 'animate-pulse' : ''}`} />
                {!collapsed && (
                  <span className="text-sm font-medium">
                    {codeServerState !== 'idle' ? 'Starting…' : item.label}
                  </span>
                )}
              </button>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                    isActive
                      ? 'eric-nav-active-gradient'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  } ${collapsed ? 'justify-center' : ''}`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </NavLink>
            )
          )}
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-slate-100 dark:border-slate-800"></div>

        {/* System Nav */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 pb-2">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">System</span>
            </div>
          )}

          {SYSTEM_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              // The path is matched exactly so the entry only lights up on
              // its own page rather than on every nested route below it.
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                  isActive
                    ? 'eric-nav-active'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          ))}
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-slate-100 dark:border-slate-800"></div>

        {/* Settings & Logout */}
        <div className="space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'eric-nav-active'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Settings</span>}
          </NavLink>

          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
        </div>

        {/* Keyboard Shortcuts Hint — pinned to bottom of the sidebar */}
        {!collapsed && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm">
            <div className="eric-accent-soft rounded-xl p-4 border border-slate-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <Keyboard className="w-4 h-4 eric-accent-text" />
                <span className="text-xs font-semibold eric-accent-text">Keyboard Shortcuts</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Search</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded text-slate-500 dark:text-slate-300 shadow-sm">⌘</kbd>
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded text-slate-500 dark:text-slate-300 shadow-sm">K</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Dashboard</span>
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded text-slate-500 dark:text-slate-300 shadow-sm">G D</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Analysis</span>
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded text-slate-500 dark:text-slate-300 shadow-sm">G A</kbd>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>
    </div>
  );

  const getUserInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const userInitials = getUserInitials(user?.name);
  const userName = user?.name || 'User';
  const userEmail = user?.email || 'user@example.com';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 relative">
      {/* Animated Background */}
      <AnimatedBackground />
      
      {/* Sidebar and Main Content */}
      <div className="relative z-10 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col h-screen sticky top-0 glass-surface dark:!bg-slate-900/80 dark:border-r-slate-800 transition-all duration-300 relative z-20 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <SidebarContent collapsed={sidebarCollapsed} />

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-all z-30"
        >
          <ChevronRight className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${sidebarCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
          <aside className={`fixed inset-y-0 left-0 w-72 glass-surface dark:!bg-slate-900/90 dark:border-r-slate-800 z-50 transform transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <SidebarContent onClose={() => setMobileMenuOpen(false)} />
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Minimal Header
            The header sits above the click-outside overlay (z-20) so the
            dropdowns it holds stay clickable. The overlay used to be above
            the header, which made "Mark all read" and the other dropdown
            buttons unclickable. */}
        <header className="h-14 glass-header flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          {/* Left: Menu & Breadcrumbs */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            {/* Breadcrumbs */}
            <nav className="hidden sm:flex items-center gap-2 text-sm">
              <button 
                onClick={() => navigate('/')}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200 transition-colors"
              >
                <Home className="w-4 h-4" />
              </button>
              {getBreadcrumbs().map((crumb, index) => (
                <React.Fragment key={crumb.path}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                  <button
                    onClick={() => !crumb.isLast && navigate(crumb.path)}
                    className={`${
                      crumb.isLast 
                        ? 'text-slate-900 dark:text-slate-100 font-medium' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    } transition-colors`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative search-container">
              <button
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  setNotificationsOpen(false);
                  setProfileOpen(false);
                  setHelpOpen(false);
                }}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 rounded-lg transition-colors"
              >
                <Search className="w-4 h-4" />
                <span className="text-sm">Search...</span>
                <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-400 dark:text-slate-500">⌘K</kbd>
              </button>

              {searchOpen && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-slate-900 rounded-xl z-50 animate-scale-in border border-slate-200 dark:border-slate-700/60 shadow-xl">
                  <div className="p-3 border-b border-slate-100">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                      <Search className="w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search features, settings, docs..."
                        className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-slate-400 uppercase">Quick Links</div>
                    <button onClick={() => { navigate('/security?tab=findings'); setSearchOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <ScanSearch className="w-5 h-5 text-blue-500" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-slate-700">View Findings</div>
                        <div className="text-xs text-slate-400">Full OWASP security analysis</div>
                      </div>
                    </button>
                    <button onClick={() => { navigate('/sandbox'); setSearchOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <Sparkles className="w-5 h-5 text-purple-500" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-slate-700">Open Code IDE</div>
                        <div className="text-xs text-slate-400">Start coding securely</div>
                      </div>
                    </button>
                    <button onClick={() => { navigate('/security?tab=threats'); setSearchOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-slate-700">View Threats</div>
                        <div className="text-xs text-slate-400">Check security vulnerabilities</div>
                      </div>
                    </button>
                    <button onClick={() => { navigate('/security?tab=reports'); setSearchOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <FileText className="w-5 h-5 text-emerald-500" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-slate-700">Generate Report</div>
                        <div className="text-xs text-slate-400">Create security reports</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Help */}
            <div className="relative dropdown-container">
              <button
                onClick={() => {
                  setHelpOpen(!helpOpen);
                  setNotificationsOpen(false);
                  setProfileOpen(false);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 rounded-lg transition-colors"
              >
                <HelpCircle className="w-5 h-5" />
              </button>

              {helpOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl z-50 animate-scale-in border border-slate-200 dark:border-slate-700/60 shadow-xl">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900">Help & Support</h3>
                  </div>
                  <div className="p-2">
                    <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">Documentation</div>
                        <div className="text-xs text-slate-500">Browse guides and tutorials</div>
                      </div>
                    </a>
                    <a href="https://support.example.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">AI Assistant</div>
                        <div className="text-xs text-slate-500">Get help from our AI bot</div>
                      </div>
                    </a>
                    <a href="mailto:support@example.com" className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Users className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">Contact Support</div>
                        <div className="text-xs text-slate-500">Email our support team</div>
                      </div>
                    </a>
                    <div className="border-t border-slate-100 mt-2 pt-2 px-3 pb-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Version 1.0.0</span>
                        <span>© 2024 Project Eric</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle — illustrated day/night switch */}
            <ThemeToggle theme={resolvedTheme} onToggle={toggleDarkMode} />

            {/* Notifications */}
            <div className="relative dropdown-container">
              <button
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setProfileOpen(false);
                }}
                className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  /* `red-700` rather than `red-500`: the count is 10px
                     white text, and red-500 only scores 3.76:1 against
                     it. red-700 scores 6.47:1, which stays clear of the
                     4.5:1 floor even while the badge pulses. */
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-700 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>
              
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl z-50 animate-scale-in border border-slate-200 dark:border-slate-700/60 shadow-xl">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
                    <button
                      onClick={markAllNotificationsRead}
                      disabled={unreadCount === 0}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium disabled:opacity-40 disabled:cursor-default"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 && (
                      <div className="p-6 text-center">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">You are all caught up</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Alerts about your scans and findings show up here.
                        </p>
                      </div>
                    )}
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => {
                          if (notif.read) return;
                          setNotifications((prev) =>
                            prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
                          );
                          setUnreadCount((c) => Math.max(0, c - 1));
                          dashboardAPI.markNotificationRead(notif.id).catch(() => loadNotifications());
                        }}
                        className={`p-4 border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors ${!notif.read ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                            notif.type === 'error' ? 'bg-red-500' :
                            notif.type === 'warning' ? 'bg-amber-500' :
                            notif.type === 'success' ? 'bg-emerald-500' :
                            'bg-blue-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{notif.title}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{notif.message}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{relativeTime(notif.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 text-center border-t border-slate-100 dark:border-slate-700/60">
                    <button
                      onClick={() => navigate('/notifications')}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile */}
            <div className="relative dropdown-container">
              <button
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotificationsOpen(false);
                  setHelpOpen(false);
                }}
                className="flex items-center gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                aria-label={`Open profile menu for ${userName}`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">{userInitials}</span>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${profileOpen ? 'rotate-90' : ''}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl z-50 animate-scale-in border border-slate-200 dark:border-slate-700/60 shadow-xl">
                  <div className="p-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white text-lg font-medium">{userInitials}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{userName}</div>
                        <div className="text-sm text-slate-500 truncate">{userEmail}</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <button onClick={() => { navigate('/profile'); setProfileOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <User className="w-5 h-5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">My Profile</span>
                    </button>
                    <button onClick={() => { navigate('/settings'); setProfileOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <Settings className="w-5 h-5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">Settings</span>
                    </button>
                    <button onClick={() => { navigate('/api-keys'); setProfileOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                      <Key className="w-5 h-5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">API Keys</span>
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        if (typeof window !== 'undefined' && window.__restartEricTour) {
                          window.__restartEricTour();
                        } else {
                          localStorage.removeItem('eric_welcome_tour_seen');
                          showToast('Tour will start next time you visit the dashboard.', 'info');
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <Rocket className="w-5 h-5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">Restart Tour</span>
                    </button>
                    <div className="border-t border-slate-100 my-2" />
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 hover:bg-red-50 rounded-lg transition-colors group">
                      <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500" />
                      <span className="text-sm font-medium text-slate-700 group-hover:text-red-600">Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content — wrapped in a transition div that re-mounts on
            every nested route change so the entrance animation plays. */}
        <main className="flex-1 overflow-auto">
          <OutletWrapper />
        </main>
      </div>

      {/* Click outside to close dropdowns. It sits below the header
          (z-30) so it catches clicks on the page content without
          covering the dropdowns themselves. */}
      {notificationsOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setNotificationsOpen(false);
          }}
        />
      )}
    </div>
    </div>
  );
};

export default Layout;
