// Stops any running collab-host-sim process so a fresh one can be started
// with the current wire format.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PID_FILE = path.join(__dirname, 'host-sim.pid');

let pid = null;
try {
  pid = fs.readFileSync(PID_FILE, 'utf8').trim();
} catch { /* no pid file */ }

if (!pid || !/^\d+$/.test(pid)) {
  console.log('no host-sim pid file — nothing to stop');
  process.exit(0);
}

try {
  execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8', shell: 'cmd.exe' });
  console.log('killed host-sim pid ' + pid);
} catch (e) {
  console.log('host-sim pid ' + pid + ' was not running');
}
try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
