// Reads the shared Y.Text for a room and prints its content plus the
// canonical permission map. Used to verify that an edit made by one
// peer actually landed in the shared CRDT that every other peer sees.
//
// Usage: node scripts/collab-read.cjs <ROOM> [SERVER] [KEY_FRAGMENT]

const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const ROOM = process.argv[2] || 'LITE-TEST-04';
const SERVER = (process.argv[3] || 'ws://127.0.0.1:1234/ws').replace(/\/+$/, '');
const FRAGMENT = process.argv[4] || '';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(SERVER, ROOM, ydoc, {
  connect: true,
  resyncInterval: 1000,
  maxBackoffTime: 4000,
  WebSocketPolyfill: WebSocket,
});

provider.on('sync', (s) => {
  if (!s) return;
  setTimeout(() => {
    const share = ydoc.share;
    const keys = share ? Array.from(share.keys()) : [];
    const out = { room: ROOM, texts: {} };
    for (const k of keys) {
      if (!k.startsWith('doc:')) continue;
      if (FRAGMENT && !k.includes(FRAGMENT)) continue;
      out.texts[k] = ydoc.getText(k).toString();
    }
    const perms = {};
    ydoc.getMap('permissions').forEach((v, k) => { perms[k] = v && v.permission; });
    out.hostUserId = ydoc.getMap('meta').get('hostUserId');
    out.permissions = perms;
    out.kicked = ydoc.getMap('kicked').toJSON();
    out.awareness = Array.from(provider.awareness.getStates().entries()).map(([cid, st]) => ({
      clientID: cid,
      userId: st.user && st.user.userId,
      name: st.user && st.user.name,
      permission: st.permission,
      filePath: st.filePath,
    }));
    console.log(JSON.stringify(out, null, 2));
    provider.destroy();
    ydoc.destroy();
    process.exit(0);
  }, 800);
});

setTimeout(() => {
  console.error('collab-read: timed out waiting for sync');
  process.exit(1);
}, 10000);
