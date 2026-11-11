// billd-desk-local/server.js
// ---------------------------------------------------------------------------
// A small, dependency-light backend that speaks the **same wire protocol**
// as the upstream billd-desk server (`vendor/billd-desk-server`) for the
// remote-desktop ("billd desk") flow.
//
// Why this exists
// ---------------
// The upstream server is the full product backend: Koa2 + Sequelize/MySQL +
// Redis + RabbitMQ + SRS + FFmpeg. It is vendored in this repository (see
// `vendor/README.md`) and can be used as-is when you have MySQL, Redis and
// the media stack available. On a development machine none of that is
// usually running, and the remote-desktop flow only needs a small slice of
// it:
//
//   • a device registry (uuid + password)          → upstream `desk_user` table
//   • a registry of "which socket is this device"  → upstream Redis key
//     `deskUserUuid` / `deskUserSocketId`
//   • a socket.io room that carries the WebRTC offer/answer/candidates
//
// So this service implements exactly that slice, with the same message
// names, the same payload shapes and the same envelope format as upstream.
// The vendored Electron client and the vendored web controller talk to this
// service without modification, and the dashboard talks to it as well.
//
// Wire compatibility
// ------------------
// REST (upstream `src/controller/deskUser.controller.ts`):
//   POST   /api/desk_user/create
//   POST   /api/desk_user/login
//   POST   /api/desk_user/link_verify
//   PUT    /api/desk_user/update_by_uuid
//   GET    /api/desk_user/find_receiver_by_uuid?uuid=…
//
// Every response uses the upstream envelope: `{ code, data, message }`.
//
// Socket.IO events (upstream `src/types/websocket.ts` → `WsMsgTypeEnum`):
//   billdDeskJoin            → billdDeskJoined
//   billdDeskUpdateUser      (keep-alive for the device registry)
//   billdDeskStartRemote     → billdDeskStartRemoteResult
//   nativeWebRtcOffer        (relayed to the peer)
//   nativeWebRtcAnswer       (relayed to the peer)
//   nativeWebRtcCandidate    (relayed to the peer)
//
// Every socket message uses the upstream envelope:
//   { request_id, socket_id, user_info, user_token, time, data }
//
// Run it with:  node scripts/billd-desk-local/server.js

import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const PORT = Number(process.env.BILLD_PORT || process.env.NODE_APP_RELEASE_PROJECT_PORT || 4300);
const HOST = process.env.BILLD_HOST || '127.0.0.1';
const DATA_DIR = process.env.BILLD_DATA_DIR || path.join(PROJECT_ROOT, '.billd-data');
const STORE_FILE = path.join(DATA_DIR, 'desk-users.json');

/** How long a device stays "online" without a keep-alive (upstream uses 10 s). */
const DEVICE_TTL_MS = Number(process.env.BILLD_DEVICE_TTL_MS || 15000);
/** How often the registry sweeper runs. */
const SWEEP_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Device registry (upstream `desk_user` table)
// ---------------------------------------------------------------------------

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Upstream uses `getRandomString(8)` for both the uuid and the password. */
function randomString(length = 8) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function loadStore() {
  try {
    if (!existsSync(STORE_FILE)) return { users: [] };
    const raw = readFileSync(STORE_FILE, 'utf8');
    if (!raw.trim()) return { users: [] };
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.users) ? parsed : { users: [] };
  } catch {
    return { users: [] };
  }
}

function saveStore(store) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STORE_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(tmp, STORE_FILE);
  } catch (err) {
    console.error('[billd-local] could not persist the device registry:', err.message);
  }
}

const store = loadStore();

/** Find a device by uuid (case-insensitive, like the upstream column). */
function findUser(uuid) {
  if (!uuid) return null;
  const needle = String(uuid).toLowerCase();
  return store.users.find((u) => String(u.uuid).toLowerCase() === needle) || null;
}

/** Verify uuid + password. Returns the device on success, `null` otherwise. */
function login(uuid, password) {
  const user = findUser(uuid);
  if (!user) return null;
  if (user.status !== undefined && user.status !== null && user.status !== 1) return null;
  if (String(user.password) !== String(password)) return null;
  return user;
}

