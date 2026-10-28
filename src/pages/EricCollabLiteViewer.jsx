// EricCollabLiteViewer
//
// A *tunnel-independent* viewer for Eric Collab sessions. Unlike the
// full code-server IDE (which goes through the host's localtunnel),
// this page connects directly to the public Yjs signaling server and
// shows the open file in a simple editor.
//
// Why this exists
// ---------------
//   • "Bad Gateway" (502) errors come from loca.lt when the host's
//     tunnel re-registers with a new random subdomain, or the host
//     machine drops offline for a moment. The Yjs document is still
//     alive on the public signaling server — only the *browser-side
//     route into the host's code-server* is dead. A guest can use
//     this page to keep reading/writing the same Y.Doc while the
//     tunnel recovers.
//
//   • First-load latency is dramatically lower. The full code-server
//     workbench is ~5 MB of JS plus a service worker. This page is
//     a single React component that opens one Y.Doc, so it usually
//     renders in <1s on the guest's first hit.
//
// URL shape
// ---------
//   /viewer?room=<ROOM_ID>&server=<WS_URL>[&name=<DISPLAY_NAME>]
//
// Both `room` and `server` are required. `name` is optional and sets
// the local awareness display name. The room id is the same 8-char
// dash-separated code the host generates in code-server (e.g.
// KQ7P-3XRN).

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import { planLocalEdit, applyOpsToYText } from '../utils/textDiff';
import {
  Wifi, WifiOff, Users, Copy, Check, Shield, Edit3, Eye,
  AlertCircle, RefreshCw, ArrowLeft, Code2, Send, Hash, Server,
} from 'lucide-react';

