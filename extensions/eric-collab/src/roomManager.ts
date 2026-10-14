// roomManager.ts
// Generates room IDs, builds + parses invite URLs, tracks the current room.
//
// Invite URL shape:
//   <origin>/?ericCollabRoom=<ROOM>&ericCollabServer=<SIG>&ericCollabTunnel=<BOOL>
//
// When a tunnel is active, the host's `origin` is the public URL (e.g.
// https://eric-room-xyz.loca.lt) so guests clicking the link reach the
// host's code-server over the internet. The signaling server is unchanged
// — the public Yjs relay handles the actual CRDT traffic.

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { CollabRole, InviteLinkParts, RoomInfo } from './types';

const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const ROOM_ID_LENGTH = 8;

export function generateRoomId(): string {
  const bytes = randomBytes(ROOM_ID_LENGTH);
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_ALPHABET[bytes[i] % ROOM_ID_ALPHABET.length];
    if (i === 3) id += '-';
  }
  return id;
}

function getDefaultSignalingServer(): string {
  const cfg = vscode.workspace.getConfiguration('ericCollab');
  return cfg.get<string>('signalingServer') || 'wss://demos.yjs.dev/ws';
}

/**
 * Public URL where the Eric Collab Lite Viewer is hosted. When set,
 * the invite URL includes a "Lite Viewer" link that the guest can use
 * to read/edit the file even when the host's tunnel is unreachable.
 *
 * The viewer's URL is purely a public web page that connects to the
 * Yjs signaling server — no tunnel is required for it. The default
 * is empty (no Lite Viewer link), so existing invite flows are
 * unchanged unless the user explicitly configures a host.
 */
function getLiteViewerBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration('ericCollab');
  const v = cfg.get<string>('liteViewerUrl')?.trim() || '';
  return v.replace(/\/$/, '');
}

/** Build the local code-server origin (e.g. http://127.0.0.1:8080). */
function detectCodeServerOrigin(): string {
  const w: any = globalThis as any;
  if (w && w.location && typeof w.location.origin === 'string') {
    return w.location.origin;
  }
  // Best-effort: try the port from the URL we're embedded in.
  try {
    const u = new URL(w?.location?.href || 'http://127.0.0.1:8080/');
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'http://127.0.0.1:8080';
  }
}

export interface BuildInviteOptions {
  /** If a tunnel is open, pass its public URL here so guests get a working link. */
  publicOrigin?: string;
}

/** Compose an invite URL. */
export function buildInviteUrl(
  roomId: string,
  signalingServer?: string,
  opts: BuildInviteOptions = {}
): { url: string; origin: string; server: string; publicUrl: string; liteViewerUrl?: string } {
  const origin = detectCodeServerOrigin();
  const server = signalingServer || getDefaultSignalingServer();
  const publicOrigin = opts.publicOrigin || origin;

  // Build both the local URL (for the host) and the public URL (for guests).
  const buildOne = (o: string, viaTunnel: boolean) => {
    const params = new URLSearchParams({
      ericCollabRoom: roomId,
      ericCollabServer: server,
    });
    if (viaTunnel) params.set('ericCollabTunnel', '1');
    return `${o.replace(/\/$/, '')}/?${params.toString()}`;
  };

  // Lite Viewer URL — tunnel-independent. Only included if the user
  // has configured a public base URL for the viewer.
  const liteBase = getLiteViewerBaseUrl();
  let liteViewerUrl: string | undefined;
  if (liteBase) {
    const params = new URLSearchParams({
      room: roomId,
      server,
    });
    liteViewerUrl = `${liteBase}/viewer?${params.toString()}`;
  }

  return {
    url: buildOne(origin, false),
    origin,
    server,
    publicUrl: buildOne(publicOrigin, !!opts.publicOrigin && opts.publicOrigin !== origin),
    liteViewerUrl,
  };
}

/** Parse an invite URL or a bare room ID into structured parts. */
export function parseInviteLink(input: string): InviteLinkParts | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare room id (e.g. "KQ7P-3XRN")
  if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(trimmed)) {
    return {
      roomId: trimmed.toUpperCase(),
      signalingServer: getDefaultSignalingServer(),
      origin: detectCodeServerOrigin(),
    };
  }

  // URL form
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const roomId = url.searchParams.get('ericCollabRoom') || url.searchParams.get('room');
  if (!roomId) return null;
  const signalingServer =
    url.searchParams.get('ericCollabServer') ||
    url.searchParams.get('server') ||
    getDefaultSignalingServer();

  const parts: InviteLinkParts = {
    roomId: roomId.toUpperCase(),
    signalingServer,
    origin: `${url.protocol}//${url.host}`,
  };
  if (url.searchParams.get('ericCollabTunnel') === '1') {
    parts.publicOrigin = `${url.protocol}//${url.host}`;
  }
  return parts;
}

export function makeRoomInfo(
  role: CollabRole,
  roomId: string,
  publicOrigin?: string,
  hostUserId?: string
): RoomInfo {
  const { url, origin, server, publicUrl, liteViewerUrl } = buildInviteUrl(roomId, undefined, {
    publicOrigin,
  });
  return {
    roomId,
    role,
    signalingServer: server,
    inviteUrl: url,
    publicInviteUrl: publicOrigin ? publicUrl : undefined,
    publicOrigin,
    liteViewerUrl,
    tunnelActive: !!publicOrigin && publicOrigin !== origin,
    startedAt: Date.now(),
    hostUserId: hostUserId || '',
  };
}
