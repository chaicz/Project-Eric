// Verify the *public* guest path: a client connects to the Yjs relay
// through the Cloudflare tunnel's /collab-ws proxy — the exact URL a
// remote guest on a phone would use.
//
// Usage: node scripts/test-collab-tunnel.cjs <tunnelOrigin> [room]

const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const ORIGIN = (process.argv[2] || '').replace(/\/+$/, '');
const ROOM = process.argv[3] || 'NHPV-QMK8';
const WS = `${ORIGIN.replace(/^http/, 'ws')}/collab-ws`;
const TIMEOUT_MS = 25000;

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
  const provider = new WebsocketProvider(WS, ROOM, ydoc, {
    connect: true,
    resyncInterval: 1000,
    maxBackoffTime: 8000,
    WebSocketPolyfill: WebSocket,
  });
  provider.awareness.setLocalStateField('user', {
    userId, name: label, color: '#0a7d38', joinedAt: Date.now(),
  });
  return { label, userId, ydoc, provider, yText: ydoc.getText('doc:tunnel-test.js') };
}
function waitConnected(c) {
  if (c.provider.wsconnected) return Promise.resolve();
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${c.label} never connected`)), TIMEOUT_MS);
    c.provider.on('status', (e) => { if (e.status === 'connected') { clearTimeout(t); res(); } });
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
    await sleep(150);
  }
  return false;
}

async function run() {
  console.log('Public tunnel guest-path test');
  console.log(`  tunnel : ${ORIGIN}`);
  console.log(`  ws     : ${WS}`);
  console.log(`  room   : ${ROOM}\n`);

  const res = await fetch(`${ORIGIN}/viewer?room=${ROOM}&server=${encodeURIComponent(WS)}`);
  record('GET /viewer over the public tunnel', res.ok, `status=${res.status}`);

  const host = makeClient('tunnel-host', 'u-tunnel-host');
  const guest = makeClient('tunnel-guest', 'u-tunnel-guest');

  try {
    await withTimeout(Promise.all([waitConnected(host), waitConnected(guest)]), TIMEOUT_MS, 'connect');
    record('two clients connect over the public tunnel', true);
  } catch (e) {
    record('two clients connect over the public tunnel', false, e.message);
    host.provider.destroy(); guest.provider.destroy();
    return finish();
  }

  try {
    await withTimeout(Promise.all([waitSynced(host), waitSynced(guest)]), TIMEOUT_MS, 'sync');
    record('both clients sync over the public tunnel', true);
  } catch (e) {
    record('both clients sync over the public tunnel', false, e.message);
  }

  record('presence propagates over the public tunnel', await waitPeers(host, 1),
    `host peers=${JSON.stringify(peerIds(host))}`);

  host.yText.insert(0, '// written over the public tunnel\n');
  await sleep(1200);
  record("host's edit reaches the guest over the public tunnel",
    guest.yText.toString().includes('written over the public tunnel'),
    `guest sees ${JSON.stringify(guest.yText.toString().slice(0, 60))}`);

  guest.yText.insert(guest.yText.length, '// guest over tunnel\n');
  await sleep(1200);
  record("guest's edit reaches the host over the public tunnel",
    host.yText.toString().includes('guest over tunnel'),
    `host sees ${JSON.stringify(host.yText.toString().slice(0, 90))}`);

  host.provider.destroy();
  guest.provider.destroy();
  finish();
}

function finish() {
  console.log('\n' + '-'.repeat(28));
  const passed = results.filter((r) => r.ok).length;
  console.log(`Results: ${passed}/${results.length} checks passed.`);
  for (const r of results.filter((r) => !r.ok)) console.log(`  FAILED: ${r.name} — ${r.detail}`);
  process.exit(passed === results.length ? 0 : 1);
}

run().catch((e) => { console.error('crashed:', e); process.exit(2); });
