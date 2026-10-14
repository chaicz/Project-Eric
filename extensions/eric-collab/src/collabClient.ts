// collabClient.ts
// Wires a Y.Doc to a y-websocket provider, syncs Y.Text <-> VS Code TextDocument,
// publishes local cursor position via the awareness protocol, and stores
// per-user permissions so the host can promote/demote/kick guests.

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebrtcProvider } from 'y-webrtc';
import { Awareness } from 'y-protocols/awareness';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type {
  CollabPermission,
  CollabState,
  UserPresence,
} from './types';
import { presenceToUser } from './userPresence';

/**
 * Default WebRTC signaling servers used by y-webrtc for peer discovery.
 * Peers exchange SDP offers via this list, then upgrade to a peer-to-peer
 * RTCDataChannel that bypasses the public Yjs relay. This makes the
 * first content sync near-instant for two clients on the same network,
 * and dramatically faster for cross-NAT pairs because the actual
 * document bytes never traverse the relay queue.
 *
 * These are public, run by the yjs authors. They are STUN for
 * discovery only — the document payload never touches them.
 */
const WEBRTC_SIGNALING_SERVERS = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signaling-eu.herokuapp.com',
];

interface SharedBinding {
  uri: string;
  doc: vscode.TextDocument;
  yText: Y.Text;
  binding: vscode.Disposable[];
}

/**
 * A single step in the connection handshake. The sidebar renders this
 * list so users can see exactly which step is currently in progress —
 * "resolving room", "opening websocket", "syncing documents", etc.
 */
export interface ConnStep {
  id: string;             // stable id, used as React key
  label: string;          // human-readable
  status: 'pending' | 'active' | 'ok' | 'error';
  detail?: string;        // optional sub-detail (URL, error message)
}

export interface CollabClientEvents {
  stateChange: (state: CollabState) => void;
  presenceChange: (users: UserPresence[]) => void;
  textSynced: (uri: string) => void;
  error: (message: string) => void;
  /** Fired when the host changes (rare — only on first connect). */
  metaChange: () => void;
  /** Fired when a guest's permission is changed by the host. */
  permissionsChange: () => void;
  /** Fired when the local user is kicked by the host. */
  kicked: () => void;
}

export class CollabClient extends EventEmitter {
  public state: CollabState = 'idle';
  public ydoc: Y.Doc;
  public provider: WebsocketProvider | null = null;
  /** Peer-to-peer overlay. Optional — falls back to the WebSocket
   *  provider transparently when WebRTC is unavailable (no STUN, etc.). */
  public webrtcProvider: WebrtcProvider | null = null;
  /** Shared awareness used by BOTH providers so presence/permissions
   *  flow over whichever transport reaches a peer first. */
  public awareness: Awareness | null = null;
  public roomId: string = '';
  public signalingServer: string = '';
  public publicOrigin: string | null = null; // tunnel URL when host has one open
  /** Human-readable last-connection-event string, for sidebar diagnostics. */
  public lastConnDetail: string = '';
  /** Ordered list of steps the connection has gone through, with status.
   *  Pushed into the sidebar so the user can see exactly where a
   *  connection is stuck instead of staring at "Connecting…". */
  public connSteps: ConnStep[] = [];
  /** Timestamp (ms) when the current `connect()` call started. 0 when idle. */
  public connectStartedAt: number = 0;

  private localUser: {
    userId: string;
    name: string;
    color: string;
    permission: CollabPermission;
  };
  private bindings: Map<string, SharedBinding> = new Map();
  // Per-URI counter of pending remote applies. A non-zero count means
  // the next onDidChangeTextDocument for that URI is the echo of OUR
  // own applyEdit and should be ignored (don't loop it back into yText).
  private pendingApplies: Map<string, number> = new Map();

  // Synced CRDT maps. Created in connect().
  private metaMap: Y.Map<unknown> | null = null;        // { hostUserId }
  private permissionsMap: Y.Map<{ permission: CollabPermission }> | null = null;
  private kickedMap: Y.Map<boolean> | null = null;
  private isInitialSynced = false;