// Lightweight ID generator — good enough for display names + colors.
function shortId(len = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function colorFromId(id) {
  // Deterministic pastel — pick H based on the id's character codes.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

const SIGNALING_DEFAULT = 'wss://demos.yjs.dev/ws';

// The y-websocket client appends the room name to whatever base URL it is
// given, so the relay's "/ws/<room>" route needs "/ws" in the base. Users
// naturally paste a bare origin ("ws://127.0.0.1:1234"), which would
// produce "/<room>" and be rejected — so add "/ws" when no path is present.
export function normaliseSignalingServer(url) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  // Strip a trailing slash so we can inspect the path reliably.
  const trimmed = raw.replace(/\/+$/, '');
  const schemeEnd = trimmed.indexOf('://');
  if (schemeEnd < 0) return trimmed;
  const afterScheme = trimmed.slice(schemeEnd + 3);
  const slash = afterScheme.indexOf('/');
  if (slash < 0) return `${trimmed}/ws`;
  // Already has a path — leave it alone.
  return trimmed;
}

export default function EricCollabLiteViewer() {
  // ---- URL params ---------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get('room') || '';
  const initialServer = params.get('server') || SIGNALING_DEFAULT;
  const initialName = params.get('name') || '';

  // ---- Local user ---------------------------------------------------------
  const localUserId = useMemo(() => {
    const stored = localStorage.getItem('ericCollabLiteUserId');
    if (stored) return stored;
    const fresh = 'guest-' + shortId(8);
    localStorage.setItem('ericCollabLiteUserId', fresh);
    return fresh;
  }, []);
  const localColor = useMemo(() => colorFromId(localUserId), [localUserId]);
  const [name, setName] = useState(() => {
    if (initialName) return initialName;
    return localStorage.getItem('ericCollabLiteName') || `Guest ${shortId(4).toUpperCase()}`;
  });

  // ---- Connection state ---------------------------------------------------
  const [room, setRoom] = useState(initialRoom);
  const [server, setServer] = useState(initialServer);
  const [joined, setJoined] = useState(false);
  const [connState, setConnState] = useState('disconnected'); // connecting | connected | disconnected
  const [peers, setPeers] = useState([]); // [{userId, name, color, permission, filePath, isMaster}]
  const [activeFile, setActiveFile] = useState(null); // doc URI the host is editing
  const [activeLabel, setActiveLabel] = useState(''); // human-readable path for display
  // Mirror of activeFile for use inside long-lived callbacks
  // (refreshPeers / refreshDocList) that are captured once by `connect`.
  const activeFileRef = useRef(null);
  const [docContent, setDocContent] = useState('');
  const [synced, setSynced] = useState(false);
  const [editable, setEditable] = useState(false); // gated by host's permission map
  const [masterId, setMasterId] = useState(null);
  const [selfPerm, setSelfPerm] = useState('viewer');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const docRef = useRef(null);
  const providerRef = useRef(null);
  const awarenessRef = useRef(null);
  const bindingsRef = useRef(new Map()); // docKey -> {yText, unsubscribe, localText}
  // The content the editor is currently showing. A local edit is
  // planned against this text, not against the shared text, so that a
  // remote change that has not been rendered yet is not thrown away.
  const displayedRef = useRef('');
  const [knownDocs, setKnownDocs] = useState([]); // [{key, content, length}]
  const permissionsRef = useRef(new Map()); // userId -> permission, from the Y.Map

  // ---- Permission resolution ---------------------------------------------
  // The canonical permission source is the shared `permissions` Y.Map that
  // the host writes to (plus `meta.hostUserId` for the master). Awareness
  // only carries a *hint* — the host promotes a guest by writing to the
  // Y.Map, and the guest's own awareness `permission` field is refreshed
  // by the extension when it sees that write. A standalone viewer (this
  // page) has to read the Y.Map directly, otherwise a promotion never
  // takes effect here.
  const resolvePermissions = useCallback(() => {
    const ydoc = docRef.current;
    if (!ydoc) return;
    const meta = ydoc.getMap('meta');
    const perms = ydoc.getMap('permissions');
    const map = new Map();
    const hostId = meta.get('hostUserId');
    if (hostId) map.set(hostId, 'master');
    for (const [userId, entry] of perms.entries()) {
      const perm = entry && entry.permission;
      if (perm) map.set(userId, perm);
    }
    permissionsRef.current = map;
    const mine = map.get(localUserId) || 'viewer';
    setSelfPerm(mine);
    setEditable(mine === 'master' || mine === 'editor');
    // Republish our permission so peers render the right badge.
    const aw = awarenessRef.current;
    if (aw) {
      const cur = aw.getLocalState();
      if (cur && cur.permission !== mine) {
        aw.setLocalStateField('permission', mine);
      }
    }
  }, [localUserId]);

  // ---- Connect / disconnect ----------------------------------------------
  // `disconnect` is declared before `connect` because `connect` calls it
  // when the host removes us from the room — declaring it afterwards
  // would put the reference in the temporal dead zone.
  const disconnect = useCallback(() => {
    if (providerRef.current) {
      try { providerRef.current.destroy(); } catch { /* ignore */ }
      providerRef.current = null;
    }
    if (docRef.current) {
      try { docRef.current.destroy(); } catch { /* ignore */ }
      docRef.current = null;
    }
    awarenessRef.current = null;
    bindingsRef.current = new Map();
    setJoined(false);
    setConnState('disconnected');
    setPeers([]);
    setKnownDocs([]);
    setDocContent('');
    activeFileRef.current = null;
    setActiveFile(null);
    setActiveLabel('');
    setSynced(false);
    setMasterId(null);
    setSelfPerm('viewer');
    setEditable(false);
  }, []);

  const connect = useCallback(() => {
    if (!room || !server) {
      setError('Both a room id and signaling server are required.');
      return;
    }
    setError(null);
    setJoined(false);
    setPeers([]);
    setKnownDocs([]);

    // Tear down any previous connection.
    if (providerRef.current) {
      try { providerRef.current.destroy(); } catch { /* ignore */ }
      providerRef.current = null;
    }
    if (docRef.current) {
      try { docRef.current.destroy(); } catch { /* ignore */ }
      docRef.current = null;
    }
    awarenessRef.current = null;
    bindingsRef.current = new Map();

    const ydoc = new Y.Doc();
    docRef.current = ydoc;

    // y-websocket appends the room name to the server URL, so the relay's
    // "/ws/<room>" path has to be part of the base URL we hand over.
    // A bare origin like "ws://127.0.0.1:1234" would be turned into
    // "ws://127.0.0.1:1234/<room>" and the server would reject it, so
    // normalise the origin to include "/ws" when no path was given.
    const base = normaliseSignalingServer(server);

    const provider = new WebsocketProvider(base, room, ydoc, {
      connect: true,
      resyncInterval: 1000,
      maxBackoffTime: 4000,
    });
    providerRef.current = provider;
    awarenessRef.current = provider.awareness;

    provider.on('status', (evt) => setConnState(evt.status));
    provider.on('sync', (isSynced) => {
      setSynced(!!isSynced);
      if (isSynced) {
        resolvePermissions();
        refreshDocList();
      }
    });
    provider.awareness.on('change', refreshPeers);

    // Watch the shared permission + host maps so a promotion/demotion by
    // the host takes effect immediately in this viewer.
    const metaMap = ydoc.getMap('meta');
    const permsMap = ydoc.getMap('permissions');
    const kickedMap = ydoc.getMap('kicked');
    const onPermsChange = () => resolvePermissions();
    metaMap.observe(onPermsChange);
    permsMap.observe(onPermsChange);

    // The host can remove a guest from the room by setting the shared
    // `kicked` flag. The extension disconnects the guest locally when it
    // sees that flag; the viewer has to do the same.
    const onKickedChange = () => {
      if (!kickedMap.get(localUserId)) return;
      setError('You were removed from this room by the host.');
      disconnect();
    };
    kickedMap.observe(onKickedChange);

    // Discover Y.Texts that exist on the Y.Doc.
    ydoc.on('update', () => {
      // Debounce by reading on next tick — Yjs fires updates very often.
      setTimeout(refreshDocList, 50);
    });

    // Set local awareness.
    provider.awareness.setLocalStateField('user', {
      userId: localUserId,
      name: name || `Guest ${shortId(4).toUpperCase()}`,
      color: localColor,
      joinedAt: Date.now(),
    });
    // Publish our own permission so the host's sidebar renders our badge
    // correctly without waiting for the Y.Map round-trip.
    provider.awareness.setLocalStateField('permission', selfPerm);

    setJoined(true);
  }, [room, server, localUserId, localColor, name, resolvePermissions, disconnect]);

  // ---- Discover the docs the host has shared -----------------------------
  // The Eric Collab extension stores one Y.Text per open document, keyed
  // as `doc:<document.uri.toString()>`. A peer therefore has to know the
  // *URI* to find the text — rebuilding the key from the human-readable
  // file path produces a different key and finds nothing.
  //
  // Peers publish two fields for this:
  //   • awareness.fileUri  — the exact URI string the key is built from
  //   • awareness.filePath — the display path (doc.fileName)
  // plus awareness.permission at the TOP level of the state (not nested
  // inside `user`), which is where the extension writes it.
  const refreshPeers = useCallback(() => {
    const aw = awarenessRef.current;
    if (!aw) return;
    const states = Array.from(aw.getStates().entries());
    const list = [];
    let foundMaster = null;
    const masterUserIds = new Set();
    for (const [clientId, state] of states) {
      const u = state?.user;
      if (!u) continue;
      const userId = u.userId || `c${clientId}`;
      // The Y.Map is canonical; awareness is the fallback for peers that
      // haven't published a permission yet.
      const permission =
        permissionsRef.current.get(userId) ||
        state.permission ||
        'viewer';
      list.push({
        clientId,
        userId,
        name: u.name || 'Anonymous',
        color: u.color || '#888',
        permission,
        filePath: state.filePath || '',
        fileUri: state.fileUri || '',
        joinedAt: state.joinedAt ?? 0,
      });
      if (permission === 'master') {
        masterUserIds.add(userId);
        if (!foundMaster) foundMaster = userId;
      }
    }
    // One row per *user*, not per awareness state. The same person can
    // have several states in a room (each code-server window that ever
    // ran the extension keeps broadcasting until the relay expires it,
    // and they share one persisted `userId`). Keep the most informative
    // state — the one that published a `fileUri`.
    const byUser = new Map();
    for (const p of list) {
      const existing = byUser.get(p.userId);
      if (!existing) {
        byUser.set(p.userId, p);
        continue;
      }
      const better = (a, b) => {
        if (!!a.fileUri !== !!b.fileUri) return !!a.fileUri;
        if (!!a.filePath !== !!b.filePath) return !!a.filePath;
        return (a.joinedAt ?? 0) >= (b.joinedAt ?? 0);
      };
      if (better(p, existing)) byUser.set(p.userId, p);
    }
    const peers = Array.from(byUser.values());
    setPeers(peers);
    setMasterId(foundMaster);

    // The "active" file is the one the master is editing — fall back to
    // any other user's file if no master is present.
    //
    // A room can hold several *stale* master sessions at once: every
    // code-server window that ever ran the extension keeps broadcasting
    // its awareness state until the relay expires it, and they all share
    // the same persisted `userId`. Older sessions predate the `fileUri`
    // awareness field, so picking "the first master" can select one
    // without a `fileUri` and leave the editor blank even though a live
    // master is sharing a file. Prefer a master that actually published
    // a `fileUri`, and only then fall back to the others.
    const masterPeers = peers.filter((p) => masterUserIds.has(p.userId));
    const activePeer =
      masterPeers.find((p) => p.fileUri) ||
      peers.find((p) => p.fileUri) ||
      masterPeers[0] ||
      null;
    const next = activePeer?.fileUri || null;
    if (next !== activeFileRef.current) {
      activeFileRef.current = next;
      setActiveFile(next);
    }
    setActiveLabel(activePeer?.filePath || '');
  }, []);

  // ---- Refresh the list of known shared docs -----------------------------
  const refreshDocList = useCallback(() => {
    const ydoc = docRef.current;
    if (!ydoc) return;
    // The shared document is keyed `doc:<document.uri.toString()>`, and
    // the active URI is published by the host through awareness
    // (`fileUri`), so we can look the Y.Text up by name.
    const uri = activeFileRef.current;
    if (uri) {
      const key = 'doc:' + uri;
      const yText = ydoc.getText(key);
      bindingsRef.current.set(key, yText);
      setDocContent(yText.toString());
    }
  }, []);

  // ---- Bind to the active file's Y.Text for editing ----------------------
  useEffect(() => {
    const ydoc = docRef.current;
    if (!ydoc || !activeFile) return;
    const key = 'doc:' + activeFile;
    const yText = ydoc.getText(key);
    let lastSeen = yText.toString();
    setDocContent(lastSeen);
    const handler = () => {
      const cur = yText.toString();
      if (cur !== lastSeen) {
        lastSeen = cur;
        // Only the rendered content is updated here. `displayedRef` is
        // deliberately left alone: it has to keep pointing at what the
        // editor is actually showing, so that a keystroke that lands
        // before React has re-rendered is still planned against the
        // text the user was looking at.
        setDocContent(cur);
      }
    };
    yText.observe(handler);
    return () => yText.unobserve(handler);
  }, [activeFile, joined]);

  // The content the editor is showing. Kept in step with the rendered
  // value, not with the shared text — a local edit is planned against
  // the text the user was looking at, so a remote change that has not
  // been rendered yet is not thrown away.
  useEffect(() => {
    displayedRef.current = docContent;
  }, [docContent]);

  // Auto-connect on mount if we have a room + server AND we already know
  // who this guest is. A returning guest reconnects silently; a first-time
  // guest gets the "join" screen so they can pick a display name first.
  useEffect(() => {
    const knownName = localStorage.getItem('ericCollabLiteName');
    if (initialRoom && initialServer && knownName) {
      connect();
    }
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Handlers ----------------------------------------------------------
  const handleContentChange = (e) => {
    if (!editable) return;
    const newVal = e.target.value;
    const ydoc = docRef.current;
    if (!ydoc || !activeFile) return;
    const key = 'doc:' + activeFile;
    const yText = ydoc.getText(key);
    const cur = yText.toString();
    if (newVal === cur) return;

    // The edit is applied as a *diff*, never as a whole-file
    // replacement.
    //
    // Replacing the whole Y.Text on every keystroke is correct but
    // pathological for a CRDT: each keystroke tombstones every
    // character in the file and re-inserts it, so the room's persisted
    // state grew with the square of the number of keystrokes. A short
    // editing session was enough to produce a 60 MB room file for a
    // few hundred lines of code.
    //
    // It is also wrong whenever the editor and the shared text have
    // drifted apart — a remote change that has not been rendered yet
    // would be deleted along with the rest of the file. So the edit is
    // planned against the content the editor was actually showing, and
    // then mapped onto the shared text's current content.
    const previous = displayedRef.current;
    let ops;
    if (!previous && cur) {
      // The editor is showing an empty document while the shared text
      // holds content — the two are unrelated, so the edit cannot be
      // mapped onto the shared text. Put the typed text at the top
      // rather than deleting the shared content.
      ops = [{ start: 0, deleteCount: 0, text: newVal }];
    } else {
      ops = planLocalEdit(cur, previous, newVal);
    }
    ydoc.transact(() => {
      applyOpsToYText(yText, ops);
    }, 'local-edit');

    // Show the merged result: the local edit plus anything that
    // arrived from a peer in the meantime.
    const merged = yText.toString();
    displayedRef.current = merged;
    setDocContent(merged);
  };

  const copyInvite = () => {
    const url = new URL(window.location.href);
    navigator.clipboard?.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyRoomCode = () => {
    navigator.clipboard?.writeText(room);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleConnect = (e) => {
    e.preventDefault();
    if (!room) {
      setError('Please enter a room id (the 8-character code from the host).');
      return;
    }
    localStorage.setItem('ericCollabLiteName', name);
    // Update the URL so it's shareable.
    const u = new URL(window.location.href);
    u.searchParams.set('room', room);
    u.searchParams.set('server', server);
    u.searchParams.set('name', name);
    window.history.replaceState({}, '', u.toString());
    connect();
  };

  // ---- Render ------------------------------------------------------------
  if (!joined) {
    // When the guest arrives through a share link the room code is
    // already filled in, so the form collapses to a single "join" tap
    // plus a display name. That keeps the first-run experience to one
    // decision on a phone, where typing is expensive.
    const hasRoom = Boolean(room);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
        <form
          onSubmit={handleConnect}
          className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 dark:text-white">
                {hasRoom ? "You've been invited" : 'Eric Collab · Lite Viewer'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasRoom
                  ? 'Pick a name to see the shared code. No install needed.'
                  : 'Read & edit the shared file directly. No code-server required.'}
              </p>
            </div>
          </div>

          {hasRoom && (
            <div className="px-6 pt-5">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3 py-2.5">
                <Hash className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-slate-600 dark:text-slate-300">Room</span>
                <code className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  {room}
                </code>
              </div>
            </div>
          )}

          <div className="p-6 space-y-4">
            {!hasRoom && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Room id
                </span>
                <input
                  value={room}
                  onChange={(e) => setRoom(e.target.value.toUpperCase())}
                  placeholder="KQ7P-3XRN"
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Your display name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guest A1B2"
                autoComplete="nickname"
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </label>
            {/* The signaling server is an implementation detail when the
                guest arrived through a share link — it is already baked
                into the URL. Only show it for a manual join. */}
            {!hasRoom && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Signaling server
                </span>
                <input
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder={SIGNALING_DEFAULT}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>
            )}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white shadow-md"
            >
              <Wifi className="w-4 h-4" />
              {hasRoom ? 'Join room' : 'Connect'}
            </button>
            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-center">
              {hasRoom
                ? 'You will see the shared code as soon as you join.'
                : 'The room id is the 8-character code (e.g. KQ7P-3XRN) the host sees in their Eric Collab sidebar.'}
            </p>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Eric Collab · Lite</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Tunnel-independent viewer
              </div>
            </div>
          </div>
          <div className="flex-1" />
          <ConnPill state={connState} synced={synced} onRefresh={() => connect()} />
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Hash className="w-3.5 h-3.5" />
            <code className="font-mono text-slate-700 dark:text-slate-200">{room}</code>
            <button onClick={copyRoomCode} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Copy room code">
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <button
            onClick={disconnect}
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-red-500"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Main split */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Editor */}
        <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {editable ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white bg-emerald-600">
                  <Edit3 className="w-2.5 h-2.5" /> Editor
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                  <Eye className="w-2.5 h-2.5" /> Read-only
                </span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-xs">
                {activeLabel || activeFile || 'Waiting for the host to open a file…'}
              </span>
            </div>
            <div className="flex-1" />
            <span className="text-[10px] text-slate-400">{docContent.length} chars</span>
          </div>
          <textarea
            value={docContent}
            onChange={handleContentChange}
            readOnly={!editable}
            spellCheck={false}
            className="flex-1 w-full p-4 font-mono text-xs leading-relaxed bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none resize-none"
            placeholder={activeFile ? '// Loading…' : '// The host hasn\'t shared a file yet. Open one in code-server.'}
          />
          <div className="p-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
            <span>
              {editable
                ? 'You have edit access. Changes sync to all peers.'
                : 'You are a viewer. Edits are disabled until the host grants you editor access.'}
            </span>
            <span className="font-mono">{server.replace(/^wss?:\/\//, '').slice(0, 32)}</span>
          </div>
        </div>

        {/* Sidebar: peers + tips */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">In the room</h2>
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                {peers.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {peers.length === 0 ? (
                <li className="p-3 text-xs text-slate-500 dark:text-slate-400">
                  No peers yet. The host should be joining now…
                </li>
              ) : peers.map((p) => (
                <li key={p.clientId} className="p-3 flex items-center gap-2">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: p.color }}
                    title={p.name}
                  >
                    {(p.name || '?')[0].toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                      {p.name}
                      {p.userId === localUserId && <span className="text-[10px] text-slate-400">(you)</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {p.filePath ? p.filePath.split(/[\\/]/).slice(-2).join('/') : 'idle'}
                    </div>
                  </div>
                  <PermBadge perm={p.permission} />
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-600 dark:text-slate-400 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              Why a Lite Viewer?
            </div>
            <p>
              This page talks to the public Yjs signaling server — no tunnel,
              no code-server workbench to download. Use it to keep reading and
              editing while the host's tunnel re-establishes after a hiccup.
            </p>
            <button
              onClick={copyInvite}
              className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy this page URL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnPill({ state, synced, onRefresh }) {
  const meta = {
    connected: { color: 'bg-emerald-500', text: synced ? 'Synced' : 'Connected', ring: 'ring-emerald-500/30' },
    connecting: { color: 'bg-amber-500', text: 'Connecting…', ring: 'ring-amber-500/30' },
    disconnected: { color: 'bg-red-500', text: 'Disconnected', ring: 'ring-red-500/30' },
  }[state] || { color: 'bg-slate-400', text: state, ring: 'ring-slate-400/30' };
  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ring-1 ${meta.ring}`}>
      <span className={`w-2 h-2 rounded-full ${meta.color}`} />
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{meta.text}</span>
      <button onClick={onRefresh} className="text-slate-400 hover:text-slate-700" title="Reconnect">
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );
}

function PermBadge({ perm }) {
  if (perm === 'master') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white bg-gradient-to-r from-violet-600 to-fuchsia-500">
        <Shield className="w-2.5 h-2.5" /> Master
      </span>
    );
  }
  if (perm === 'editor') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white bg-emerald-600">
        <Edit3 className="w-2.5 h-2.5" /> Editor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
      <Eye className="w-2.5 h-2.5" /> Viewer
    </span>
  );
}
