// start-vite.js — start Vite detached, write PID + log, exit immediately.
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = 'D:/webpage design';
const logDir = join(repoRoot, 'logs');
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

const logFile = join(logDir, 'vite.log');
const errFile = join(logDir, 'vite.err.log');
const pidFile = join(tmpdir(), 'project-eric-vite.pid');

const out = (await import('node:fs')).openSync(logFile, 'a');
const err = (await import('node:fs')).openSync(errFile, 'a');

const child = spawn(
  'cmd.exe',
  ['/c', 'npx vite --port 5173 --host 127.0.0.1 --strictPort'],
  {
    cwd: repoRoot,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, FORCE_COLOR: '0' },
  },
);

child.unref();
writeFileSync(pidFile, String(child.pid));
console.log(`vite launcher pid=${child.pid} log=${logFile}`);