  constructor(localUser: { userId: string; name: string; color: string }) {
    super();
    // Default the local user to 'viewer'. The real permission is
    // resolved lazily — see `getLocalPermission()` — and refreshed
    // every time the host, hostUserId, or permissionsMap changes. The
    // host in particular is promoted to 'master' the moment they call
    // connect() (because they win the hostUserId write).
    this.localUser = { ...localUser, permission: 'viewer' };
    this.ydoc = new Y.Doc();
  }

  connect(
    roomId: string,
    signalingServer: string,
    publicOrigin?: string
  ): void {
    if (this.provider) {
      this.disconnect();
    }
    this.roomId = roomId;
    this.signalingServer = signalingServer;
    this.publicOrigin = publicOrigin ?? null;
    this.isInitialSynced = false;
    this.connectStartedAt = Date.now();

    // Initialise the connection-step list. The sidebar renders this
    // so the user knows *where* they're stuck instead of staring at a
    // bare "Connecting…" spinner.
    this.connSteps = [
      { id: 'room',      label: 'Resolve room',          status: 'ok', detail: roomId },
      { id: 'ws',        label: 'Open signaling socket', status: 'active', detail: signalingServer },
      { id: 'webrtc',    label: 'Open peer-to-peer channel', status: 'active', detail: 'optional · faster sync' },
      { id: 'auth',      label: 'Claim host identity',   status: 'pending' },
      { id: 'sync',      label: 'Exchange CRDT state',   status: 'pending' },
      { id: 'docs',      label: 'Bind open files',       status: 'pending' },
    ];
    this.setState('connecting');

    // Create ONE awareness object and share it between providers. This
    // is the key trick — without it, presence/permissions sent over
    // WebSocket wouldn't be visible to peers connected via WebRTC,
    // and vice versa. Sharing one Awareness means whichever transport
    // reaches a peer first propagates the same awareness payload.
    this.awareness = new Awareness(this.ydoc);
    this.awareness.setLocalStateField('user', {
      userId: this.localUser.userId,
      name: this.localUser.name,
      color: this.localUser.color,
    });
    this.awareness.setLocalStateField('joinedAt', Date.now());

    this.provider = new WebsocketProvider(signalingServer, roomId, this.ydoc, {
      connect: true,
      // Faster, more aggressive reconnection: when a peer drops, retry
      // every second instead of the y-websocket default of 4s — this
      // makes "waiting for the host to refresh" feel much shorter.
      resyncInterval: 1000,
      maxBackoffTime: 4000,
      awareness: this.awareness,
    });

    // WebRTC peer-to-peer overlay. Uses STUN-discoverable peers for
    // direct sync; falls back to WebSocket if STUN/ICE fails. We
    // never `await` this — it's fire-and-forget so a slow signaling
    // server doesn't block the connection.
    try {
      this.webrtcProvider = new WebrtcProvider(roomId, this.ydoc, {
        signaling: WEBRTC_SIGNALING_SERVERS,
        awareness: this.awareness,
        // y-webrtc prints noisy console errors when its signaling
        // servers are unreachable. Suppress those — the WebSocket
        // provider is the source of truth and continues to work.
        filterBcConns: true,
        maxConns: 20,
        peerOpts: {
          // SimplePeer config. We don't need audio/video, just data.
          // config.iceServers stays at the simple-peer default (Google
          // STUN) which is enough for ~80% of cross-NAT pairs.
        },
      });
      this.webrtcProvider.on('peers', (peers: any) => {
        if (peers && peers.length > 0) {
          this.markStep('webrtc', 'ok', `${peers.length} peer${peers.length === 1 ? '' : 's'}`);
        }
      });
    } catch (e: any) {
      // WebRTC isn't critical — the WebSocket provider still works.
      // Surface the reason in the diagnostics so the user understands
      // why peer-to-peer didn't engage.
      this.markStep('webrtc', 'error', e?.message || 'unavailable');
    }

    this.lastConnDetail = '';
    const setDetail = (msg: string) => {
      this.lastConnDetail = msg;
      this.emit('stateChange', this.state);
    };
    this.provider.on('status', (evt: { status: string }) => {
      setDetail(`WebSocket: ${evt.status}`);
      if (evt.status === 'connected') this.markStep('ws', 'ok');
    });
    const ws = (this.provider as unknown as { ws?: WebSocket }).ws;
    if (ws) {
      const wireWs = ws as WebSocket;
      wireWs.addEventListener('open', () => {
        setDetail('WebSocket: open');
        this.markStep('ws', 'ok');
      });
      wireWs.addEventListener('close', (e) => {
        setDetail(`WebSocket closed (code ${e.code}${e.reason ? ': ' + e.reason : ''})`);
        this.markStep('ws', 'pending');
      });
      wireWs.addEventListener('error', () => {
        setDetail('WebSocket error — signaling server unreachable? Check network or try a different signaling server.');
        this.markStep('ws', 'error', 'signaling unreachable');
      });
    } else {
      // y-websocket may create the WS asynchronously; poll for it.
      const wsPoll = setInterval(() => {
        const w = (this.provider as unknown as { ws?: WebSocket }).ws;
        if (!w) return;
        clearInterval(wsPoll);
        w.addEventListener('open', () => {
          setDetail('WebSocket: open');
          this.markStep('ws', 'ok');
        });
        w.addEventListener('close', (e) => {
          setDetail(`WebSocket closed (code ${e.code}${e.reason ? ': ' + e.reason : ''})`);
          this.markStep('ws', 'pending');
        });
        w.addEventListener('error', () => {
          setDetail('WebSocket error — signaling server unreachable? Try a different signaling server.');
          this.markStep('ws', 'error', 'signaling unreachable');
        });
      }, 200);
      // Stop polling after 10s if no WS ever shows up.
      setTimeout(() => clearInterval(wsPoll), 10000);
    }

    this.provider.on(
      'status',
      (evt: { status: 'connected' | 'connecting' | 'disconnected' }) => {
        if (evt.status === 'connected') {
          this.markStep('auth', 'active');
          this.setState('connected');
        } else if (evt.status === 'connecting') {
          this.setState('reconnecting');
        } else if (evt.status === 'disconnected') {
          this.setState('error');
        }
      }
    );

    // Awareness changes (join/leave/cursor) → emit presence snapshot.
    this.awareness.on('change', () => this.emitPresence());

    // CRDT maps for room-wide state.
    this.metaMap = this.ydoc.getMap('meta');
    this.permissionsMap = this.ydoc.getMap('permissions');
    this.kickedMap = this.ydoc.getMap('kicked');

    // First writer to set hostUserId wins (CRDT resolves the conflict
    // deterministically). The other peers will see the same value after
    // sync.
    this.ydoc.transact(() => {
      if (!this.metaMap!.has('hostUserId')) {
        this.metaMap!.set('hostUserId', this.localUser.userId);
      }
    }, 'host-init');
    this.markStep('auth', 'ok');

    this.metaMap.observe(() => {
      // hostUserId can only change in degenerate cases, but if it does
      // (or on initial sync) we want our own permission flag to track
      // it. Without this, a late-joining user that becomes host after
      // some other peer already set hostUserId would never be promoted.
      this.refreshLocalPermission();
      this.emit('metaChange');
    });
    this.permissionsMap.observe(() => {
      this.refreshLocalPermission();
      this.emit('permissionsChange');
    });
    this.kickedMap.observe(() => this.checkKicked());

    // Sync the local permission immediately — the host just became
    // host, and guests should see themselves as 'viewer' before the
    // first observer tick arrives.
    this.refreshLocalPermission();

    // Once the initial sync completes, push remote yText content into
    // any open documents that are still showing the local state. This
    // is the *primary fix* for "I have to reload the page to see the
    // host's edits" — without it, a guest who joins after the host
    // already has content in yText would see an empty editor.
    this.provider.on('sync', (isSynced: boolean) => {
      if (isSynced && !this.isInitialSynced) {
        this.isInitialSynced = true;
        this.markStep('sync', 'ok');
        // Re-bind every open document so it gets the synced content.
        for (const doc of vscode.workspace.textDocuments) {
          if (this.bindings.has(doc.uri.toString())) {
            this.pushYTextToDoc(this.bindings.get(doc.uri.toString())!);
          } else {
            this.bindDocument(doc);
          }
        }
        this.markStep('docs', 'ok');
      }
    });

    // Also handle the case where a remote change arrives *after* the
    // initial sync AND after the user opened a new file. Without this,
    // a guest who joins mid-edit and then opens a new tab would see
    // the empty local version, not the synced yText content.
    this.ydoc.on('afterTransaction', (tr: Y.Transaction) => {
      if (tr.local) return; // our own changes are already applied
      for (const binding of this.bindings.values()) {
        const remote = binding.yText.toString();
        const local = binding.doc.getText();
        if (remote !== local) {
          this.pushYTextToDoc(binding);
        }
      }
    });

    // Initial check in case the kicked map was already populated.
    this.checkKicked();

    // Tick the state once per second while we're in 'connecting' or
    // 'reconnecting' so the sidebar's elapsed counter updates live.
    // Stop ticking once we're connected (or idle).
    const tickInterval = setInterval(() => {
      if (this.state === 'connected' || this.state === 'idle') {
        clearInterval(tickInterval);
        return;
      }
      this.emit('stateChange', this.state);
    }, 1000);
  }

