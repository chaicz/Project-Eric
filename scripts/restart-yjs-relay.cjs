// Restarts the Yjs collab relay so it picks up the latest server code.
// Only touches port 1234 — Vite (5173) and code-server (8080) keep running.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 1234;
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, '.yjs-data');
const LOG_DIR = path.join(ROOT, 'logs');

function portPid(port) {
  try {
    const out = execSync(
      `netstat -ano -p TCP | findstr ":${port}"`,
      { encoding: 'utf8', shell: 'cmd.exe' }
    );
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = /LISTENING\s+(\d+)/.exec(line);
      if (m) pids.add(Number(m[1]));
    }
    return Array.from(pids);
  } catch {
    return [];
  }
}

const pids = portPid(PORT);
if (pids.length === 0) {
  console.log('relay: nothing listening on ' + PORT);
} else {
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8', shell: 'cmd.exe' });
      console.log('relay: stopped pid ' + pid);
    } catch (e) {
      console.log('relay: could not stop pid ' + pid);
    }
  }
}

// Wait for the port to free up.
for (let i = 0; i < 20; i++) {
  if (portPid(PORT).length === 0) break;
  execSync('ping -n 2 127.0.0.1 >nul', { shell: 'cmd.exe' });
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const server = path.join(ROOT, 'extensions', 'eric-collab', 'scripts', 'yjs-server.js');
const out = fs.openSync(path.join(LOG_DIR, 'yjs.log'), 'a');
const err = fs.openSync(path.join(LOG_DIR, 'yjs.log.err'), 'a');
const child = require('child_process').spawn(process.execPath, [server], {
  detached: true,
  stdio: ['ignore', out, err],
  env: { ...process.env, PORT: String(PORT), DATA_DIR },
  cwd: ROOT,
});
child.unref();

setTimeout(() => {
  const alive = portPid(PORT);
  console.log('relay: started pid ' + child.pid + ', listening=' + (alive.length > 0));
  process.exit(0);
}, 1500);
