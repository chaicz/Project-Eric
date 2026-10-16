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
//
// The plugin only attaches in dev mode (when Vite is running the dev
// server). Production builds ignore it entirely.
//
// We deliberately keep this dependency-free — no express, no ws — so it
// plays nicely with Vite's existing http.Server.

import { spawn } from 'node:child_process';
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const repoRoot   = resolve(__dirname, '..');

const PORTS = {
  vite: 5173,
  code: 8080,
  yjs:  1234,
};

const LOG_FILES = {
  vite: join(repoRoot, 'logs', 'vite.log'),
  code: join(repoRoot, 'logs', 'code-server.log'),
  yjs:  join(repoRoot, 'logs', 'yjs.log'),
};

const PS_SCRIPT = join(repoRoot, 'scripts', 'run-project.ps1');
const START_IDE = join(repoRoot, 'scripts', 'start-ide.ps1');

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

async function snapshot() {
  const [vite, code, yjs] = await Promise.all([
    probePort(PORTS.vite),
    probePort(PORTS.code),
    probePort(PORTS.yjs),
  ]);
  return { vite, code, yjs };
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
  const { mode, yjs } = opts;
  const psArgs = [];
  if (mode === 'stop')   psArgs.push('-Stop');
  if (mode === 'status') psArgs.push('-Status');
  if (yjs === false)     psArgs.push('-NoYjs');

  // Use cmd.exe to launch PowerShell with a properly-quoted -File path.
  // The double quotes around %~1 in cmd.exe preserve the spaces when
  // the path is passed to powershell.exe.
  const quotedScript = `"${PS_SCRIPT}"`;
  const argLine = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', quotedScript, ...psArgs]
    .map((a) => (a.includes(' ') && !a.startsWith('"') ? `"${a}"` : a))
    .join(' ');

  const child = spawn(
    'cmd.exe',
    ['/c', `powershell.exe ${argLine}`],
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
      console.log(`[run-project] ${mode} OK\n${tail}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[run-project] ${mode} FAILED (exit ${code})\n${tail}`);
    }
  });

  return {
    ok: true,
    pid: child.pid,
    mode,
    yjs: yjs !== false,
    startedAt: Date.now(),
  };
}

// ---- Plugin ----------------------------------------------------------------

export default function runProjectPlugin() {
  return {
    name: 'project-eric:run-project',
    // Only attach in dev. The plugin() signature restricts to dev + serving.
    apply: 'serve',
    configureServer(server) {
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
          const mode = payload.mode === 'stop' ? 'stop' : 'start';
          const yjs  = payload.yjs !== false;
          const result = launch({ mode, yjs });
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
          vite: tail(LOG_FILES.vite),
          code: tail(LOG_FILES.code),
          yjs:  tail(LOG_FILES.yjs),
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
        }));
      });
    },
  };
}
