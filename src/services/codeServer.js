/**
 * code-server client
 *
 * Project Eric runs [coder/code-server](https://github.com/coder/code-server)
 * as a local VS Code-in-the-browser. This module is the one place the React
 * app talks to that process:
 *
 *   - `probeCodeServer()`      is the workbench answering?
 *   - `getCodeServerStatus()`  richer status (workspace path, managed?)
 *   - `startCodeServer()`      launch it (dev server only)
 *   - `stopCodeServer()`       stop it (dev server only)
 *   - `waitForCodeServer()`    block until it answers
 *   - `getUserWorkspace()`     the signed-in account's own IDE workspace
 *   - `launchUserWorkbench()`  bring that account's workbench up
 *
 * The control endpoints are served by Vite's dev middleware
 * (`scripts/dev-server-plugin.js`) and therefore only exist while the dev
 * server is running. In a production build the module degrades to a
 * read-only probe: we can still detect and open a running workbench, we
 * just cannot start one on the user's behalf.
 */

import { dashboardAPI } from './api';

// Default location of the workbench. `start-ide.ps1` binds the same
// address, so the two must stay in sync.
export const CODE_SERVER_URL =
  import.meta.env.VITE_CODE_SERVER_URL || 'http://127.0.0.1:8080';

export const CODE_SERVER_HEALTHZ = `${CODE_SERVER_URL}/healthz`;

/**
 * Same-origin path the dev server proxies the workbench on.
 *
 * `vite.config.js` forwards `/vscode` to code-server, which serves the
 * workbench under `/vscode` natively. Because the workbench's own asset
 * URLs are relative, it renders correctly inside the prefix.
 *
 * The point of routing through the dev server rather than hitting
 * `CODE_SERVER_URL` directly is origin. An iframe pointed at
 * `http://127.0.0.1:8080` is cross-origin from the dashboard, so the
 * page cannot read into it — which rules out relaying a guest's mouse
 * and keyboard input into the workbench. The same-origin path removes
 * that restriction.
 */
export const CODE_SERVER_EMBED_PATH = '/vscode';

// The upstream project this workbench is built from. Used for the
// "source" affordances in the UI.
export const CODE_SERVER_REPO = 'https://github.com/coder/code-server';

// Fallback workspace path — only used when the dev server cannot tell us
// the real one. Must match `$Workspace` in `scripts/start-ide.ps1`.
export const CODE_SERVER_FALLBACK_WORKSPACE = 'C:\\Users\\Public\\project-eric-ide';

// Last known workspace path, so the UI can render it before the first
// status call resolves.
let knownWorkspace = null;

/**
 * Forget the remembered workspace.
 *
 * Only used by the test suite, so one test cannot leave a workspace
 * behind for the next one.
 */
export const _resetWorkspaceCache = () => {
  knownWorkspace = null;
};

/**
 * Ask the workbench whether it is up. Uses `no-cors` so we do not need
 * CORS headers on the code-server side just to know the port answers.
 *
 * @returns {Promise<boolean>}
 */
