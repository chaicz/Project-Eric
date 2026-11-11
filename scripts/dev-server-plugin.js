// scripts/dev-server-plugin.js
//
// Vite dev-server middleware that lets the React dashboard's "Run Project"
// button actually launch (and stop) the Project Eric dev stack — Vite +
// code-server, plus the Yjs collab relay if the user wants it.
//
// The browser cannot spawn processes on its own, so the React app calls
// these JSON endpoints. The middleware shells out to the existing
// PowerShell launcher (`scripts/run-project.ps1`) on Windows or the
// equivalent npm scripts on macOS/Linux. Falls back to a structured
// 501 with a helpful error on platforms we don't support yet.
//
//   POST  /api/run-project          { mode: 'start' | 'stop', yjs: bool }
//   GET   /api/run-project-status   { vite, code, yjs, log }
//   GET   /api/run-project-logs     { lines: { vite, code, yjs } }
//   GET   /api/code-server/status   { running, workspace, installed }
//   POST  /api/code-server          { mode: 'start' | 'stop' }
//   GET   /api/code-server/logs     { path, lines }
//   POST  /api/clone-repo           { url, folder }  → git clone into the
//                                                    code-server workspace
//   GET   /api/code-workspace       { workspace, exists }
//
// The plugin only attaches in dev mode (when Vite is running the dev
// server). Production builds ignore it entirely.
//
// We deliberately keep this dependency-free — no express, no ws — so it
// plays nicely with Vite's existing http.Server.

import { spawn } from 'node:child_process';
import { existsSync, statSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { CloudflaredTunnel, detectCloudflared, CLOUDFLARED_INSTALL_HINT } from './cloudflared-tunnel.js';
import { readSessionState, writeSessionState, clearSessionState } from './collab-session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const repoRoot   = resolve(__dirname, '..');

const PORTS = {
  vite: 5173,
  code: 8080,
  yjs:  1234,
  relay: 1235,
};

const LOG_FILES = {
  vite:  join(repoRoot, 'logs', 'vite.log'),
  code:  join(repoRoot, 'logs', 'code-server.log'),
  yjs:   join(repoRoot, 'logs', 'yjs.log'),
  relay: join(repoRoot, 'logs', 'p2p-relay.log'),
};

const PS_SCRIPT = join(repoRoot, 'scripts', 'run-project.ps1');
const START_IDE = join(repoRoot, 'scripts', 'start-ide.ps1');

// Where code-server itself lives, and where it writes its log. Both are
// decided by scripts/setup-ide.ps1 — keep them in sync if you move the
// install. Overridable via env so a different machine layout still works.
const CODE_SERVER_HOME =
  process.env.PROJECT_ERIC_CODE_SERVER_HOME || 'C:\\tools\\code-server';
const CODE_SERVER_BIN_CMDS = [
  join(CODE_SERVER_HOME, 'bin', 'code-server.cmd'),
  join(CODE_SERVER_HOME, 'bin', 'code-server.exe'),
];
const CODE_SERVER_LOG = join(CODE_SERVER_HOME, 'logs', 'code-server.log');

// The folder code-server opens as its workspace. Must stay in sync with
// `$Workspace` in scripts/start-ide.ps1. Overridable via env so the same
// dashboard works on a machine that lays the IDE out differently.
const CODE_WORKSPACE = process.env.PROJECT_ERIC_CODE_WORKSPACE
  || 'C:\\Users\\Public\\project-eric-ide';

// Repos we allow the dashboard to pull down. The clone endpoint shells out
// to `git`, so the URL is user-controllable input — we pin it to plain
// https github.com URLs to keep that surface small.
const ALLOWED_REPO_HOSTS = new Set(['github.com', 'www.github.com']);

// Folder names we allow inside the workspace. Deliberately strict: no
// slashes, no `..`, no absolute paths, no shell metacharacters.
const SAFE_FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// ---- Per-account workbenches ------------------------------------------------
//
// Every Project Eric account gets its own code-server instance so the
// workbench, its files and its editor state belong to that account:
//
//   folder    <IDE root>\users\user-<id>
//   state     <IDE root>\users\user-<id>\.code-server-data
//   port      8090 + (id % 200)
//
// The extension folder stays shared so the bundled Project Eric
// extensions are present in every account's workbench.
//
// The folder name is the only thing the browser can influence, and it is
// restricted to `user-<digits>`: the path is always rebuilt from the
// workspace root, so a crafted name cannot escape it.
const USER_FOLDER = /^user-([0-9]{1,10})$/;

// Must stay in sync with Get-EricPort() in scripts/start-ide.ps1.
function portForUser(userId) {
  return 8090 + (Number(userId) % 200);
}

function resolveUserFolder(name) {
  if (typeof name !== 'string') {
    throw new Error('Invalid workspace name.');
  }
  const match = USER_FOLDER.exec(name.trim());
  if (!match) {
    throw new Error('Invalid workspace name.');
  }
  const userId = Number(match[1]);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('Invalid workspace name.');
  }
  const path = join(CODE_WORKSPACE, 'users', name.trim());
  // Belt and braces: the resolved path must still live under the root.
  if (!path.startsWith(resolve(CODE_WORKSPACE))) {
    throw new Error('Invalid workspace name.');
  }
  return { name: name.trim(), userId, path, port: portForUser(userId) };
}

