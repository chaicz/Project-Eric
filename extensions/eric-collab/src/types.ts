// Shared types for Eric Collab

// A user's *role* in the room — fixed for the session: the host created
// the room, everyone else is a guest.
export type CollabRole = 'host' | 'guest';

// A user's *permission* — what they can do. The host always has the
// top-level permission ('master'), which lets them change every other
// guest's permission and remove them. Guests default to 'viewer' and
// can be promoted to 'editor' (and back) by the host. Viewers see live
// updates but their local edits are reverted so the document state
// stays consistent.
//
// Permission hierarchy: master > editor > viewer
//   master  — host only. Edits files, edits any user's role, kicks.
//   editor  — can edit files. Cannot manage other users.
//   viewer  — read-only. Local edits are reverted on remote sync.
export type CollabPermission = 'master' | 'editor' | 'viewer';

export type CollabState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface RoomInfo {
  roomId: string;
  role: CollabRole;
  signalingServer: string;
  inviteUrl: string;        // local code-server URL with ?ericCollabRoom=…
  publicInviteUrl?: string; // internet-reachable URL when tunnel is up
  publicOrigin?: string;    // just the public origin (e.g. https://xyz.loca.lt)
  liteViewerUrl?: string;   // tunnel-independent viewer URL (Yjs-direct)
  tunnelActive: boolean;
  startedAt: number;
  hostUserId: string;       // userId of the room creator
}

export interface UserPresence {
  userId: string;
  name: string;
  color: string;     // hex
  permission: CollabPermission;
  cursorLine?: number;
  cursorChar?: number;
  filePath?: string;
  fileUri?: string;
  joinedAt: number;
  synced: boolean;   // whether the user's local doc is in sync
}

export interface InviteLinkParts {
  signalingServer: string;
  roomId: string;
  origin: string;            // local origin (http://localhost:8080)
  publicOrigin?: string;     // tunnel origin if known (https://xyz.loca.lt)
  liteViewerUrl?: string;    // tunnel-independent viewer URL
}
