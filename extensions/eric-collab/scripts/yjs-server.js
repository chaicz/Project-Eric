// scripts/yjs-server.js
//
// A tiny self-hosted Yjs WebSocket signaling server. The Eric Collab
// extension points its `ericCollab.signalingServer` setting at this
// server when the user prefers to keep their session data on their
// own machine (or on a VPS they control) instead of a public relay
// like wss://demos.yjs.dev/ws.
//
// Why this exists
// ---------------
//   • The public Yjs demo server is rate-limited and occasionally
//     slow. When two guests in the same room are connecting through
//     it, the Y.Doc handshake can take 5–10 seconds.
//   • Some networks (corporate, school, China GFW) block wss:// to
//     arbitrary demo domains but allow connections to a known
//     endpoint the user controls.
//   • "I have to refresh the page" is often a side-effect of the
//     public relay dropping the WebSocket — running your own server
//     makes the connection far more stable.
//
// What it does
// ------------
//   • Starts an HTTP+WebSocket server on the configured port (default
//     1234) at the /ws/<room> path, compatible with y-websocket's
//     client protocol (sync step 1 / step 2 / update messages).
//   • Persists the Y.Doc state to <DATA_DIR>/<room>.bin so a room
//     survives a server restart. (The public demo server keeps state
//     in memory only — a server bounce loses everyone's work.)
//   • Exposes /healthz and /rooms JSON endpoints for monitoring.
//
// Run:
//   node scripts/yjs-server.js
//   PORT=1234 DATA_DIR=./.yjs-data node scripts/yjs-server.js
//
// Then point the Eric Collab extension at it:
//   ericCollab.signalingServer = "ws://localhost:1234/ws"

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const Y = require('yjs');
const { WebSocketServer } = require('ws');
// y-protocols' sync + awareness encoders/decoders. These match what
// y-websocket's client sends on the wire so our hand-rolled handler
// is wire-compatible.
const awarenessProtocol = require('y-protocols/awareness');
const syncProtocol = require('y-protocols/sync');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', '.yjs-data'));
const PERSIST_DEBOUNCE_MS = 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

/** Per-room state held in memory and persisted to disk. */
const docs = new Map(); // name -> entry

function roomFile(name) {
  // Sanitize: only [A-Za-z0-9._-] allowed. Anything else becomes
  // an underscore so a malicious room id can't escape DATA_DIR.
  const safe = String(name).replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(DATA_DIR, safe + '.bin');
}

function loadDoc(name) {
  if (docs.has(name)) return docs.get(name);
  const file = roomFile(name);
  const ydoc = new Y.Doc();
  if (fs.existsSync(file)) {
    try {
      const state = fs.readFileSync(file);
      if (state.byteLength > 0) Y.applyUpdate(ydoc, new Uint8Array(state));
    } catch (e) {
      console.error(`[yjs] failed to load ${file}: ${e.message}`);
    }
  }
  const awareness = new awarenessProtocol.Awareness(ydoc);
  awareness.setLocalState(null); // server has no presence state
  const entry = {
    name,
    ydoc,
    awareness,
    conns: new Set(),
    connClients: new Map(), // ws -> Set<awareness clientID>
    dirty: false,
    flushTimer: null,
    lastSave: 0,
  };

  // Apply remote updates + awareness changes coming from any client
  // and broadcast them to the other clients.
  ydoc.on('update', (update, origin) => {
    if (origin !== entry) entry.dirty = true;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const msg = encoding.toUint8Array(encoder);
    for (const ws of entry.conns) {
      if (ws !== origin && ws.readyState === ws.OPEN) ws.send(msg);
    }
    if (entry.dirty && !entry.flushTimer) {
      entry.flushTimer = setTimeout(() => flushDoc(entry), PERSIST_DEBOUNCE_MS);
    }
  });
  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    const msg = encoding.toUint8Array(encoder);
    for (const ws of entry.conns) {
      if (ws !== origin && ws.readyState === ws.OPEN) ws.send(msg);
    }
  });

  // Track which awareness client IDs belong to which socket, so we can
  // drop a disconnected client's presence. Without this the room keeps
  // showing ghosts: a user who closes the tab stays in the peer list
  // until the awareness timeout (30s) elapses, and the extension's
  // sidebar shows them as still present.
  awareness.on('update', ({ added, updated }, origin) => {
    if (!origin || !entry.conns.has(origin)) return;
    let ids = entry.connClients.get(origin);
    if (!ids) {
      ids = new Set();
      entry.connClients.set(origin, ids);
    }
    for (const id of added.concat(updated)) ids.add(id);
  });

  docs.set(name, entry);
  return entry;
}

function flushDoc(entry) {
  if (!entry.dirty) return;
  entry.flushTimer = null;
  const state = Y.encodeStateAsUpdate(entry.ydoc);
  const file = roomFile(entry.name);
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, Buffer.from(state));
    fs.renameSync(tmp, file);
    entry.dirty = false;
    entry.lastSave = Date.now();
  } catch (e) {
    console.error(`[yjs] failed to save ${file}: ${e.message}`);
  }
}

