// collabService.js
// ---------------------------------------------------------------------------
// Client for the Eric Collab endpoints exposed by the Vite dev middleware
// (scripts/dev-server-plugin.js):
//
//   GET    /api/collab/tunnel   → Cloudflare quick-tunnel status
//   POST   /api/collab/tunnel   → open the tunnel
//   DELETE /api/collab/tunnel   → close it
//   GET    /api/collab/session  → the live Eric Collab session
//   POST   /api/collab/session  → { action: 'start' | 'stop' }
//
// These endpoints only exist while the dev server is running. In a
// production build every call fails, so the UI degrades to "collaboration
// is unavailable in this build" instead of throwing.
//
// URL shapes
// ----------
// The guest link is the important part. With the tunnel live, a friend on
// any device opens:
//
//   https://<tunnel>/viewer?room=<ROOM>&server=wss://<tunnel>/collab-ws
//
// The `server` value points at the *same* public origin, and Vite proxies
// `/collab-ws/<room>` to the local Yjs relay at
// `ws://127.0.0.1:1234/ws/<room>`. One public URL therefore carries both
// the page and the realtime channel — nothing else needs to be exposed.

const TUNNEL_ENDPOINT = '/api/collab/tunnel';
const SESSION_ENDPOINT = '/api/collab/session';

/** Default room code format: 4 + 4 characters from a no-ambiguity set. */
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

/**
 * Generate a room code in the same shape the VS Code extension uses
 * (e.g. `KQ7P-3XRN`).
 */
export function generateRoomCode() {
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    if (i === 3) id += '-';
  }
  return id;
}

/**
 * True when the dev middleware is reachable. Used to decide whether to
 * show the collaboration UI at all.
 */
export async function isCollabAvailable() {
  try {
    const res = await fetch(TUNNEL_ENDPOINT, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Read the current tunnel status. */
export async function getTunnelStatus() {
  const res = await fetch(TUNNEL_ENDPOINT, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Tunnel status failed (${res.status}).`);
  return res.json();
}

/**
 * Open the Cloudflare quick tunnel.
 * @returns {Promise<{ok: boolean, publicUrl?: string, error?: string, installHint?: string}>}
 */
export async function startTunnel() {
  let res;
  try {
    res = await fetch(TUNNEL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch {
    return {
      ok: false,
      error:
        'The collaboration service is not running. Start the project with `npm run run:project` and try again.',
    };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Could not start the tunnel (${res.status}).`,
      installHint: data.installHint,
    };
  }
  return { ok: true, ...data };
}

/** Close the tunnel. */
export async function stopTunnel() {
  try {
    const res = await fetch(TUNNEL_ENDPOINT, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Read the live Eric Collab session (room code, role, …). */
export async function getSession() {
  const res = await fetch(SESSION_ENDPOINT, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Session status failed (${res.status}).`);
  return res.json();
}

/** Ask the Eric Collab extension to start (or stop) a session. */
export async function requestSession(action = 'start') {
  try {
    const res = await fetch(SESSION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ...data };
  } catch {
    return {
      ok: false,
      error:
        'The collaboration service is not running. Start the project with `npm run run:project` and try again.',
    };
  }
}

/**
 * Decide which realtime endpoint a guest should use.
 *
 * The host's Yjs relay is usually the local one (`ws://127.0.0.1:1234/ws`).
 * A guest on another device cannot reach that, so we send them through
 * the tunnel instead: the Vite dev server proxies `/collab-ws/<room>`
 * to the same relay, which means the guest and the host still meet in
 * one room and only one public URL is needed.
 *
 * When the host is configured to use a *public* relay (for example
 * `wss://demos.yjs.dev/ws`) there is nothing to proxy — the guest can
 * dial that relay directly, and routing it through the tunnel would
 * point the guest at the wrong room.
 *
 * @param {object} opts
 * @param {string} opts.publicUrl       The Cloudflare tunnel origin.
 * @param {string} [opts.signalingServer] The host's relay, if known.
 * @returns {string} A WebSocket URL for the guest.
 */
export function pickGuestServer({ publicUrl, signalingServer }) {
  const origin = String(publicUrl || '').replace(/\/+$/, '');
  if (!origin) return '';

  const sig = String(signalingServer || '').trim();
  if (sig) {
    const isLocal = /127\.0\.0\.1|localhost|\[::1\]/i.test(sig);
    if (!isLocal) return sig;
  }

  return `${origin.replace(/^http/, 'ws')}/collab-ws`;
}

/**
 * Build the public guest link for a room.
 *
 * @param {object} opts
 * @param {string} opts.publicUrl  The Cloudflare tunnel origin, e.g.
 *                                 `https://abc-def.trycloudflare.com`.
 * @param {string} opts.room       Room code, e.g. `KQ7P-3XRN`.
 * @param {string} [opts.server]   Override the realtime endpoint.
 * @param {string} [opts.signalingServer] The host's relay — used to
 *                                 decide whether to route the guest
 *                                 through the tunnel.
 * @returns {string} An absolute URL a friend can open on any device.
 */
export function buildGuestLink({ publicUrl, room, server, signalingServer }) {
  if (!publicUrl || !room) return '';
  const origin = publicUrl.replace(/\/+$/, '');
  const signaling = server || pickGuestServer({ publicUrl: origin, signalingServer });
  const params = new URLSearchParams({ room, server: signaling });
  return `${origin}/viewer?${params.toString()}`;
}

/**
 * Build the "open it yourself" link — identical to the guest link, but
 * the host usually wants it in a new tab to verify the setup.
 */
export function buildHostPreviewLink({ publicUrl, room, server }) {
  return buildGuestLink({ publicUrl, room, server });
}

/**
 * Parse a share link or a bare room code into its parts.
 *
 * Accepts:
 *   • `https://host/viewer?room=ABC&server=wss://…`
 *   • `ABC-1234` (bare room code)
 *
 * @returns {{room: string, server: string}|null}
 */
export function parseShareLink(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;

  if (/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(trimmed)) {
    return { room: trimmed.toUpperCase(), server: '' };
  }

  try {
    const url = new URL(trimmed);
    const room = url.searchParams.get('room') || url.searchParams.get('ericCollabRoom');
    if (!room) return null;
    return {
      room: room.toUpperCase(),
      server: url.searchParams.get('server') || url.searchParams.get('ericCollabServer') || '',
    };
  } catch {
    return null;
  }
}

/**
 * Copy text to the clipboard, falling back to a hidden textarea when the
 * async Clipboard API is unavailable (older browsers, non-secure
 * origins). Returns true on success.
 */
export async function copyToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default {
  generateRoomCode,
  isCollabAvailable,
  getTunnelStatus,
  startTunnel,
  stopTunnel,
  getSession,
  requestSession,
  pickGuestServer,
  buildGuestLink,
  buildHostPreviewLink,
  parseShareLink,
  copyToClipboard,
};