// ---- Repo cloning ---------------------------------------------------------

// Validate the repo URL. Returns the parsed URL or throws with a
// human-readable reason the UI can show verbatim.
function assertCloneableRepo(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('That does not look like a valid repository URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https:// repository URLs can be cloned.');
  }
  if (!ALLOWED_REPO_HOSTS.has(parsed.hostname)) {
    throw new Error('Only github.com repositories can be cloned.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Repository URLs with embedded credentials are not allowed.');
  }
  // Require an owner/repo shape — `https://github.com/coder/code-server`.
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error('Use a full repository URL, e.g. https://github.com/owner/repo.');
  }
  return parsed;
}

// Resolve the absolute destination path for a folder inside the workspace
// and make sure it can't escape it.
function resolveWorkspaceTarget(folder) {
  if (typeof folder !== 'string' || !SAFE_FOLDER.test(folder)) {
    throw new Error('Invalid target folder name.');
  }
  const target = resolve(CODE_WORKSPACE, folder);
  // Belt and braces: the resolved path must still live under the workspace.
  if (target !== join(CODE_WORKSPACE, folder) || !target.startsWith(resolve(CODE_WORKSPACE))) {
    throw new Error('Invalid target folder name.');
  }
  return target;
}

// Run `git clone` and resolve with the outcome. The clone is shallow by
// default — the goal is to have the source browsable/editable inside
// code-server, not to pull the full history of a large upstream repo.
function runGitClone(url, target, { depth = 1, timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolvePromise) => {
    const args = ['clone', '--progress'];
    if (depth > 0) args.push('--depth', String(depth));
    args.push(url, target);

    const child = spawn('git', args, {
      cwd: CODE_WORKSPACE,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, error: err.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolvePromise({ ok: false, error: 'Clone timed out after 10 minutes.' });
        return;
      }
      const output = `${stdout}\n${stderr}`.trim();
      if (code === 0) {
        resolvePromise({ ok: true, output });
      } else {
        resolvePromise({
          ok: false,
          error: output.split(/\r?\n/).filter(Boolean).slice(-8).join('\n')
            || `git clone exited with code ${code}.`,
          code,
        });
      }
    });
  });
}

const isWindows = process.platform === 'win32';

// ---- Helpers ---------------------------------------------------------------