function listRooms() {
  const out = [];
  for (const [name, e] of docs) {
    out.push({
      name,
      clients: e.conns.size,
      lastSave: e.lastSave || null,
      // The awareness states the server currently holds for this room.
      // A peer that is still connected but missing here has been dropped
      // from presence — this is how you tell "disconnected" apart from
      // "connected but never published".
      awareness: Array.from(e.awareness.getStates().entries()).map(
        ([clientId, state]) => ({
          clientId,
          userId: (state && state.user && state.user.userId) || null,
          name: (state && state.user && state.user.name) || null,
          permission: (state && state.permission) || null,
          filePath: (state && state.filePath) || null,
          fileUri: (state && state.fileUri) || null,
        })
      ),
      bytes: (() => {
        try { return fs.statSync(roomFile(name)).size; } catch { return 0; }
      })(),
    });
  }
  return out;
}

// Periodic flush of any rooms whose debounce window was still open.
setInterval(() => {
  for (const e of docs.values()) if (e.dirty) flushDoc(e);
}, 5000).unref();

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  if (parsed.pathname === '/healthz') {
    // `dataDir` is included so tests (and operators) can find where the
    // room state is actually persisted instead of guessing the default.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      rooms: docs.size,
      uptime: process.uptime(),
      dataDir: DATA_DIR,
    }));
    return;
  }
  if (parsed.pathname === '/rooms') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': process.env.CORS_ORIGIN || '*',
    });
    res.end(JSON.stringify(listRooms(), null, 2));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  // URL shape: /ws/<roomName>
  const m = /^\/ws\/([A-Za-z0-9._-]+)$/.exec(req.url || '');
  if (!m) {
    ws.close(1008, 'invalid room path; expected /ws/<room>');
    return;
  }
  const room = m[1];
  const entry = loadDoc(room);
  ws.binaryType = 'arraybuffer';
  entry.conns.add(ws);

  // Send initial sync step 1.
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, entry.ydoc);
  ws.send(encoding.toUint8Array(syncEncoder));

  // Send current awareness state so the new client sees who's in the room.
  const awStates = entry.awareness.getStates();
  if (awStates.size > 0) {
    const awEncoder = encoding.createEncoder();
    encoding.writeVarUint(awEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        entry.awareness,
        Array.from(awStates.keys())
      )
    );
    ws.send(encoding.toUint8Array(awEncoder));
  }

  ws.on('message', (data) => {
    try {
      const buf = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);
      const decoder = decoding.createDecoder(buf);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);
      if (messageType === MESSAGE_SYNC) {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, entry.ydoc, ws);
        // If syncMessageType === syncProtocol.messageYjsSyncStep2 (or similar)
        // the encoder now contains a reply we need to send back.
        if (syncMessageType === syncProtocol.messageYjsSyncStep2 ||
            syncMessageType === syncProtocol.messageYjsUpdate) {
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
        } else if (encoding.length(encoder) > 1) {
          // The message was a step 1 (we have newer state); reply with step 2.
          ws.send(encoding.toUint8Array(encoder));
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        const payload = decoding.readVarUint8Array(decoder);
        if (process.env.YJS_TRACE_AWARENESS) {
          // Decode just enough of the awareness frame to log which
          // clientIDs are being published and with what clock.
          try {
            const d2 = decoding.createDecoder(payload);
            const n = decoding.readVarUint(d2);
            const ids = [];
            for (let i = 0; i < n; i++) {
              const cid = decoding.readVarUint(d2);
              const clk = decoding.readVarUint(d2);
              const st = JSON.parse(decoding.readVarString(d2));
              ids.push(`${cid}@clk${clk}${st === null ? '(null)' : `(${st.user && st.user.userId || 'anon'})`}`);
            }
            console.log(`[yjs][aw] ${room} <- ${ids.join(' ')}`);
          } catch (e) {
            console.log(`[yjs][aw] ${room} <- <undecodable>`);
          }
        }
        awarenessProtocol.applyAwarenessUpdate(entry.awareness, payload, ws);
      }
    } catch (e) {
      if (process.env.YJS_DEBUG) console.error(`[yjs] bad frame in ${room}: ${e.message}`);
    }
  });

  ws.on('close', () => {
    entry.conns.delete(ws);
    // Drop the awareness states this socket owned so the peer list in
    // every client updates immediately instead of after the 30s
    // awareness timeout.
    const owned = entry.connClients.get(ws);
    entry.connClients.delete(ws);
    if (owned && owned.size > 0) {
      // A client ID may already be claimed by another live socket (a
      // reconnect reuses the same Y.Doc client ID). Only remove states
      // that no other connection owns, otherwise we'd evict the peer
      // who just reconnected.
      const stillOwned = new Set();
      for (const [, ids] of entry.connClients) {
        for (const id of ids) stillOwned.add(id);
      }
      const removable = Array.from(owned).filter((id) => !stillOwned.has(id));
      if (removable.length > 0) {
        awarenessProtocol.removeAwarenessStates(
          entry.awareness,
          removable,
          ws
        );
      }
    }
  });
  ws.on('error', () => entry.conns.delete(ws));
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

server.listen(PORT, HOST, () => {
  console.log(`[yjs] signaling server listening on http://${HOST}:${PORT}`);
  console.log(`[yjs] WebSocket endpoint: ws://${HOST}:${PORT}/ws/<roomId>`);
  console.log(`[yjs] Health: http://${HOST}:${PORT}/healthz   Rooms: http://${HOST}:${PORT}/rooms`);
  console.log(`[yjs] Data dir: ${DATA_DIR}`);
});

function shutdown() {
  console.log('[yjs] flushing…');
  for (const e of docs.values()) flushDoc(e);
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
