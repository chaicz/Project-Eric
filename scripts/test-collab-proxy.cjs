// Test the browser-facing collaboration path: a guest connects to the
// Yjs relay *through* the Vite dev server's /collab-ws proxy, exactly
// as the Lite Viewer does, and verifies the sync works end to end.
//
// Usage: node scripts/test-collab-proxy.cjs [serverBase]
//   serverBase defaults to http://127.0.0.1:5173 (the dev server).

const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const BASE = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/+$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const ROOM = 'proxy-' + Date.now().toString(36).slice(-6);
const TIMEOUT_MS = 15000;

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms: ${label}`)), ms)),
  ]);
}

function makeClient(label, userId) {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(`${WS_BASE}/collab-ws`, ROOM, ydoc, {
    connect: true,
    resyncInterval: 500,
    maxBackoffTime: 2000,
    WebSocketPolyfill: WebSocket,
  });
  provider.awareness.setLocalStateField('user', {
    userId, name: label, color: '#4285f4', joinedAt: Date.now(),
  });
  return {
    label, userId, ydoc, provider,
    yText: ydoc.getText('doc:proxy-test.js'),
    meta: ydoc.getMap('meta'),
    permissions: ydoc.getMap('permissions'),
    kicked: ydoc.getMap('kicked'),
  };
}

function waitConnected(c) {
  if (c.provider.wsconnected) return Promise.resolve();
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${c.label} never connected`)), TIMEOUT_MS);
    c.provider.on('status', (e) => {
      if (e.status === 'connected') { clearTimeout(t); res(); }
    });
  });
}
function waitSynced(c) {
  if (c.provider.synced) return Promise.resolve();
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${c.label} never synced`)), TIMEOUT_MS);
    c.provider.on('sync', (s) => { if (s) { clearTimeout(t); res(); } });
  });
}
function peerIds(c) {
  const ids = new Set();
  for (const [, st] of c.provider.awareness.getStates().entries()) {
    if (st?.user?.userId && st.user.userId !== c.userId) ids.add(st.user.userId);
  }
  return Array.from(ids);
}
async function waitPeers(c, n) {
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT_MS) {
    if (peerIds(c).length >= n) return true;
    await sleep(100);
  }
  return false;
}

async function run() {
  console.log('Collab proxy (guest path) test');
  console.log(`  dev server : ${BASE}`);
  console.log(`  ws endpoint: ${WS_BASE}/collab-ws/<room>`);
  console.log(`  room       : ${ROOM}\n`);

  // 1. The /viewer page must actually be served.
  const res = await fetch(`${BASE}/viewer?room=${ROOM}&server=${encodeURIComponent(WS_BASE + '/collab-ws')}`);
  record('GET /viewer serves the Lite Viewer page', res.ok,
    `status=${res.status} content-type=${res.headers.get('content-type')}`);

  // 2. The dev-server collab API must be reachable.
  let apiOk = false, apiDetail = '';
  try {
    const t = await fetch(`${BASE}/api/collab/tunnel`, { headers: { Accept: 'application/json' } });
    apiOk = t.ok;
    apiDetail = `status=${t.status}`;
  } catch (e) {
    apiDetail = e.message;
  }
  record('GET /api/collab/tunnel responds', apiOk, apiDetail);

  try {
    const s = await fetch(`${BASE}/api/collab/session`, { headers: { Accept: 'application/json' } });
    record('GET /api/collab/session responds', s.ok, `status=${s.status}`);
  } catch (e) {
    record('GET /api/collab/session responds', false, e.message);
  }

  // 3. Two clients connect *through the proxy* and sync.
  const host = makeClient('host', 'u-host-proxy');
  const guest = makeClient('guest', 'u-guest-proxy');
  try {
    await withTimeout(Promise.all([waitConnected(host), waitConnected(guest)]), TIMEOUT_MS, 'both connect');
    record('both clients connect through the /collab-ws proxy', true,
      `host=${host.provider.wsconnected}, guest=${guest.provider.wsconnected}`);
  } catch (e) {
    record('both clients connect through the /collab-ws proxy', false, e.message);
    host.provider.destroy(); guest.provider.destroy();
    return finish();
  }

  try {
    await withTimeout(Promise.all([waitSynced(host), waitSynced(guest)]), TIMEOUT_MS, 'both sync');
    record('both clients reach synced state through the proxy', true);
  } catch (e) {
    record('both clients reach synced state through the proxy', false, e.message);
  }

  const sawEachOther = await waitPeers(host, 1);
  record('presence propagates through the proxy', sawEachOther,
    `host peers=${JSON.stringify(peerIds(host))}`);

  host.yText.insert(0, '// written through the proxy\n');
  await sleep(600);
  record("host's edit reaches the guest through the proxy",
    guest.yText.toString().includes('written through the proxy'),
    `guest sees ${JSON.stringify(guest.yText.toString().slice(0, 50))}`);

  guest.yText.insert(guest.yText.length, '// guest reply\n');
  await sleep(600);
  record("guest's edit reaches the host through the proxy",
    host.yText.toString().includes('guest reply'),
    `host sees ${JSON.stringify(host.yText.toString().slice(0, 70))}`);

  host.meta.set('hostUserId', host.userId);
  await sleep(400);
  record('host role propagates through the proxy',
    guest.meta.get('hostUserId') === host.userId,
    `guest sees hostUserId=${guest.meta.get('hostUserId')}`);

  host.permissions.set(guest.userId, { permission: 'editor' });
  await sleep(400);
  record('permission map propagates through the proxy',
    guest.permissions.get(guest.userId)?.permission === 'editor',
    `guest permission=${guest.permissions.get(guest.userId)?.permission}`);

  host.kicked.set(guest.userId, true);
  await sleep(400);
  record('kick flag propagates through the proxy',
    guest.kicked.get(guest.userId) === true,
    `guest kicked=${guest.kicked.get(guest.userId)}`);

  record('both clients converge on identical text',
    host.yText.toString() === guest.yText.toString(),
    `host=${host.yText.length} guest=${guest.yText.length}`);

  host.provider.destroy();
  guest.provider.destroy();
  finish();
}

function finish() {
  console.log('\n' + '-'.repeat(28));
  const passed = results.filter((r) => r.ok).length;
  console.log(`Results: ${passed}/${results.length} checks passed.`);
  if (passed < results.length) {
    for (const r of results.filter((r) => !r.ok)) console.log(`  FAILED: ${r.name} — ${r.detail}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}

run().catch((e) => { console.error('crashed:', e); process.exit(2); });