// Read the last `n` lines of a log file. Returns [] if the file doesn't
// exist yet (the launcher hasn't written anything).
function tail(file, n = 20) {
  try {
    if (!existsSync(file)) return [];
    const text = readFileSync(file, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(-n);
  } catch {
    return [];
  }
}

// Probe whether a port is accepting connections. Used to derive the
// "running" status without shelling out to PowerShell `Get-NetTCPConnection`
// (which would be slow + Windows-only).
function probePort(port, timeoutMs = 1500) {
  return new Promise((resolvePromise) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error',   () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

// Probe whether the code-server health endpoint answers. A port that is
// merely open is not enough — a process that was just killed can hold the
// socket for a moment, and we must not mistake that for a live workbench.
function probeHealth(port = PORTS.code, timeoutMs = 2000) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolvePromise(ok);
    };
    const req = http.get(
      { host: '127.0.0.1', port, path: '/healthz', timeout: timeoutMs },
      (res) => {
        res.resume();
        done(res.statusCode === 200);
      }
    );
    req.on('timeout', () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
  });
}

async function snapshot() {
  const [vite, code, yjs, relay] = await Promise.all([
    probePort(PORTS.vite),
    probePort(PORTS.code),
    probePort(PORTS.yjs),
    probePort(PORTS.relay),
  ]);
  return { vite, code, yjs, relay };
}

// Spawn the PowerShell launcher. We never await it — the script detaches
// its child processes and exits within a few seconds, so we treat the
// caller as "launching" once the parent has been spawned.
//
// Important: the project root often contains a space (e.g.
// `D:\webpage design`). Node's child_process.spawn on Windows quotes
// arguments for the child process, but powershell.exe's `-File` parser
// sometimes still splits on the unquoted-backslash space, so we wrap
// the path in literal double quotes and turn off Node's automatic
// quoting. This is reliable across PowerShell 5.1 and PowerShell 7.
function launch(opts) {
  if (!existsSync(PS_SCRIPT)) {
    return { ok: false, error: `Launcher not found at ${PS_SCRIPT}` };
  }
  const { mode, yjs, relay } = opts;
  const psArgs = [];
  if (mode === 'stop')   psArgs.push('-Stop');
  if (mode === 'status') psArgs.push('-Status');
  if (yjs === false)     psArgs.push('-NoYjs');
  if (relay === false)   psArgs.push('-NoRelay');

  const result = runPowerShell(PS_SCRIPT, psArgs, mode);

  return {
    ...result,
    mode,
    yjs: yjs !== false,
    relay: relay !== false,
    startedAt: Date.now(),
  };
}

// Spawn any PowerShell script.
//
// We spawn powershell.exe directly and let Node quote the script path.
// Routing this through `cmd.exe /c "<command>"` looks tempting but breaks
// badly: cmd.exe strips the outer quotes of a /c string, so a trailing
// `-Stop` flag ended up *inside* the quoted path — powershell was asked
// to run a file called "…\start-ide.ps1 -Stop" and exited with an error
// that nobody ever saw. Node quotes argv entries correctly, so the path
// and the flags stay separate.
function runPowerShell(scriptPath, psArgs = [], label = 'script') {
  if (!existsSync(scriptPath)) {
    return { ok: false, error: `Launcher not found at ${scriptPath}` };
  }

  const psExe = join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );

  const child = spawn(
    psExe,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...psArgs],
    {
      cwd: repoRoot,
      windowsHide: true,
      detached: false,           // we want the parent to exit, not leak
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PROJECT_ERIC_CALLED_FROM: 'vite-dev' },
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  // Surface the script's tail to the dev-server console for debugging.
  // The parent PowerShell exits quickly; child processes (Vite / code-server)
  // keep running.
  child.on('exit', (code) => {
    const tail = (stdout + stderr).trim().split(/\r?\n/).slice(-6).join('\n');
    if (code === 0) {
      // eslint-disable-next-line no-console
      console.log(`[${label}] OK\n${tail}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[${label}] FAILED (exit ${code})\n${tail}`);
    }
  });

  return { ok: true, pid: child.pid };
}

// ---- Plugin ----------------------------------------------------------------

