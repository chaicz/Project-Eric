// Diagnostic: connect to a room as a passive observer and dump what the
// relay actually delivers — awareness states, Y.Text keys, and content.
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const ROOM = process.argv[2] || 'LITE-TEST-01';
const SERVER = (process.argv[3] || 'ws://127.0.0.1:1234/ws').replace(/\/+$/, '');
const WAIT = Number(process.argv[4] || 6000);

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(SERVER, ROOM, ydoc, {
  connect: true,
  resyncInterval: 1000,
  maxBackoffTime: 4000,
  WebSocketPolyfill: WebSocket,
});

provider.on('status', (e) => console.log('[status]', e.status));
provider.on('sync', (s) => {
  if (!s) return;
  console.log('[sync] synced');
  console.log('[awareness] states:', JSON.stringify(
    Array.from(provider.awareness.getStates().entries()).map(([cid, st]) => ({
      clientID: cid,
      user: st.user,
      permission: st.permission,
      filePath: st.filePath,
      fileUri: st.fileUri,
    })), null, 2
  ));
});

ydoc.on('update', (u, origin) => {
  console.log('[update] origin=', String(origin), 'bytes=', u.byteLength);
});

setTimeout(() => {
  console.log('\n--- final doc contents ---');
  const share = ydoc.share;
  const map = share && share instanceof Map ? share : null;
  if (map) {
    for (const [name, type] of map.entries()) {
      console.log('type:', name, '->', type.constructor.name,
        type instanceof Y.Text ? JSON.stringify(type.toString()) : '');
    }
  } else {
    console.log('(share map not enumerable)');
  }
  console.log('meta.hostUserId =', ydoc.getMap('meta').get('hostUserId'));
  provider.destroy();
  ydoc.destroy();
  process.exit(0);
}, WAIT);
