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
import {
  diffHunks,
  planLocalEdit,
} from './textSync';

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
  /**
   * The document content as of the last change event we processed.
   *
   * VS Code reports a change as a range relative to the document as it
   * was *before* the change. This field lets us recover that "before"
   * state exactly, which is what the diff-based bridge needs to tell a
   * user's keystroke apart from a change that arrived over the wire.
   */
  lastDocText: string;
  /**
   * Serialises document writes.
   *
   * Two overlapping `applyEdit` calls would each be computed against a
   * document state that the other one had already invalidated, which is
   * exactly how the document ends up with a duplicated tail. Chaining
   * the writes keeps the "compute the patch" and "apply the patch"
   * steps atomic with respect to each other.
   */
  writeQueue: Promise<void>;
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
            this.enqueueSyncDoc(this.bindings.get(doc.uri.toString())!);
          } else {
            this.bindDocument(doc);
          }
        }
        this.markStep('docs', 'ok');
        // Publish the file the host is actually looking at, so guests
        // land on the right document instead of an arbitrary bound one.
        this.publishActiveEditor();
      }
    });

    // Also handle the case where a remote change arrives *after* the
    // initial sync AND after the user opened a new file. Without this,
    // a guest who joins mid-edit and then opens a new tab would see
    // the empty local version, not the synced yText content.
    //
    // NOTE: this used to live on `ydoc.on('afterTransaction')`, which
    // fired for *every* transaction in the document — including ones
    // that had nothing to do with a shared text. It has moved into the
    // per-binding yText observer (see `bindDocument`), so a change to
    // one shared file no longer triggers a full-document comparison on
    // every other bound file.

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
   * "I have to refresh to see changes" bug — see `applyDocChangeToY`
   * and `syncDocNow` for the corrected implementation.
   */
  /**
   * Is this a document worth sharing with the room?
   *
   * VS Code opens a lot of *internal* text documents that are not real
   * files: the Source Control input box (`scm0/input`), the Git output
   * view, debug consoles, search results, and so on. They are ordinary
   * `TextDocument`s, so without a filter they get bound to the shared
   * CRDT and published as the host's "active file" — which then becomes
   * the file every guest opens in the Lite Viewer. The guest ends up
   * staring at an empty SCM input box instead of the code.
   *
   * Only real, addressable documents are shareable: files on disk
   * (`file:`), files served by a remote host (`vscode-remote:`), and
   * untitled scratch buffers (`untitled:`).
   */
  static isShareableDocument(doc: vscode.TextDocument): boolean {
    const scheme = doc.uri.scheme;
    return scheme === 'file' || scheme === 'vscode-remote' || scheme === 'untitled';
  }

  bindDocument(doc: vscode.TextDocument): void {
    // Internal documents (SCM input, output view, …) are never shared.
    if (!CollabClient.isShareableDocument(doc)) return;
    const key = doc.uri.toString();
    if (this.bindings.has(key)) {
      // Re-binding (e.g. after the user re-opened a document). Make
      // sure the doc reflects the latest yText content.
      this.enqueueSyncDoc(this.bindings.get(key)!);
      return;
    }

    const yText = this.ydoc.getText('doc:' + key);

    const binding: SharedBinding = {
      uri: key,
      doc,
      yText,
      binding: [],
      lastDocText: doc.getText(),
      writeQueue: Promise.resolve(),
    };

    const fromDoc = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== key) return;
      const b = this.bindings.get(key);
      if (!b) return;

      const current = b.doc.getText();
      const previous = b.lastDocText;
      b.lastDocText = current;

      // The document already matches the shared text — this change was
      // either our own write coming back, or a remote change that has
      // already been applied to the Y.Text. Either way there is
      // nothing to push.
      if (current === b.yText.toString()) return;

      // Viewers are read-only: revert their local edit by replacing
      // the doc content with the authoritative yText content.
      if (this.getLocalPermission() === 'viewer') {
        this.revertDocToYText(b);
        return;
      }

      this.applyDocChangeToY(b, previous, current);
    });

    const fromY = (() => {
      const handler = (event: Y.YTextEvent, transaction: Y.Transaction) => {
        // transaction.local is true when the change originated from
        // this client — that case is already covered by the doc→Y
        // bridge. We only need to apply remote changes here.
        if (transaction.local) return;
        const current = this.bindings.get(key);
        if (!current) return;
        this.enqueueSyncDoc(current);
      };
      yText.observe(handler);
      return new vscode.Disposable(() => yText.unobserve(handler));
    })();

    binding.binding = [fromDoc, fromY];
    this.bindings.set(key, binding);

    // Sync up the doc with whatever the CRDT already has. This is
    // essential for late joiners: by the time bindDocument runs, the
    // initial sync may have populated yText with the host's content.
    if (yText.length > 0) {
      this.enqueueSyncDoc(binding);
    } else if (doc.getText().length > 0) {
      // yText is empty — push the local content so the host's peers
      // can see this file.
      this.ydoc.transact(() => {
        yText.insert(0, doc.getText());
      }, 'local-init');
    }

    // Publish the file the local user is working on so peers (and the
    // Lite Viewer) can locate the matching shared document.
    this.publishActiveFile(doc);

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
    if (!CollabClient.isShareableDocument(doc)) return;
    const key = doc.uri.toString();
    const yText = this.ydoc.getText('doc:' + key);
    if (yText.length === 0 && doc.getText().length > 0) {
      // Seed the shared text with the local content. Inserting the
      // whole document in one go is deliberate here — this is a
      // one-time initialisation, not an edit, and a diff-based splice
      // against an empty Y.Text would produce the same result at a
      // fraction of the cost.
      this.ydoc.transact(() => {
        yText.insert(0, doc.getText());
      }, 'local-init');
    }
    // Sharing a file is also a signal that this is the file the user
    // wants guests to look at — publish it so the Lite Viewer can jump
    // straight to it.
    this.publishActiveFile(doc);
  }

  /** Publish cursor position so other collaborators see it. */
  setLocalCursor(doc: vscode.TextDocument, selection: vscode.Selection): void {
    if (!this.awareness) return;
    if (!CollabClient.isShareableDocument(doc)) return;
    this.awareness.setLocalStateField('cursor', {
      anchor: { line: selection.anchor.line, char: selection.anchor.character },
      head: { line: selection.active.line, char: selection.active.character },
    });
    this.publishActiveFile(doc);
  }

  /**
   * Publish which file the local user has open.
   *
   * Two fields are needed, and they are NOT interchangeable:
   *   • `filePath` — the human-readable path (doc.fileName). Used for
   *     display ("hello.js") and as a fallback for peers that don't
   *     know about URIs.
   *   • `fileUri`  — the canonical `doc.uri.toString()`. This is the
   *     exact string the Y.Text key is derived from
   *     (`'doc:' + uri`), so a remote peer can look up the shared
   *     document by key without guessing how the URI was encoded.
   *
   * The Lite Viewer used to rebuild the key from `filePath`, which
   * produced a different key than the extension's (URI vs path), so it
   * never found the host's document. `fileUri` removes that guesswork.
   */
  publishActiveFile(doc: vscode.TextDocument): void {
    if (!this.awareness) return;
    // Never point the room at an internal document. If the user just
    // clicked into the Source Control input box, the previously shared
    // file stays published — the guest keeps reading real code.
    if (!CollabClient.isShareableDocument(doc)) return;
    this.awareness.setLocalStateField('filePath', doc.fileName);
    this.awareness.setLocalStateField('fileUri', doc.uri.toString());
  }

  /**
   * Publish the editor the user is actually looking at.
   *
   * Binding order alone doesn't tell you which file the host cares
   * about — `vscode.workspace.textDocuments` is unordered, and the
   * "last bound document wins" rule published whichever file happened
   * to sort last. The active editor is the authoritative answer, so
   * publish that explicitly.
   */
  publishActiveEditor(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    this.publishActiveFile(editor.document);
    this.setLocalCursor(editor.document, editor.selection);
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
   * Translate a local document change into the equivalent Y.Text edit.
   *
   * VS Code reports changes as offsets into the document *before* the
   * change, while the Y.Text may have moved on since (a remote peer
   * could have inserted text earlier in the file). Replaying the raw
   * offsets against the Y.Text would then write to the wrong place —
   * and if the offset happened to be at the end of the file, it would
   * append a duplicate.
   *
   * So instead of replaying offsets we diff the content: the change is
   * expressed as "the document went from A to B", and we compute the
   * splice that turns the Y.Text's current content into B. The splice
   * is applied to the Y.Text, and both sides end up holding B.
   */
  private applyDocChangeToY(
    binding: SharedBinding,
    previousDocText: string,
    currentDocText: string
  ): void {
    const yContent = binding.yText.toString();
    if (currentDocText === yContent) {
      // Already consistent — nothing to push.
      return;
    }

    // Map the edit through whatever remote changes have landed in the
    // shared text since the document was last in sync with it. This is
    // what keeps a concurrent edit made elsewhere in the file from
    // being overwritten.
    const ops = planLocalEdit(yContent, previousDocText, currentDocText);
    if (ops.length === 0) {
      return;
    }

    this.ydoc.transact(() => {
      // Apply from last to first: deleting and inserting shifts the
      // offsets of everything after it, so the later operations have
      // to land before the earlier ones move them.
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        if (op.deleteCount > 0) {
          binding.yText.delete(op.start, op.deleteCount);
        }
        if (op.text.length > 0) {
          binding.yText.insert(op.start, op.text);
        }
      }
    }, 'local-edit');

    // The Y.Text now holds the document's content, but a remote change
    // may have arrived in the same window. Queue a doc sync so the
    // document ends up holding the merged result.
    this.enqueueSyncDoc(binding);
  }

  /**
   * Queue a "make the document match the Y.Text" step.
   *
   * Writes are serialised through `binding.writeQueue`: VS Code applies
   * edits asynchronously, and two overlapping `applyEdit` calls would
   * each be computed against a document state the other had already
   * invalidated.
   */
  private enqueueSyncDoc(binding: SharedBinding): void {
    binding.writeQueue = binding.writeQueue
      .then(() => this.syncDocNow(binding))
      .catch(() => { /* a failed write is retried by the next change */ });
  }

  /** The actual "document := Y.Text" step. Runs on the write queue. */
  private async syncDocNow(binding: SharedBinding): Promise<void> {
    const target = binding.yText.toString();
    const current = binding.doc.getText();
    if (current === target) {
      return;
    }

    // Diff the two contents and apply only the regions that actually
    // differ. A whole-document replacement would lose the cursor
    // position and, for large files, is expensive.
    const hunks = diffHunks(current, target);
    if (hunks.length === 0) return;

    const edit = new vscode.WorkspaceEdit();
    for (const hunk of hunks) {
      const startPos = binding.doc.positionAt(hunk.aStart);
      const endPos = binding.doc.positionAt(hunk.aEnd);
      edit.replace(
        binding.doc.uri,
        new vscode.Range(startPos, endPos),
        target.slice(hunk.bStart, hunk.bEnd)
      );
    }

    await vscode.workspace.applyEdit(edit);
  }

  /** Replace the document's content with the yText content (viewer revert). */
  private revertDocToYText(binding: SharedBinding): void {
    this.enqueueSyncDoc(binding);
    void vscode.window.showWarningMessage(
      'Eric Collab: viewers are read-only — your edit was reverted.'
    );
  }

  private setState(state: CollabState): void {
    this.state = state;
    this.emit('stateChange', state);
  }

  private emitPresence(): void {
    if (!this.awareness) return;
    const states = this.awareness.getStates();
    // One entry per *user*, not per awareness state. The same user can
    // legitimately have several awareness states in a room: every
    // code-server window that ever ran the extension keeps broadcasting
    // its state until the relay expires it, and they all share the same
    // persisted `userId`. Counting states would report one person as
    // three or four users. When a user has several states, keep the
    // most informative one — the one that published a `fileUri` (the
    // active file) beats a bare state.
    const byUser = new Map<string, UserPresence>();
    for (const [clientId, state] of states.entries()) {
      const u = presenceToUser(state);
      if (!u) continue;
      // Fill in the permission from our Y.Map snapshot if the
      // awareness state didn't include it yet (it does once
      // refreshLocalPermission runs).
      if (!u.permission) {
        u.permission = this.getUserPermission(u.userId);
      }
      const existing = byUser.get(u.userId);
      if (!existing) {
        byUser.set(u.userId, u);
        continue;
      }
      const better = (a: UserPresence, b: UserPresence) => {
        if (!!a.fileUri !== !!b.fileUri) return !!a.fileUri;
        if (!!a.filePath !== !!b.filePath) return !!a.filePath;
        return (a.joinedAt ?? 0) >= (b.joinedAt ?? 0);
      };
      if (better(u, existing)) byUser.set(u.userId, u);
    }
    this.emit('presenceChange', Array.from(byUser.values()));
  }
}
