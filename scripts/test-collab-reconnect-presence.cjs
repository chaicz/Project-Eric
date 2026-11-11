// Verifies the "stale awareness clock" hypothesis for Eric Collab.
//
// Scenario
//   1. A client connects to a room with Y.Doc D and Awareness A1.
//      A1 publishes presence -> the relay records clientID C with clock 1.
//   2. The client disconnects. The relay drops the *state* but keeps
//      the *clock* for clientID C in its awareness meta.
//   3. The client reconnects. The extension creates a NEW Awareness
//      instance on the SAME Y.Doc (so the same clientID C), but the new
//      Awareness starts its clock at 0.
//   4. The relay receives the new presence with clock 0 < stored clock 1
//      and treats it as stale -> the presence is silently dropped.
//
// Result: the peer is connected (the relay counts the socket) but never
// appears in the room's presence list.
//
// Usage: node scripts/test-collab-reconnect-presence.cjs

const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const { Awareness } = require('y-protocols/awareness');
const WebSocket = require('ws');
const http = require('http');

const SERVER = 'ws://127.0.0.1:1234/ws';
const ROOM = 'reconnect-' + Date.now().toString(36);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function relayRoom() {
  const body = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:1234/rooms', (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => res(b));
    }).on('error', rej);
  });
  return JSON.parse(body).find((x) => x.name === ROOM);
}

async function connect(doc, awareness) {
  const provider = new WebsocketProvider(SERVER, ROOM, doc, {
    connect: true,
    resyncInterval: 1000,
    maxBackoffTime: 4000,
    awareness,
    WebSocketPolyfill: WebSocket,
  });
  await new Promise((res) => {
    const t = setTimeout(res, 12000);
    provider.on('sync', (s) => { if (s) { clearTimeout(t); res(); } });
  });
  await sleep(1200);
  return provider;
}

(async () => {
  console.log('Reconnect presence regression test');
  console.log(`  room: ${ROOM}\n`);

  // ---- Phase 1: connect with awareness A1 -------------------------------
  const doc = new Y.Doc();
  const a1 = new Awareness(doc);
  a1.setLocalStateField('user', { userId: 'u-reconnect', name: 'ReconnectUser', color: '#123456' });
  const p1 = await connect(doc, a1);

  let room = await relayRoom();
  record('presence published on first connect',
    (room.awareness || []).some((a) => a.userId === 'u-reconnect'),
    `relay awareness=${JSON.stringify(room.awareness)}`);

  const clientID = doc.clientID;
  const clockAfterFirst = a1.meta.get(clientID).clock;

  // ---- Phase 2: disconnect (relay keeps the clock, drops the state) ------
  p1.destroy();
  await sleep(1500);
  room = await relayRoom();
  record('presence removed after disconnect',
    !(room.awareness || []).some((a) => a.userId === 'u-reconnect'),
    `relay awareness=${JSON.stringify(room.awareness)}`);

  // ---- Phase 3: reconnect with a NEW Awareness on the SAME doc ----------
  // This is exactly what CollabClient.connect() does: it creates a fresh
  // `new Awareness(this.ydoc)` while keeping the same Y.Doc.
  const a2 = new Awareness(doc);
  a2.setLocalStateField('user', { userId: 'u-reconnect', name: 'ReconnectUser', color: '#123456' });
  const clockAfterSecond = a2.meta.get(clientID).clock;
  record('new Awareness restarts the clock',
    clockAfterSecond < clockAfterFirst,
    `clock before=${clockAfterFirst}, after reconnect=${clockAfterSecond}`);

  const p2 = await connect(doc, a2);

  // Poll for up to 60s: the awareness protocol renews the local clock
  // every 15s, which may or may not be enough to get past the stale
  // clock the relay already recorded for this clientID.
  let seen = false;
  const timeline = [];
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const r = await relayRoom();
    const ok = (r.awareness || []).some((a) => a.userId === 'u-reconnect');
    timeline.push(`t=${(i + 1) * 5}s aw=${(r.awareness || []).length}`);
    if (ok) { seen = true; break; }
  }
  record('presence published again after reconnect', seen,
    `relay clients=${room.clients} timeline=${timeline.join(' ')}`);

  // ---- Phase 4: control — a FRESH doc (new clientID) reconnects fine ----
  const doc2 = new Y.Doc();
  const a3 = new Awareness(doc2);
  a3.setLocalStateField('user', { userId: 'u-fresh-doc', name: 'FreshDocUser', color: '#654321' });
  const p3 = await connect(doc2, a3);
  await sleep(1500);
  room = await relayRoom();
  record('control: fresh Y.Doc publishes presence fine',
    (room.awareness || []).some((a) => a.userId === 'u-fresh-doc'),
    `relay awareness=${JSON.stringify(room.awareness)}`);

  p2.destroy(); p3.destroy();
  await sleep(500);

  console.log('\n' + '-'.repeat(28));
  const passed = results.filter((r) => r.ok).length;
  console.log(`Results: ${passed}/${results.length} checks passed.`);
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  FAILED: ${r.name} — ${r.detail}`);
  }
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