  /**
   * Update a step in the connection progress display. Used by both
   * providers' event handlers so the sidebar reflects what's actually
   * happening on the wire.
   */
  markStep(id: string, status: ConnStep['status'], detail?: string): void {
    let changed = false;
    for (const s of this.connSteps) {
      if (s.id === id) {
        if (s.status !== status || s.detail !== detail) {
          s.status = status;
          if (detail !== undefined) s.detail = detail;
          changed = true;
        }
        break;
      }
    }
    if (changed) {
      // Bump stateChange so the sidebar re-renders. The event payload
      // doesn't carry the steps (the sidebar reads them off the
      // client directly via `getState()`), but we still want a paint.
      this.emit('stateChange', this.state);
    }
  }

  /** Elapsed ms since `connect()` started, or 0 when idle. */
  getElapsedMs(): number {
    if (!this.connectStartedAt) return 0;
    return Date.now() - this.connectStartedAt;
  }

  disconnect(): void {
    for (const [, binding] of this.bindings) {
      binding.binding.forEach((d) => d.dispose());
    }
    this.bindings.clear();
    this.pendingApplies.clear();
    if (this.provider) {
      try {
        this.provider.disconnect();
        this.provider.destroy();
      } catch {
        // ignore
      }
      this.provider = null;
    }
    if (this.webrtcProvider) {
      try {
        this.webrtcProvider.disconnect();
        this.webrtcProvider.destroy();
      } catch {
        // ignore
      }
      this.webrtcProvider = null;
    }
    this.awareness = null;
    this.metaMap = null;
    this.permissionsMap = null;
    this.kickedMap = null;
    this.isInitialSynced = false;
    this.lastConnDetail = '';
    this.connSteps = [];
    this.connectStartedAt = 0;
    this.setState('idle');
  }

