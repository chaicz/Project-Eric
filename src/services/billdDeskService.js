// billdDeskService.js
// ---------------------------------------------------------------------------
// Dashboard-side client for the BilldDesk remote-desktop backend.
//
// The backend is the vendored billd-desk stack (see `vendor/README.md`).
// Two flavours are supported:
//
//   1. `scripts/billd-desk-local/server.js` — the local, dependency-light
//      service that speaks the upstream billd-desk wire protocol. It runs
//      on 127.0.0.1:4300 and is started by `npm run run:project`.
//
//   2. `vendor/billd-desk-server` — the full upstream server (Koa2 +
//      MySQL + Redis + …). Point `VITE_BILLD_API` / `VITE_BILLD_SOCKET` at
//      it when it is running somewhere else.
//
// Both are reached through the Vite dev server, which proxies `/billd` to
// the service (HTTP *and* WebSocket). That matters for the guest link: the
// Cloudflare quick tunnel exposes the Vite server, so one public URL carries
// the page, the signaling channel and the device API.
//
// URL shapes
// ----------
//   REST   : /billd/api/desk_user/…          → http://127.0.0.1:4300/api/desk_user/…
//   Socket : /billd/socket.io                → http://127.0.0.1:4300/socket.io

import { io } from 'socket.io-client';

const BILLD_BASE = import.meta.env.VITE_BILLD_BASE || '/billd';
const BILLD_API_BASE = `${BILLD_BASE}/api`;

/** Local storage key for this browser's BilldDesk device credentials. */
const DEVICE_KEY = 'ericBilldDevice';

/**
 * The upstream `BilldDeskBehaviorEnum` (vendor/billd-desk/src/types/websocket.ts).
 * The numeric values are part of the wire protocol — the controlled side
 * switches on them, so they must not be renumbered.
 */
export const BILLD_BEHAVIOR = {
  mouseMove: 0,
  mouseDrag: 1,
  pressButtonLeft: 2,
  pressButtonRight: 3,
  releaseButtonLeft: 4,
  releaseButtonRight: 5,
  setPosition: 6,
  doubleClick: 7,
  leftClick: 8,
  rightClick: 9,
  scrollDown: 10,
  scrollUp: 11,
  scrollLeft: 12,
  scrollRight: 13,
  keyboardType: 14,
  keyboardPressKey: 15,
  keyboardReleaseKey: 16,
};

/** Upstream `WsMsgTypeEnum` names used by the desk flow. */
export const BILLD_MSG = {
  join: 'billdDeskJoin',
  joined: 'billdDeskJoined',
  updateUser: 'billdDeskUpdateUser',
  startRemote: 'billdDeskStartRemote',
  startRemoteResult: 'billdDeskStartRemoteResult',
  behavior: 'billdDeskBehavior',
  offer: 'nativeWebRtcOffer',
  answer: 'nativeWebRtcAnswer',
  candidate: 'nativeWebRtcCandidate',
  otherJoin: 'otherJoin',
  leaved: 'leaved',
  heartbeat: 'heartbeat',
};

/** STUN servers used for the peer connection (upstream uses the same list). */
export const BILLD_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/**
 * Read the BilldDesk credentials this browser uses.
 * @returns {{uuid: string, password: string}|null}
 */
export function getLocalDevice() {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.uuid || !parsed?.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the BilldDesk credentials for this browser. */
export function saveLocalDevice(device) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  } catch {
    /* private mode — the credentials simply do not persist */
  }
  return device;
}

/** Forget the stored credentials (used when the device code is rotated). */
export function clearLocalDevice() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BILLD_API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `BilldDesk request failed (${res.status}).`);
  }
  return data.data ?? {};
}

/** Is the BilldDesk backend reachable? */
export async function isBilldAvailable() {
  try {
    const data = await request('/health');
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

/**
 * Return this browser's device credentials, creating them on first use.
 * The device code is the "device id" a guest types in; the password is the
 * second factor, exactly like upstream billd-desk.
 */
export async function ensureLocalDevice({ force = false } = {}) {
  if (!force) {
    const existing = getLocalDevice();
    if (existing) return existing;
  }
  const created = await request('/desk_user/create', { method: 'POST', body: {} });
  return saveLocalDevice({ uuid: created.uuid, password: created.password });
}

/** Verify a device code + password pair (upstream `link_verify`). */
export async function verifyDevice(uuid, password) {
  try {
    const data = await request('/desk_user/link_verify', {
      method: 'POST',
      body: { uuid, password },
    });
    return Number(data?.code) === 1;
  } catch {
    return false;
  }
}

/** Is the device with this code currently online? */
export async function isDeviceOnline(uuid) {
  try {
    const data = await request(`/desk_user/find_receiver_by_uuid?uuid=${encodeURIComponent(uuid)}`);
    return Boolean(data?.receiver);
  } catch {
    return false;
  }
}

/**
 * Open a socket.io connection to the BilldDesk signaling service.
 * @param {object} [options]
 * @returns {import('socket.io-client').Socket}
 */
export function connectBilldSocket(options = {}) {
  return io(BILLD_BASE, {
    path: `${BILLD_BASE}/socket.io`,
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    ...options,
  });
}

/**
 * Wrap a payload in the upstream message envelope.
 * @param {import('socket.io-client').Socket} socket
 * @param {object} data
 * @param {string} [requestId]
 */
export function billdEnvelope(socket, data = {}, requestId = '') {
  return {
    request_id: requestId,
    socket_id: socket?.id || '',
    user_info: {},
    user_token: '',
    time: Date.now(),
    data,
  };
}

/** A short random id, mirroring upstream `getRandomString(8)`. */
export function billdRequestId() {
  let out = '';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * Build the guest link for a device.
 *
 * @param {object} opts
 * @param {string} opts.publicUrl  Tunnel origin, e.g. `https://x.trycloudflare.com`.
 * @param {string} opts.uuid       Device code the guest types in.
 * @param {string} [opts.password] Optional — when present it is embedded so
 *                                the guest does not have to type it.
 * @returns {string}
 */
export function buildGuestLink({ publicUrl, uuid, password }) {
  if (!publicUrl || !uuid) return '';
  const origin = publicUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ code: uuid });
  if (password) params.set('password', password);
  return `${origin}/remote?${params.toString()}`;
}

/**
 * Parse a guest link (or a bare device code) into its parts.
 * @returns {{uuid: string, password: string}|null}
 */
export function parseGuestLink(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const uuid = url.searchParams.get('code') || url.searchParams.get('uuid');
    if (!uuid) return null;
    return { uuid: uuid.toLowerCase(), password: url.searchParams.get('password') || '' };
  } catch {
    // A bare device code.
    if (/^[a-z0-9]{6,16}$/i.test(trimmed)) {
      return { uuid: trimmed.toLowerCase(), password: '' };
    }
    return null;
  }
}

/** Copy text to the clipboard with a fallback for non-secure origins. */
export async function copyToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    return copied;
  } catch {
    return false;
  }
}

export default {
  BILLD_BEHAVIOR,
  BILLD_MSG,
  BILLD_ICE_SERVERS,
  getLocalDevice,
  saveLocalDevice,
  clearLocalDevice,
  isBilldAvailable,
  ensureLocalDevice,
  verifyDevice,
  isDeviceOnline,
  connectBilldSocket,
  billdEnvelope,
  billdRequestId,
  buildGuestLink,
  parseGuestLink,
  copyToClipboard,
};