export default function runProjectPlugin() {
  // One Cloudflare quick tunnel per dev-server process. The dashboard
  // and the Lite Viewer both read its status from
  // `/api/collab/tunnel`.
  const tunnel = new CloudflaredTunnel();

  return {
    name: 'project-eric:run-project',
    // Only attach in dev. The plugin() signature restricts to dev + serving.
    apply: 'serve',
    configureServer(server) {
      // ---- Local-only guard for the control API ------------------------
      //
      // The Cloudflare tunnel exposes this whole dev server to the
      // internet. That is fine for the Lite Viewer page (it is meant to
      // be public), but the `/api/*` endpoints can start and stop
      // processes on this machine — they must never be reachable from
      // outside.
      //
      // cloudflared forwards the original `Host` header, so a tunneled
      // request arrives with a public hostname. We accept only requests
      // whose Host is a loopback name.
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const host = String(req.headers.host || '').toLowerCase();
        const isLocal =
          host === 'localhost' ||
          host.startsWith('localhost:') ||
          host === '127.0.0.1' ||
          host.startsWith('127.0.0.1:') ||
          host === '[::1]' ||
          host.startsWith('[::1]:') ||
          host === '0.0.0.0' ||
          host.startsWith('0.0.0.0:');
        if (isLocal) return next();
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'The Project Eric control API is only reachable from localhost.',
        }));
      });

      // ---- POST /api/run-project ---------------------------------------
      server.middlewares.use('/api/run-project', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        if (!isWindows) {
          res.statusCode = 501;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: 'Automatic launch is only wired up on Windows in this build. On macOS/Linux run `npm run run:project` in a terminal.',
          }));
          return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          let payload = {};
          try { payload = body ? JSON.parse(body) : {}; } catch { /* default */ }
          const mode = ['start', 'stop', 'status'].includes(payload.mode)
            ? payload.mode
            : 'start';
          const yjs  = payload.yjs !== false;
          const relay = payload.relay !== false;
          const result = launch({ mode, yjs, relay });
          if (!result.ok) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: result.error }));
            return;
          }
          res.statusCode = 202; // accepted; the launcher is now detached
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        });
        req.on('error', (e) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message }));
        });
      });

      // ---- GET /api/run-project-status ----------------------------------
      server.middlewares.use('/api/run-project-status', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        const snap = await snapshot();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
          ...snap,
          ports: PORTS,
          checkedAt: Date.now(),
        }));
      });

      // ---- GET /api/run-project-logs -----------------------------------
      server.middlewares.use('/api/run-project-logs', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
          vite:  tail(LOG_FILES.vite),
          code:  tail(LOG_FILES.code),
          yjs:   tail(LOG_FILES.yjs),
          relay: tail(LOG_FILES.relay),
        }));
      });

      // ---- GET /api/ide-info -------------------------------------------
      // Lightweight descriptor so the UI can decide whether to call the
      // launcher, show the npm command, or open vscode.dev instead.
      server.middlewares.use('/api/ide-info', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          platform: process.platform,
          canAutoLaunch: isWindows,
          launcher: PS_SCRIPT,
          startIde: START_IDE,
          ports: PORTS,
          logs: LOG_FILES,
          codeWorkspace: CODE_WORKSPACE,
        }));
      });

      // ---- GET /api/code-server/status -----------------------------------
      // Reports whether the workbench is up, where its workspace lives and
      // whether this dev server is able to start it. The dashboard uses
      // this to decide between "open the IDE" and "start the IDE first".
      server.middlewares.use('/api/code-server/status', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        const listening = await probePort(PORTS.code);
        const healthy = listening ? await probeHealth(PORTS.code) : false;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
          running: healthy,
          listening,
          managed: true,
          url: `http://127.0.0.1:${PORTS.code}`,
          workspace: CODE_WORKSPACE,
          installed: CODE_SERVER_BIN_CMDS.some((p) => existsSync(p)),
          checkedAt: Date.now(),
        }));
      });

      // ---- GET /api/code-server/logs -------------------------------------
      // Tail of the code-server log. start-ide.ps1 writes to
      // C:\tools\code-server\logs\code-server.log while run-project.ps1
      // writes to <repo>\logs\code-server.log — prefer the former.
      server.middlewares.use('/api/code-server/logs', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        const source = existsSync(CODE_SERVER_LOG) ? CODE_SERVER_LOG : LOG_FILES.code;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ path: source, lines: tail(source, 40) }));
      });

      // ---- POST /api/code-server/launch ---------------------------------
      //
      // Starts (or reuses) the workbench that belongs to one Project
      // Eric account.
      //
      //   { workspaceName: 'user-7' }
      //
      // The account's folder is created on disk, and code-server is
      // launched on the port that belongs to that account. The response
      // carries the URL and the folder, so the dashboard can open the
      // workbench straight on the account's own files.
      //
      // NOTE: this route has to be registered BEFORE the generic
      // `/api/code-server` handler below. Vite's middleware matches on
      // the path prefix, so `/api/code-server` would otherwise swallow
      // `/api/code-server/launch` and start the shared workbench
      // instead of this account's one.
      server.middlewares.use('/api/code-server/launch', async (req, res) => {
        const json = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };

        if (req.method !== 'POST') {
          json(405, { error: 'Method not allowed' });
          return;
        }

        if (!isWindows) {
          json(501, {
            error:
              'Automatic launch is only wired up on Windows in this build. On macOS/Linux run `npm run run:project` in a terminal.',
          });
          return;
        }

        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          let payload = {};
          try {
            payload = body ? JSON.parse(body.replace(/^\uFEFF/, '')) : {};
          } catch {
            json(400, { ok: false, error: 'Malformed request body.' });
            return;
          }

          let folder;
          try {
            folder = resolveUserFolder(payload.workspaceName);
          } catch (err) {
            json(400, { ok: false, error: err.message });
            return;
          }

          if (!CODE_SERVER_BIN_CMDS.some((p) => existsSync(p))) {
            json(400, {
              ok: false,
              error: 'code-server is not installed. Run `npm run ide:setup` once, then try again.',
            });
            return;
          }

          // Create the account's folder if it does not exist yet.
          try {
            if (!existsSync(folder.path)) {
              mkdirSync(folder.path, { recursive: true });
            }
          } catch (err) {
            json(500, {
              ok: false,
              error: `Could not create the workspace folder: ${err.message}`,
            });
            return;
          }

          const url = `http://127.0.0.1:${folder.port}`;

          // Already up? Reuse it — starting a second code-server on the
          // same port would just fail to bind.
          const healthy = await probeHealth(folder.port);
          if (healthy) {
            json(200, {
              ok: true,
              alreadyRunning: true,
              url,
              port: folder.port,
              folder: folder.name,
              path: folder.path,
              userId: folder.userId,
            });
            return;
          }

          const result = runPowerShell(
            START_IDE,
            ['-UserId', String(folder.userId), '-Port', String(folder.port)],
            'code-server-user'
          );

          if (!result.ok) {
            json(500, { ok: false, error: result.error });
            return;
          }

          json(202, {
            ok: true,
            starting: true,
            pid: result.pid,
            url,
            port: folder.port,
            folder: folder.name,
            path: folder.path,
            userId: folder.userId,
          });
        });
        req.on('error', (e) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: e.message }));
        });
      });

      // ---- GET /api/code-server/user-status -------------------------------
      //
      //   ?workspaceName=user-7
      //
      // Reports whether that account's workbench is answering.
      //
      // Registered before the generic `/api/code-server` handler for the
      // same reason as `/api/code-server/launch` above.
      server.middlewares.use('/api/code-server/user-status', async (req, res) => {
        const json = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };

        if (req.method !== 'GET') {
          json(405, { error: 'Method not allowed' });
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        let folder;
        try {
          folder = resolveUserFolder(url.searchParams.get('workspaceName'));
        } catch (err) {
          json(400, { ok: false, error: err.message });
          return;
        }

        const healthy = await probeHealth(folder.port);
        json(200, {
          ok: true,
          running: healthy,
          url: `http://127.0.0.1:${folder.port}`,
          port: folder.port,
          folder: folder.name,
          path: folder.path,
          exists: existsSync(folder.path),
          userId: folder.userId,
        });
      });

      // ---- POST /api/code-server ------------------------------------------
      // Start or stop code-server on its own (no Vite, no Yjs relay):
      //
      //   { mode: 'start' }   → runs scripts/start-ide.ps1
      //   { mode: 'stop' }    → runs scripts/start-ide.ps1 -Stop
      //
      // A GET on the same path is a convenience alias for the status
      // endpoint above.
      server.middlewares.use('/api/code-server', async (req, res) => {
        const listening = await probePort(PORTS.code);
        const healthy = listening ? await probeHealth(PORTS.code) : false;

        if (req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({
            running: healthy,
            listening,
            managed: true,
            url: `http://127.0.0.1:${PORTS.code}`,
            workspace: CODE_WORKSPACE,
            installed: CODE_SERVER_BIN_CMDS.some((p) => existsSync(p)),
          }));
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        if (!isWindows) {
          res.statusCode = 501;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: 'Automatic launch is only wired up on Windows in this build. On macOS/Linux run `npm run ide:start` in a terminal.',
          }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          let payload = {};
          try {
            // Strip a leading BOM — some Windows clients add one.
            payload = body ? JSON.parse(body.replace(/^\uFEFF/, '')) : {};
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Malformed request body.' }));
            return;
          }

          const mode = payload.mode === 'stop' ? 'stop' : 'start';

          // Only skip the launch when the workbench is genuinely serving.
          // A lingering socket from a process we just killed must not be
          // mistaken for a live workbench.
          if (mode === 'start' && healthy) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, alreadyRunning: true, mode }));
            return;
          }
          if (mode === 'stop' && !listening) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, alreadyRunning: false, mode }));
            return;
          }

          if (mode === 'start' && !CODE_SERVER_BIN_CMDS.some((p) => existsSync(p))) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: false,
              error: 'code-server is not installed. Run `npm run ide:setup` once, then try again.',
            }));
            return;
          }

          const args = mode === 'stop' ? ['-Stop'] : [];
          const result = runPowerShell(START_IDE, args, 'code-server');

          if (!result.ok) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: result.error }));
            return;
          }

          res.statusCode = 202; // accepted; the launcher detaches and exits
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, pid: result.pid, mode }));
        });
        req.on('error', (e) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: e.message }));
        });
      });

      // ---- POST /api/clone-repo ------------------------------------------
      // Clones a repository into the folder code-server opens as its
      // workspace, so the source shows up in the IDE's file tree.
      //
      //   { url: 'https://github.com/coder/code-server', folder: 'code-server' }
      //
      // If the folder already exists we don't re-clone (git would refuse
      // anyway) — we report `alreadyExists` so the UI can just open the
      // IDE.
      server.middlewares.use('/api/clone-repo', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          let payload = {};
          try {
            // Strip a leading BOM — some Windows clients add one.
            payload = body ? JSON.parse(body.replace(/^\uFEFF/, '')) : {};
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Malformed request body.' }));
            return;
          }

          let target;
          try {
            assertCloneableRepo(payload.url);
            target = resolveWorkspaceTarget(payload.folder);
          } catch (err) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message }));
            return;
          }

          // Make sure the workspace exists before git tries to clone into it.
          try {
            if (!existsSync(CODE_WORKSPACE)) {
              mkdirSync(CODE_WORKSPACE, { recursive: true });
            }
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: `Could not create workspace: ${err.message}` }));
            return;
          }

          if (existsSync(target)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: true,
              alreadyExists: true,
              path: target,
              workspace: CODE_WORKSPACE,
              folder: payload.folder,
            }));
            return;
          }

          const result = await runGitClone(payload.url, target, {
            depth: Number.isFinite(payload.depth) ? payload.depth : 1,
          });

          res.statusCode = result.ok ? 200 : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: result.ok,
            error: result.error,
            output: result.output,
            path: target,
            workspace: CODE_WORKSPACE,
            folder: payload.folder,
          }));
        });
        req.on('error', (e) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: e.message }));
        });
      });

      // ---- GET /api/code-workspace ---------------------------------------
      // Where code-server's file tree is rooted, plus what is already in
      // there. The UI uses this to show the destination path.
      server.middlewares.use('/api/code-workspace', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        let folders = [];
        try {
          if (existsSync(CODE_WORKSPACE)) {
            folders = readdirSync(CODE_WORKSPACE, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => d.name);
          }
        } catch { /* workspace may be unreadable — report empty */ }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
          workspace: CODE_WORKSPACE,
          exists: existsSync(CODE_WORKSPACE),
          folders,
        }));
      });

      // ---- Cloudflare tunnel endpoints -----------------------------------
      //
      //   GET    /api/collab/tunnel   → current tunnel status
      //   POST   /api/collab/tunnel   → open a quick tunnel (Cloudflare)
      //   DELETE /api/collab/tunnel   → close it
      //
      // The tunnel exposes the Vite dev server, which serves the Eric
      // Collab Lite Viewer page AND proxies the Yjs WebSocket relay
      // (see vite.config.js). That means a single public URL is enough
      // for a guest on another device to open the room.
      server.middlewares.use('/api/collab/tunnel', async (req, res) => {
        const json = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };

        if (req.method === 'GET') {
          json(200, tunnel.getStatus());
          return;
        }

        if (req.method === 'DELETE') {
          tunnel.close();
          json(200, { ok: true, ...tunnel.getStatus() });
          return;
        }

        if (req.method !== 'POST') {
          json(405, { error: 'Method not allowed' });
          return;
        }

        if (!detectCloudflared()) {
          json(503, {
            ok: false,
            error: 'cloudflared is not installed.',
            installHint: CLOUDFLARED_INSTALL_HINT,
          });
          return;
        }

        // The tunnel forwards to the Vite dev server. Use the port Vite
        // actually bound to (it may differ from 5173 if 5173 was busy).
        const port = server.config?.server?.port || PORTS.vite;
        try {
          const publicUrl = await tunnel.open(port);
          json(200, { ok: true, publicUrl, ...tunnel.getStatus() });
        } catch (err) {
          json(500, {
            ok: false,
            error: err?.message || String(err),
            ...tunnel.getStatus(),
          });
        }
      });

      // ---- Eric Collab session state --------------------------------------
      //
      //   GET  /api/collab/session → the live session (room code, …)
      //   POST /api/collab/session → ask the extension to start a session
      //                             { action: 'start' | 'stop' }
      //
      // The extension owns the actual editing session and publishes it
      // to a small JSON file (see scripts/collab-session.js). This
      // endpoint reads that file so the dashboard can show the room code
      // and build a share link, and writes a `startRequested` flag the
      // extension polls so "Start sharing" works with one click.
      server.middlewares.use('/api/collab/session', async (req, res) => {
        const json = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };

        if (req.method === 'GET') {
          const state = readSessionState();
          json(200, {
            active: Boolean(state.roomId),
            roomId: state.roomId || '',
            signalingServer: state.signalingServer || '',
            role: state.role || '',
            startedAt: state.startedAt || 0,
            startRequested: Boolean(state.startRequested),
          });
          return;
        }

        if (req.method !== 'POST') {
          json(405, { error: 'Method not allowed' });
          return;
        }

        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          let payload = {};
          try {
            payload = body ? JSON.parse(body.replace(/^\uFEFF/, '')) : {};
          } catch {
            json(400, { ok: false, error: 'Malformed request body.' });
            return;
          }

          const action = payload.action === 'stop' ? 'stop' : 'start';

          if (action === 'stop') {
            clearSessionState();
            json(200, { ok: true, action });
            return;
          }

          writeSessionState({ startRequested: true });
          json(200, { ok: true, action, note: 'The Eric Collab extension will start a session shortly.' });
        });
      });
    },
  };
}