  /**
   * Force-reconnect the underlying WebSocket. y-websocket's built-in
   * retry can stall when the signaling server is unreachable for a
   * long time (it gives up after several backoff cycles). This gives
   * the user a one-click recovery.
   */
  reconnectNow(): void {
    if (!this.roomId) return;
    const server = this.signalingServer;
    this.lastConnDetail = 'Reconnecting…';
    this.emit('stateChange', this.state);
    try {
      if (this.provider) {
        try { this.provider.disconnect(); } catch { /* ignore */ }
        try { this.provider.destroy(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    this.connect(this.roomId, server, this.publicOrigin ?? undefined);
  }

  // ---------------------------------------------------------------
  // Document binding (the part that was causing the lag)
  // ---------------------------------------------------------------

  /**
   * Bind an open VS Code document to its corresponding Y.Text (creates
   * one if missing). The yText ↔ document bridge is the source of the
   * "I have to refresh to see changes" bug — see `applyYChangesToDoc`
   * for the corrected implementation.
   */
  bindDocument(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    if (this.bindings.has(key)) {
      // Re-binding (e.g. after the user re-opened a document). Make
      // sure the doc reflects the latest yText content.
      this.pushYTextToDoc(this.bindings.get(key)!);
      return;
    }

    const yText = this.ydoc.getText('doc:' + key);

    const fromDoc = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== key) return;
      if (!this.bindings.has(key)) return;
      // If this change is the echo of our own applyYChangesToDoc /
      // pushYTextToDoc, ignore it so it doesn't loop back into yText.
      if (this.consumePendingApply(key)) return;
      // Viewers are read-only: revert their local edit by replacing
      // the doc content with the authoritative yText content.
      if (this.getLocalPermission() === 'viewer') {
        this.revertDocToYText(this.bindings.get(key)!);
        return;
      }
      this.applyDocChangesToY(e.contentChanges, yText);
    });

    const fromY = (() => {
      const handler = (event: Y.YTextEvent, transaction: Y.Transaction) => {
        // transaction.local is true when the change originated from
        // this client — that case is already covered by the doc→Y
        // bridge. We only need to apply remote changes here.
        if (transaction.local) return;
        this.applyYChangesToDoc(event, doc);
      };
      yText.observe(handler);
      return new vscode.Disposable(() => yText.unobserve(handler));
    })();

    this.bindings.set(key, {
      uri: key,
      doc,
      yText,
      binding: [fromDoc, fromY],
    });

    // Sync up the doc with whatever the CRDT already has. This is
    // essential for late joiners: by the time bindDocument runs, the
    // initial sync may have populated yText with the host's content.
    if (yText.length > 0) {
      this.pushYTextToDoc(this.bindings.get(key)!);
    } else if (doc.getText().length > 0) {
      // yText is empty — push the local content so the host's peers
      // can see this file.
      this.ydoc.transact(() => {
        yText.insert(0, doc.getText());
      }, 'local-init');
    }

    this.emit('textSynced', key);
  }

  /** Drop a binding (when the user closes the document). */
  unbindDocument(uri: vscode.Uri): void {
    const key = uri.toString();
    const b = this.bindings.get(key);
    if (!b) return;
    b.binding.forEach((d) => d.dispose());
    this.bindings.delete(key);
  }

  /**
   * Force-rebind all open documents. Useful as a recovery action when
   * a remote change wasn't applied (e.g. after a long disconnect).
   */
  forceResync(): void {
    for (const [, binding] of this.bindings) {
      binding.binding.forEach((d) => d.dispose());
    }
    this.bindings.clear();
    for (const doc of vscode.workspace.textDocuments) {
      this.bindDocument(doc);
    }
  }

  /**
   * Push the active file to all peers as the authoritative initial
   * content (only meaningful when the local user is the first to
   * have content in this yText). For a guest, this is a no-op unless
   * the file is new to the room.
   */
  shareCurrentDocument(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const yText = this.ydoc.getText('doc:' + key);
    if (yText.length === 0 && doc.getText().length > 0) {
      this.ydoc.transact(() => {
        yText.insert(0, doc.getText());
      }, 'local-init');
    }
  }

  /** Publish cursor position so other collaborators see it. */
  setLocalCursor(doc: vscode.TextDocument, selection: vscode.Selection): void {
    if (!this.awareness) return;
    this.awareness.setLocalStateField('cursor', {
      anchor: { line: selection.anchor.line, char: selection.anchor.character },
      head: { line: selection.active.line, char: selection.active.character },
    });
    this.awareness.setLocalStateField('filePath', doc.fileName);
  }

  /** Update the local user's display name (broadcasts to all peers). */
  setLocalName(name: string): void {
    this.localUser.name = name;
    if (this.awareness) {
      const u = (this.awareness.getLocalState() as any).user || {};
      this.awareness.setLocalStateField('user', { ...u, name });
    }
  }

  // ---------------------------------------------------------------
  // Permissions & moderation
  // ---------------------------------------------------------------

  /** The userId of the room creator (host). */
  getHostUserId(): string {
    return (this.metaMap?.get('hostUserId') as string) || '';
  }

  /** True if the local user is the host of this room. */
  isHost(): boolean {
    return this.getHostUserId() === this.localUser.userId;
  }

  /** Permission for any user, by id. Falls back to 'viewer' for guests. */
  getUserPermission(userId: string): CollabPermission {
    if (userId === this.getHostUserId()) return 'master';
    const entry = this.permissionsMap?.get(userId) as
      | { permission: CollabPermission }
      | undefined;
    return entry?.permission || 'viewer';
  }

  /**
   * Permission for the local user. Always derived from the canonical
   * state (hostUserId + permissionsMap), so the host sees "master" the
   * instant they call connect(), and a guest promoted to editor sees
   * "editor" on the very next tick. We also keep the cached
   * `localUser.permission` in sync for awareness / UI consumers.
   */
  getLocalPermission(): CollabPermission {
    const canonical = this.getUserPermission(this.localUser.userId);
    if (this.localUser.permission !== canonical) {
      this.localUser.permission = canonical;
    }
    return canonical;
  }

  /**
   * Set a user's permission. Only the host (master) can do this;
   * anyone else gets a warning toast and the call is a no-op.
   */
  async setUserPermission(
    userId: string,
    permission: CollabPermission
  ): Promise<void> {
    if (!this.permissionsMap) return;
    if (!this.isHost()) {
      void vscode.window.showWarningMessage(
        'Only the room master can change permissions.'
      );
      return;
    }
    if (userId === this.getHostUserId()) {
      void vscode.window.showWarningMessage(
        "The master's permission can't be changed."
      );
      return;
    }
    this.permissionsMap.set(userId, { permission });
  }

  /** Remove a user from the room. Master-only. */
  async kickUser(userId: string): Promise<void> {
    if (!this.kickedMap) return;
    if (!this.isHost()) {
      void vscode.window.showWarningMessage('Only the room master can kick users.');
      return;
    }
    if (userId === this.localUser.userId) return;
    this.kickedMap.set(userId, true);
  }

  /** Snapshot of every user's permission. */
  getAllPermissions(): Map<string, CollabPermission> {
    const result = new Map<string, CollabPermission>();
    const hostId = this.getHostUserId();
    if (hostId) result.set(hostId, 'master');
    if (this.permissionsMap) {
      for (const [userId, entry] of this.permissionsMap.entries()) {
        const perm = (entry as any)?.permission as CollabPermission | undefined;
        if (perm) result.set(userId, perm);
      }
    }
    return result;
  }

  private refreshLocalPermission(): void {
    this.localUser.permission = this.getUserPermission(this.localUser.userId);
    // Also reflect the change in awareness so peers can render the
    // permission badge without waiting for the Y.Map to sync.
    if (this.awareness) {
      this.awareness.setLocalStateField(
        'permission',
        this.localUser.permission
      );
    }
  }

  private checkKicked(): void {
    if (!this.kickedMap) return;
    if (this.kickedMap.get(this.localUser.userId)) {
      this.emit('kicked');
      this.disconnect();
      void vscode.window.showWarningMessage(
        'Eric Collab: you were removed from the room by the host.'
      );
    }
  }

  // ---------------------------------------------------------------
  // Internal: yText ↔ TextDocument bridge
  // ---------------------------------------------------------------

  /**
   * Apply a remote yText delta to the VS Code document.
   *
   * This is the function the original implementation got wrong in two
   * ways that caused the "must refresh to see changes" behaviour:
   *
   *   1. It returned early if the doc was not in a *visible editor*,
   *      so any change to a background tab was silently dropped.
   *   2. It iterated the delta in reverse but accumulated the cursor
   *      forward, producing nonsense positions.
   *
   * The fix is to (1) apply the edit to the document model regardless
   * of editor visibility, and (2) convert the delta to absolute
   * positions and apply the resulting ops from end → start so earlier
   * positions remain valid.
   */
  private applyYChangesToDoc(
    event: Y.YTextEvent,
    doc: vscode.TextDocument
  ): void {
    type Op = { start: number; end: number; text: string | null };
    const ops: Op[] = [];
    let cursor = 0;
    for (const d of event.delta) {
      if (d.retain != null) {
        cursor += d.retain;
      } else if (d.delete != null) {
        ops.push({ start: cursor, end: cursor + d.delete, text: null });
        // Advance cursor past the deleted region in the OLD document.
        cursor += d.delete;
      } else if (d.insert != null) {
        const t = (d.insert as string) || '';
        ops.push({ start: cursor, end: cursor, text: t });
        // Cursor does not advance for inserts (old-doc coordinates).
      }
    }
    if (ops.length === 0) return;

    // Apply end → start so earlier positions remain valid as the doc
    // mutates.
    const edit = new vscode.WorkspaceEdit();
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.text !== null) {
        edit.insert(doc.uri, doc.positionAt(op.start), op.text);
      } else {
        edit.delete(
          doc.uri,
          new vscode.Range(
            doc.positionAt(op.start),
            doc.positionAt(op.end)
          )
        );
      }
    }