export async function probeCodeServer({ url = CODE_SERVER_URL, timeoutMs = 2500 } = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/healthz`, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return !!res && (res.ok || res.type === 'opaque');
  } catch {
    return false;
  }
}

/**
 * Full status of the workbench.
 *
 * When the Vite dev server is running we ask it for the managed status —
 * it knows whether the launcher can start code-server and where the
 * workspace lives. Otherwise we fall back to a plain health probe.
 *
 * @returns {Promise<{running: boolean, workspace: string|null, managed: boolean}>}
 */
export async function getCodeServerStatus({ url = CODE_SERVER_URL } = {}) {
  try {
    const res = await fetch('/api/code-server/status', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      knownWorkspace = data.workspace || knownWorkspace;
      return {
        running: !!data.running,
        // The dev middleware may not know the workspace yet (it starts
        // code-server lazily), so fall back to the default rather than
        // handing the caller a null it cannot render.
        workspace: knownWorkspace || CODE_SERVER_FALLBACK_WORKSPACE,
        managed: data.managed !== false,
        url: data.url || url,
      };
    }
  } catch {
    /* production build — no dev middleware, fall through to the probe */
  }

  const running = await probeCodeServer({ url });
  return {
    running,
    workspace: knownWorkspace || CODE_SERVER_FALLBACK_WORKSPACE,
    managed: false,
    url,
  };
}

/**
 * Ask the dev middleware to launch (or stop) code-server.
 *
 * @param {'start'|'stop'} mode
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function controlCodeServer(mode = 'start') {
  try {
    const res = await fetch('/api/code-server', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `Could not ${mode} code-server.` };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        'The dashboard is not running its dev server, so it cannot launch code-server for you. ' +
        'Run `npm run ide:start` in a terminal instead.',
    };
  }
}

export const startCodeServer = () => controlCodeServer('start');
export const stopCodeServer = () => controlCodeServer('stop');

/**
 * Poll until the workbench answers or the deadline passes.
 *
 * @param {{url?: string, timeoutMs?: number, intervalMs?: number, onTick?: Function}} options
 * @returns {Promise<boolean>} true when the workbench came up
 */
export async function waitForCodeServer({
  url = CODE_SERVER_URL,
  timeoutMs = 60000,
  intervalMs = 1000,
  onTick,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeCodeServer({ url })) return true;
    if (onTick) onTick();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Build the URL that opens the workbench with the workspace folder
 * pre-opened in the Explorer.
 *
 * The `folder` query parameter has to be a POSIX-style absolute path.
 * code-server hands it to VS Code as a workspace path, and VS Code treats
 * a leading Windows drive letter (`C:`) as a URL scheme — `?folder=C:/x`
 * resolves to nothing, and the Explorer stays empty.
 *
 * Prefixing with `/` makes it an absolute path (`/C:/Users/...`), which
 * VS Code normalises back to the real Windows folder.
 */
export function buildWorkbenchUrl({ url = CODE_SERVER_URL, folder } = {}) {
  const target = folder || knownWorkspace || CODE_SERVER_FALLBACK_WORKSPACE;
  if (!target) return `${url}/`;
  // Normalise backslashes to forward slashes and strip any leading slash.
  const posix = String(target).replace(/\\/g, '/').replace(/^\/+/, '');
  return `${url}/?folder=${encodeURIComponent(`/${posix}`)}`;
}

/**
 * The workbench URL on the dashboard's own origin.
 *
 * Same `folder` handling as {@link buildWorkbenchUrl}, but routed through
 * the dev server's `/vscode` proxy so the result is same-origin with the
 * dashboard page. Use this whenever the workbench is embedded in an
 * iframe; use {@link buildWorkbenchUrl} when it opens in its own window.
 */
export function buildEmbeddedWorkbenchUrl({ folder } = {}) {
  const target = folder || knownWorkspace || CODE_SERVER_FALLBACK_WORKSPACE;
  if (!target) return `${CODE_SERVER_EMBED_PATH}/`;
  const posix = String(target).replace(/\\/g, '/').replace(/^\/+/, '');
  return `${CODE_SERVER_EMBED_PATH}/?folder=${encodeURIComponent(`/${posix}`)}`;
}

// ---------------------------------------------------------------------------
// Per-account workbench
//
// Every Project Eric account gets its own code-server instance, its own
// folder and its own editor state, so two accounts never see each other's
// files. The mapping is owned by the API (it lives in MySQL), so the
// dashboard asks the backend which workspace belongs to the signed-in
// account and then asks the dev middleware to bring that workbench up.
//
// Without the dev server (a production build) the API still reports the
// workspace, so the UI can show it — it just cannot launch code-server.
// ---------------------------------------------------------------------------

/**
 * The signed-in account's profile and its IDE workspace.
 *
 * @returns {Promise<{user: object, workspace: {name, path, codeServerUrl}}|null>}
 */
export async function getUserWorkspace() {
  try {
    const data = await dashboardAPI.getWorkspace();
    if (!data?.workspace) return null;
    knownWorkspace = data.workspace.path || knownWorkspace;
    return {
      user: data.user || null,
      workspace: {
        name: data.workspace.name,
        path: data.workspace.path,
        codeServerUrl: data.workspace.codeServerUrl || CODE_SERVER_URL,
        lastOpenedAt: data.workspace.lastOpenedAt || null,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Bring the account's workbench up and return the URL to open it on.
 *
 * @param {{workspaceName: string}} options
 * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
 */
export async function launchUserWorkbench({ workspaceName }) {
  if (!workspaceName) {
    return { ok: false, error: 'This account has no workspace yet.' };
  }
  try {
    const res = await fetch('/api/code-server/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.error || 'Could not start the workbench.' };
    }
    return { ok: true, url: data.url, path: data.path, port: data.port };
  } catch {
    return {
      ok: false,
      error:
        'The dashboard is not running its dev server, so it cannot start code-server for you. ' +
        'Run `npm run ide:start` in a terminal instead.',
    };
  }
}

/**
 * Is the account's own workbench answering?
 *
 * @param {{workspaceName: string}} options
 * @returns {Promise<{running: boolean, url: string|null}>}
 */
export async function getUserWorkbenchStatus({ workspaceName }) {
  if (!workspaceName) return { running: false, url: null };
  try {
    const res = await fetch(
      `/api/code-server/user-status?workspaceName=${encodeURIComponent(workspaceName)}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return { running: false, url: null };
    const data = await res.json();
    return { running: !!data.running, url: data.url || null };
  } catch {
    return { running: false, url: null };
  }
}

export default {
  CODE_SERVER_URL,
  CODE_SERVER_HEALTHZ,
  CODE_SERVER_EMBED_PATH,
  CODE_SERVER_REPO,
  probeCodeServer,
  getCodeServerStatus,
  startCodeServer,
  stopCodeServer,
  waitForCodeServer,
  buildWorkbenchUrl,
  buildEmbeddedWorkbenchUrl,
  getUserWorkspace,
  launchUserWorkbench,
  getUserWorkbenchStatus,
  _resetWorkspaceCache,
};