function createUser() {
  let uuid = randomString(8);
  while (findUser(uuid)) uuid = randomString(8);
  const user = {
    id: store.users.length + 1,
    uuid,
    password: randomString(8),
    status: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.users.push(user);
  saveStore(store);
  return user;
}

function updateUser({ uuid, password, new_password: newPassword, status }) {
  const user = findUser(uuid);
  if (!user) return null;
  if (String(user.password) !== String(password)) return null;
  if (newPassword) user.password = String(newPassword);
  if (status !== undefined && status !== null) user.status = Number(status);
  user.updatedAt = Date.now();
  saveStore(store);
  return user;
}

// ---------------------------------------------------------------------------
// Online device registry (upstream Redis `deskUserUuid` / `deskUserSocketId`)
// ---------------------------------------------------------------------------

/** uuid → { socketId, password, lastSeen } */
const devicesByUuid = new Map();
/** socketId → uuid */
const uuidBySocket = new Map();

function touchDevice(uuid, socketId, password) {
  if (!uuid) return;
  devicesByUuid.set(uuid, { socketId, password, lastSeen: Date.now() });
  uuidBySocket.set(socketId, uuid);
}

function dropSocket(socketId) {
  const uuid = uuidBySocket.get(socketId);
  if (!uuid) return;
  uuidBySocket.delete(socketId);
  const entry = devicesByUuid.get(uuid);
  if (entry && entry.socketId === socketId) devicesByUuid.delete(uuid);
}

function sweepDevices() {
  const now = Date.now();
  for (const [uuid, entry] of devicesByUuid.entries()) {
    if (now - entry.lastSeen > DEVICE_TTL_MS) devicesByUuid.delete(uuid);
  }
}

function findReceiver(uuid) {
  const entry = devicesByUuid.get(uuid);
  if (!entry) return '';
  if (Date.now() - entry.lastSeen > DEVICE_TTL_MS) return '';
  return entry.socketId;
}

setInterval(sweepDevices, SWEEP_INTERVAL_MS).unref?.();

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/** Upstream envelope: `{ code, data, message }`. */
function ok(res, data = {}, message = '操作成功') {
  sendJson(res, 200, { code: 200, data, message });
}

function fail(res, message, status = 400) {
  sendJson(res, status, { code: status, data: null, message });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw.replace(/^\uFEFF/, '')) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Serve the vendored billd-desk web controller build, when it exists.
 * That gives you the upstream UI (device list, screen wall, settings)
 * next to Project Eric without running a second web server.
 */
function serveStatic(req, res, pathname) {
  const distDir = path.join(PROJECT_ROOT, 'vendor', 'billd-desk', 'dist');
  if (!existsSync(distDir)) return false;

  let rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(distDir, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(distDir)) return false;
  if (!existsSync(filePath) || filePath.endsWith(path.sep)) {
    filePath = path.join(distDir, 'index.html');
    if (!existsSync(filePath)) return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(readFileSync(filePath));
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  // ---- REST --------------------------------------------------------------
  if (pathname === '/api/health') {
    ok(res, {
      ok: true,
      service: 'billd-desk-local',
      upstream: 'billd-desk-server',
      devices: store.users.length,
      online: devicesByUuid.size,
      port: PORT,
    });
    return;
  }

  if (pathname === '/api/desk_users' && req.method === 'GET') {
    ok(res, {
      users: store.users.map((u) => ({
        id: u.id,
        uuid: u.uuid,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        online: Boolean(findReceiver(u.uuid)),
      })),
    });
    return;
  }

  if (pathname === '/api/desk_user/create' && req.method === 'POST') {
    const user = createUser();
    ok(res, { id: user.id, uuid: user.uuid, password: user.password, status: user.status });
    return;
  }

  if (pathname === '/api/desk_user/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return fail(res, '请求体格式错误');
    const { uuid, password } = body;
    if (!uuid || !password) return fail(res, 'uuid和password不能为空');
    const user = login(uuid, password);
    if (!user) return fail(res, '密码错误！');
    ok(res, { msg: '登录成功', uuid: user.uuid });
    return;
  }

  if (pathname === '/api/desk_user/link_verify' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return fail(res, '请求体格式错误');
    const user = login(body.uuid, body.password);
    ok(res, { code: user ? 1 : 2 });
    return;
  }

  if (pathname === '/api/desk_user/update_by_uuid' && req.method === 'PUT') {
    const body = await readBody(req);
    if (!body) return fail(res, '请求体格式错误');
    if (!body.uuid) return fail(res, 'uuid不能为空！');
    const user = updateUser(body);
    if (!user) return fail(res, '不存在该uuid或旧密码错误！');
    ok(res, { uuid: user.uuid, status: user.status });
    return;
  }

  if (pathname === '/api/desk_user/find_receiver_by_uuid' && req.method === 'GET') {
    const uuid = url.searchParams.get('uuid') || '';
    ok(res, { receiver: findReceiver(uuid) });
    return;
  }

  // ---- Static (vendored billd-desk web build) ---------------------------
  if (req.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/socket.io/')) {
    if (serveStatic(req, res, pathname)) return;
  }

  fail(res, 'Not found', 404);
});

// ---------------------------------------------------------------------------
// Socket.IO signaling
// ---------------------------------------------------------------------------

const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // The web controller connects with `transports: ['websocket']` only.
  transports: ['websocket', 'polling'],
});

/** Build the upstream message envelope. */
function envelope(socket, data = {}, requestId = '') {
  return {
    request_id: requestId,
    socket_id: socket.id,
    user_info: {},
    user_token: '',
    time: Date.now(),
    data,
  };
}

/** Room name for a device — upstream uses the live room id, we use the uuid. */
function roomFor(uuid) {
  return `billd-desk:${uuid}`;
}