    // Mark this URI as having a pending apply so the resulting
    // onDidChangeTextDocument echo is ignored.
    this.incrementPendingApply(doc.uri.toString());
    void vscode.workspace.applyEdit(edit);
  }

  /**
   * Replace the document's content with the yText content (used during
   * initial sync and when reverting a viewer's local edit).
   */
  private pushYTextToDoc(binding: SharedBinding): void {
    const yContent = binding.yText.toString();
    const dContent = binding.doc.getText();
    if (yContent === dContent) return;

    const fullRange = new vscode.Range(
      binding.doc.positionAt(0),
      binding.doc.positionAt(Math.max(1, dContent.length))
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(binding.doc.uri, fullRange, yContent);
    this.incrementPendingApply(binding.uri);
    void vscode.workspace.applyEdit(edit);
  }

  /** Replace the document's content with the yText content (viewer revert). */
  private revertDocToYText(binding: SharedBinding): void {
    this.pushYTextToDoc(binding);
    void vscode.window.showWarningMessage(
      'Eric Collab: viewers are read-only — your edit was reverted.'
    );
  }

  private incrementPendingApply(uri: string): void {
    this.pendingApplies.set(uri, (this.pendingApplies.get(uri) || 0) + 1);
  }

  /**
   * Returns true if the caller should ignore this change event because
   * it was caused by a previous applyEdit from this client.
   */
  private consumePendingApply(uri: string): boolean {
    const count = this.pendingApplies.get(uri) || 0;
    if (count <= 0) return false;
    if (count === 1) this.pendingApplies.delete(uri);
    else this.pendingApplies.set(uri, count - 1);
    return true;
  }

  private applyDocChangesToY(
    changes: readonly vscode.TextDocumentContentChangeEvent[],
    yText: Y.Text
  ): void {
    this.ydoc.transact(() => {
      // Apply in reverse so positions don't shift.
      const sorted = [...changes].sort(
        (a, b) =>
          b.rangeOffset + b.rangeLength - (a.rangeOffset + a.rangeLength)
      );
      for (const change of sorted) {
        const retain = change.rangeOffset;
        if (retain > yText.length) continue;
        if (change.rangeLength > 0) {
          yText.delete(retain, change.rangeLength);
        }
        if (change.text.length > 0) {
          yText.insert(retain, change.text);
        }
      }
    });
  }

  private setState(state: CollabState): void {
    this.state = state;
    this.emit('stateChange', state);
  }

  private emitPresence(): void {
    if (!this.awareness) return;
    const states = this.awareness.getStates();
    const users: UserPresence[] = [];
    for (const [clientId, state] of states.entries()) {
      const u = presenceToUser(state);
      if (u) {
        // Fill in the permission from our Y.Map snapshot if the
        // awareness state didn't include it yet (it does once
        // refreshLocalPermission runs).
        if (!u.permission) {
          u.permission = this.getUserPermission(u.userId);
        }
        users.push(u);
      }
    }
    this.emit('presenceChange', users);
  }
}
