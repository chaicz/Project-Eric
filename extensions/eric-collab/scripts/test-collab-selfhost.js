// test-collab-selfhost.js
// Multi-user e2e against the self-hosted Yjs server (npm run yjs:start).
// Verifies that the bundled server is wire-compatible with the
// y-websocket client the extension uses, including:
//   1. Three real Y.Docs connect to ws://127.0.0.1:1234/ws/<room>
//   2. CRDT text sync works through the local server
//   3. Permission + kick maps propagate (so the host's editor /
//      viewer / kick UI still works against a self-hosted server)
//   4. State is persisted to <DATA_DIR>/<room>.bin
//
// Run:
//   node scripts/yjs-server.js   (in another shell)
//   cd "D:\webpage design\extensions\eric-collab"
//   ERIC_COLLAB_TEST_SIGNALING=ws://127.0.0.1:1234/ws node scripts/test-collab-selfhost.js
//
// Defaults to ws://127.0.0.1:1234/ws if the env var is not set.

const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SIGNALING = process.env.ERIC_COLLAB_TEST_SIGNALING || 'ws://127.0.0.1:1234/ws';
const ROOM_ID = 'selfhost-' + Date.now().toString(36).slice(-6);
const TIMEOUT_MS = 15000;

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const tag = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${tag}\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(
      () => rej(new Error(`timeout after ${ms}ms: ${label}`)), ms
    )),
  ]);
}

function makeClient(label, userId) {
  const ydoc = new Y.Doc();
  // The bundled y-websocket takes a "room" name and joins <server>/<room>.
  // Strip the trailing /ws from SIGNALING so the resulting URL is
  // ws://host:port/ws/<room> — same as the server's expected shape.
  const base = SIGNALING.replace(/\/ws\/?$/, '');
  const provider = new WebsocketProvider(base, 'ws/' + ROOM_ID, ydoc, {
    connect: true,
    resyncInterval: 500,
    maxBackoffTime: 2000,
    WebSocketPolyfill: WebSocket,
  });
  const yText = ydoc.getText('doc:test.js');
  const meta = ydoc.getMap('meta');
  const permissions = ydoc.getMap('permissions');
  const kicked = ydoc.getMap('kicked');
  provider.awareness.setLocalStateField('user', {
    userId, name: label, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
  });
  return { label, userId, ydoc, provider, yText, meta, permissions, kicked };
}

async function waitForConnected(c) {
  if (c.provider.wsconnected) return;
  await new Promise((res) => c.provider.once('status', (e) => e.status === 'connected' && res()));
}

async function waitForSynced(c) {
  if (c.provider.synced) return;
  await new Promise((res) => c.provider.once('sync', (s) => s && res()));
}

function peerIds(c) {
  const ids = new Set();
  for (const [, st] of c.provider.awareness.getStates().entries()) {
    if (st?.user?.userId && st.user.userId !== c.userId) ids.add(st.user.userId);
  }
  return Array.from(ids);
}

async function run() {
  console.log('Eric Collab self-hosted Yjs server test');
  console.log(`  signaling: ${SIGNALING}`);
  console.log(`  room     : ${ROOM_ID}`);
  console.log('');

  console.log('1. Health probe');
  try {
    const http = require('http');
    // Convert ws://host:port → http://host:port for the healthz probe.
    const httpBase = SIGNALING.replace(/\/ws\/?$/, '').replace(/^wss?:\/\//, 'http://');
    const healthz = await new Promise((res, rej) => {
      const req = http.get(httpBase + '/healthz', (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => res({ status: r.statusCode, body }));
      });
      req.on('error', rej);
      req.setTimeout(3000, () => req.destroy(new Error('healthz timeout')));
    });
    const parsed = JSON.parse(healthz.body);
    record('self-hosted server responds to /healthz', healthz.status === 200 && parsed.ok === true,
      `status=${healthz.status} body=${healthz.body}`);
  } catch (e) {
    record('self-hosted server responds to /healthz', false, e.message);
    return finish();
  }

  console.log('\n2. Three clients connect through the local server');
  const host = makeClient('Host', 'u-host');
  const g1 = makeClient('Editor', 'u-g1');
  const g2 = makeClient('Viewer', 'u-g2');
  try {
    await withTimeout(
      Promise.all([waitForConnected(host), waitForConnected(g1), waitForConnected(g2)]),
      TIMEOUT_MS, 'all three to reach the local server'
    );
    record('all three clients connect to the local server', true);
  } catch (e) {
    record('all three clients connect to the local server', false, e.message);
    return finish();
  }

  try {
    await withTimeout(
      Promise.all([waitForSynced(host), waitForSynced(g1), waitForSynced(g2)]),
      TIMEOUT_MS, 'all three to sync'
    );
    record('all three clients reach synced state', true);
  } catch (e) {
    record('all three clients reach synced state', false, e.message);
    return finish();
  }

  console.log('\n3. CRDT text sync through the local server');
  host.yText.insert(0, 'hello from host');
  await sleep(400);
  record("host's text reaches the editor guest",
    g1.yText.toString().includes('hello from host'),
    `g1 sees: ${JSON.stringify(g1.yText.toString().slice(0, 40))}`);
  record("host's text reaches the viewer guest",
    g2.yText.toString().includes('hello from host'),
    `g2 sees: ${JSON.stringify(g2.yText.toString().slice(0, 40))}`);

  console.log('\n4. Host sets hostUserId, sets master');
  host.meta.set('hostUserId', host.userId);
  await sleep(300);
  const hostIsMaster = [host, g1, g2].every((c) => c.meta.get('hostUserId') === host.userId);
  record('host is master on every peer', hostIsMaster,
    `hostUserId across peers = ${host.meta.get('hostUserId')}, ${g1.meta.get('hostUserId')}, ${g2.meta.get('hostUserId')}`);

  console.log('\n5. Promote editor, edit, propagate');
  host.permissions.set(g1.userId, { permission: 'editor' });
  await sleep(300);
  g1.yText.insert(g1.yText.length, '\n// editor line');
  await sleep(300);
  record("editor's edit reaches the host",
    host.yText.toString().includes('editor line'),
    `host yText=${JSON.stringify(host.yText.toString().slice(0, 60))}`);

  console.log('\n6. Kick the viewer, verify flag propagates');
  host.kicked.set(g2.userId, true);
  await sleep(300);
  record("kicked flag visible to the viewer",
    g2.kicked.get(g2.userId) === true,
    `g2.kicked[self]=${g2.kicked.get(g2.userId)}`);

  console.log('\n7. Persistence: state is on disk');
  // The server debounces writes by 1s, so wait for a flush.
  await sleep(1500);
  const dataDir = path.resolve(__dirname, '..', '.yjs-data');
  const file = path.join(dataDir, ROOM_ID + '.bin');
  record('room state persisted to disk', fs.existsSync(file),
    file + (fs.existsSync(file) ? ` (${fs.statSync(file).size} bytes)` : ' — file missing'));

  // ---- Cleanup -----------------------------------------------------------
  host.provider.destroy();
  g1.provider.destroy();
  g2.provider.destroy();

  finish();
}

function finish() {
  console.log('\n' + '—'.repeat(28));
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`Results: ${passed}/${total} checks passed.`);
  if (passed < total) {
    console.log('\nFailures:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }
  }
  process.exit(passed === total ? 0 : 1);
}

run().catch((err) => {
  console.error('test crashed:', err);
  process.exit(2);
});
