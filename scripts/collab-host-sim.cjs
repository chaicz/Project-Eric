// Simulates the Eric Collab extension's HOST side on the wire, so the
// Lite Viewer can be tested in a real browser against realistic data.
//
// It mirrors extension/src/collabClient.ts exactly:
//   • awareness.user = { userId, name, color }  + awareness.permission
//   • awareness.filePath = document.fileName     (a Windows path)
//   • Y.Text key   = 'doc:' + document.uri.toString()   (a URI)
//   • meta.hostUserId = local user id
//
// Usage: node scripts/collab-host-sim.cjs <ROOM> <FILE_PATH> [SERVER]
//   FILE_PATH is the Windows path reported through awareness.
//   The Y.Text content is the file's actual contents (read from disk if
//   it exists, otherwise the literal text passed via COLLAB_SIM_CONTENT).

const fs = require('fs');
const path = require('path');
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const ROOM = process.argv[2] || 'SIM-ROOM';
const FILE_PATH = process.argv[3] || 'C:\\Users\\Public\\project-eric-ide\\demo.js';
const SERVER = (process.argv[4] || 'ws://127.0.0.1:1234/ws').replace(/\/+$/, '');

// The extension builds the Y.Text key from document.uri.toString().
// For a Windows file VS Code produces a file:// URI whose drive-letter
// colon is percent-encoded, e.g.
//   file:///c%3A/Users/Public/project-eric-ide/hello.js
// Mirror that here so the simulator is byte-identical to the real host.
function uriToString(fsPath) {
  let p = fsPath.replace(/\\/g, '/');
  let drive = '';
  const driveMatch = /^([A-Za-z]):\//.exec(p);
  if (driveMatch) {
    drive = driveMatch[1].toLowerCase() + '%3A';
    // Keep the leading slash of the remainder — VS Code renders
    // C:\Users\x as file:///c%3A/Users/x.
    p = p.slice(2);
  } else {
    p = '/' + p;
  }
  const encoded = p
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return 'file:///' + drive + encoded;
}

const uri = uriToString(FILE_PATH);
const textKey = 'doc:' + uri;

let content = process.env.COLLAB_SIM_CONTENT;
if (content === undefined) {
  try {
    content = fs.readFileSync(FILE_PATH, 'utf8');
  } catch {
    content = `// shared from ${FILE_PATH}\nconst greeting = "hello from the host";\n`;
  }
}

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(SERVER, ROOM, ydoc, {
  connect: true,
  resyncInterval: 1000,
  maxBackoffTime: 4000,
  WebSocketPolyfill: WebSocket,
});

// Record our PID so the simulator can be stopped deterministically.
try {
  fs.writeFileSync(path.join(__dirname, 'host-sim.pid'), String(process.pid));
} catch { /* non-fatal */ }

const USER_ID = 'u-simhost';
const meta = ydoc.getMap('meta');
const permissions = ydoc.getMap('permissions');
const kicked = ydoc.getMap('kicked');
const yText = ydoc.getText(textKey);

provider.awareness.setLocalStateField('user', {
  userId: USER_ID,
  name: 'Sim Host',
  color: '#10b981',
  joinedAt: Date.now(),
});
provider.awareness.setLocalStateField('permission', 'master');
provider.awareness.setLocalStateField('filePath', FILE_PATH);
provider.awareness.setLocalStateField('fileUri', uri);
provider.awareness.setLocalStateField('cursor', {
  anchor: { line: 0, char: 0 },
  head: { line: 0, char: 0 },
});

provider.on('sync', (isSynced) => {
  if (!isSynced) return;
  ydoc.transact(() => {
    if (!meta.has('hostUserId')) meta.set('hostUserId', USER_ID);
  }, 'host-init');
  if (yText.length === 0) {
    ydoc.transact(() => {
      yText.insert(0, content);
    }, 'local-init');
  }
  console.log('host-sim synced. room=' + ROOM);
  console.log('  awareness.filePath = ' + FILE_PATH);
  console.log('  yText key         = ' + textKey);
  console.log('  yText length      = ' + yText.length);
  console.log('  meta.hostUserId   = ' + meta.get('hostUserId'));
});

// Keep the process alive so the room stays populated.
setInterval(() => {
  // Keep the awareness state fresh so the relay never drops it.
  provider.awareness.setLocalStateField('filePath', FILE_PATH);
  provider.awareness.setLocalStateField('fileUri', uri);
}, 5000);

process.on('SIGTERM', () => {
  provider.destroy();
  ydoc.destroy();
  process.exit(0);
});
