// Acts as the *host* peer for the browser test: publishes a shared file
// (awareness.fileUri + a Y.Text), claims the host role, and can promote
// or kick a guest on demand.
//
// Usage:
//   node scripts/collab-ui-host.cjs <room> <action> [userId]
//     action = publish   -> claim host + publish fileUri/filePath + content
//     action = promote   -> give <userId> the editor permission
//     action = kick      -> kick <userId>
//     action = status    -> print the room state
//
// The script stays connected (unless action = status) so the host keeps
// broadcasting awareness.

const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const WS_BASE = (process.env.ERIC_COLLAB_TEST_SIGNALING || 'ws://127.0.0.1:5173/collab-ws').replace(/\/+$/, '');
const ROOM = process.argv[2] || 'UITEST-001';
const ACTION = process.argv[3] || 'publish';
const TARGET = process.argv[4] || '';
const HOST_USER_ID = 'ui-host-node';
const FILE_URI = 'file:///workspace/src/demo.js';
const FILE_PATH = 'src/demo.js';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(WS_BASE, ROOM, ydoc, {
  connect: true,
  resyncInterval: 1000,
  maxBackoffTime: 4000,
  WebSocketPolyfill: WebSocket,
});
const meta = ydoc.getMap('meta');
const perms = ydoc.getMap('permissions');
const kicked = ydoc.getMap('kicked');

provider.awareness.setLocalStateField('user', {
  userId: HOST_USER_ID,
  name: 'Node Host',
  color: '#e8710a',
  joinedAt: Date.now(),
});
provider.awareness.setLocalStateField('permission', 'master');
provider.awareness.setLocalStateField('fileUri', FILE_URI);
provider.awareness.setLocalStateField('filePath', FILE_PATH);

const yText = ydoc.getText('doc:' + FILE_URI);

provider.on('status', (e) => console.log('[status]', e.status));

function applyAction() {
  if (ACTION === 'publish') {
    meta.set('hostUserId', HOST_USER_ID);
    if (yText.length === 0) {
      yText.insert(0, '// shared from the node host\nexport function hello() {\n  return "hi";\n}\n');
    }
    console.log('[action] published', FILE_URI);
  } else if (ACTION === 'promote') {
    perms.set(TARGET, { permission: 'editor' });
    console.log('[action] promoted', TARGET, '-> editor');
  } else if (ACTION === 'edit') {
    yText.insert(yText.length, '// line added by the host\n');
    console.log('[action] appended a host line');
  } else if (ACTION === 'demote') {
    perms.set(TARGET, { permission: 'viewer' });
    console.log('[action] demoted', TARGET, '-> viewer');
  } else if (ACTION === 'kick') {
    kicked.set(TARGET, true);
    console.log('[action] kicked', TARGET);
  } else if (ACTION === 'status') {
    console.log('[status] hostUserId =', meta.get('hostUserId'));
    console.log('[status] permissions =', JSON.stringify(Object.fromEntries(perms.entries())));
    console.log('[status] content =', JSON.stringify(yText.toString()));
    console.log('[status] awareness peers =', JSON.stringify(
      Array.from(provider.awareness.getStates().entries()).map(([cid, st]) => ({
        clientId: cid,
        user: st.user,
        permission: st.permission,
        filePath: st.filePath,
      })), null, 2));
  }
}

provider.on('sync', (s) => {
  if (!s) return;
  console.log('[sync] synced');
  applyAction();
  if (ACTION === 'status') {
    setTimeout(() => { provider.destroy(); ydoc.destroy(); process.exit(0); }, 800);
  }
});