io.on('connection', (socket) => {
  console.log(`[billd-local] connected ${socket.id}`);

  // ---- Join a device room ------------------------------------------------
  socket.on('billdDeskJoin', (payload = {}) => {
    const data = payload?.data || {};
    const uuid = data.deskUserUuid || data.remoteDeskUserUuid || '';
    const password = data.deskUserPassword || data.remoteDeskUserPassword || '';
    const roomId = String(data.live_room_id || data.roomId || uuid);

    const user = login(uuid, password);
    if (!user) {
      socket.emit(
        'billdDeskStartRemoteResult',
        envelope(socket, { code: 3, msg: '设备码或密码错误', data: { roomId } }, payload?.request_id),
      );
      return;
    }

    socket.join(roomFor(user.uuid));
    // Only the device itself owns the registry entry. A guest joins the
    // same room with the device code, but it must not overwrite the
    // host's socket id — otherwise "is this device online?" would start
    // pointing at the guest.
    const role = data.role || 'host';
    if (role === 'host' || role === 'device') {
      touchDevice(user.uuid, socket.id, password);
    }
    socket.data.deskUserUuid = user.uuid;
    socket.data.billdRole = role;

    socket.emit('billdDeskJoined', envelope(socket, { live_room_id: roomId }, payload?.request_id));

    // Upstream tells the room that somebody else arrived (`otherJoin`).
    socket.to(roomFor(user.uuid)).emit(
      'otherJoin',
      envelope(socket, {
        live_room_id: roomId,
        join_socket_id: socket.id,
        join_user_info: {},
        socket_list: [...(io.of('/').adapter.rooms.get(roomFor(user.uuid)) || [])],
      }, payload?.request_id),
    );

    console.log(`[billd-local] ${socket.id} joined ${roomFor(user.uuid)} as ${socket.data.billdRole}`);
  });

  // ---- Keep the device registry alive ------------------------------------
  socket.on('billdDeskUpdateUser', (payload = {}) => {
    const data = payload?.data || {};
    const uuid = data.deskUserUuid || socket.data.deskUserUuid;
    if (uuid) touchDevice(uuid, socket.id, data.deskUserPassword || '');
  });

  socket.on('heartbeat', () => {
    const uuid = socket.data.deskUserUuid;
    if (uuid) touchDevice(uuid, socket.id, '');
  });

  // ---- Start a remote session -------------------------------------------
  socket.on('billdDeskStartRemote', async (payload = {}) => {
    const data = payload?.data || {};
    const roomId = String(data.roomId || data.live_room_id || '');
    const remoteUuid = data.remoteDeskUserUuid || '';
    const remotePassword = data.remoteDeskUserPassword || '';

    // The controlled device must exist and the password must be right.
    if (!remoteUuid || !remotePassword) {
      socket.emit(
        'billdDeskStartRemoteResult',
        envelope(socket, { code: 1, msg: 'deskUserUuid或password为空', data: { roomId } }, payload?.request_id),
      );
      return;
    }
    if (!login(remoteUuid, remotePassword)) {
      socket.emit(
        'billdDeskStartRemoteResult',
        envelope(socket, { code: 3, msg: '被控密码错误', data: { roomId } }, payload?.request_id),
      );
      return;
    }

    const receiver = findReceiver(remoteUuid);
    if (!receiver) {
      socket.emit(
        'billdDeskStartRemoteResult',
        envelope(socket, { code: 4, msg: 'remoteDeskUserUuid不在线', data: { roomId } }, payload?.request_id),
      );
      return;
    }

    const result = {
      code: 0,
      msg: 'ok',
      data: { ...data, receiver, live_room_id: roomId },
    };
    socket.emit('billdDeskStartRemoteResult', envelope(socket, result, payload?.request_id));
    if (roomId) {
      socket.to(roomFor(remoteUuid)).emit(
        'billdDeskStartRemoteResult',
        envelope(socket, result, payload?.request_id),
      );
    }
  });

  // ---- Relay the WebRTC handshake ---------------------------------------
  const relay = (event) => {
    socket.on(event, (payload = {}) => {
      const data = payload?.data || {};
      const receiver = data.receiver || '';
      const target = receiver ? io.sockets.sockets.get(receiver) : null;
      if (target) {
        target.emit(event, payload);
        return;
      }
      // Fall back to the room so a peer that joined without a known socket
      // id still receives the message.
      const uuid = data.remoteDeskUserUuid || socket.data.deskUserUuid;
      if (uuid) socket.to(roomFor(uuid)).emit(event, payload);
    });
  };

  relay('nativeWebRtcOffer');
  relay('nativeWebRtcAnswer');
  relay('nativeWebRtcCandidate');

  socket.on('disconnect', () => {
    dropSocket(socket.id);
    console.log(`[billd-local] disconnected ${socket.id}`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[billd-local] billd-desk-compatible signaling service on http://${HOST}:${PORT}`);
  console.log(`[billd-local] device registry: ${STORE_FILE}`);
});

const shutdown = () => {
  io.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref?.();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { server, io };
