// Acts as the room HOST against a running relay: performs the same
// writes the extension's host-side commands perform, so the guest side
// (Lite Viewer / extension) can be observed reacting to them.
//
// Usage:
//   node scripts/collab-host-actions.cjs <ROOM> <SERVER> <action> [arg]
//
// Actions:
//   promote <userId>   — set permissions[userId] = { permission: 'editor' }
//   demote  <userId>   — set permissions[userId] = { permission: 'viewer' }
//   kick    <userId>   — set kicked[userId] = true
//   unkick  <userId>   — delete kicked[userId]
//   edit    <text>     — write <text> into the shared doc

const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const ROOM = process.argv[2];
const SERVER = (process.argv[3] || 'ws://127.0.0.1:1234/ws').replace(/\/+$/, '');
const ACTION = process.argv[4];
const ARG = process.argv[5] || '';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(SERVER, ROOM, ydoc, {
  connect: true,
  resyncInterval: 500,
  maxBackoffTime: 2000,
  WebSocketPolyfill: WebSocket,
});

const HOST_ID = 'u-simhost';
const meta = ydoc.getMap('meta');
const permissions = ydoc.getMap('permissions');
const kicked = ydoc.getMap('kicked');

provider.on('sync', (isSynced) => {
  if (!isSynced) return;
  ydoc.transact(() => {
    if (!meta.has('hostUserId')) meta.set('hostUserId', HOST_ID);
  }, 'host-init');

  switch (ACTION) {
    case 'promote':
      permissions.set(ARG, { permission: 'editor' });
      break;
    case 'demote':
      permissions.set(ARG, { permission: 'viewer' });
      break;
    case 'kick':
      kicked.set(ARG, true);
      break;
    case 'unkick':
      kicked.delete(ARG);
      break;
    case 'edit': {
      // Write into every shared doc we can find, so the edit lands
      // wherever the guest is looking.
      const share = ydoc.share;
      const keys = share ? Array.from(share.keys()).filter((k) => k.startsWith('doc:')) : [];
      if (keys.length === 0) {
        console.log('host-actions: no shared doc found to edit');
      }
      for (const k of keys) {
        const t = ydoc.getText(k);
        ydoc.transact(() => {
          t.insert(t.length, ARG);
        }, 'host-edit');
      }
      break;
    }
    default:
      console.log('host-actions: unknown action ' + ACTION);
  }

  console.log('host-actions: applied ' + ACTION + ' ' + (ARG || ''));
  setTimeout(() => {
    provider.destroy();
    ydoc.destroy();
    process.exit(0);
  }, 800);
});
