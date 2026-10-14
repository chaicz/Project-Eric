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
  const [activeFile, setActiveFile] = useState(null); // doc key the host is editing
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
  const [knownDocs, setKnownDocs] = useState([]); // [{key, content, length}]

  // ---- Connect / disconnect ----------------------------------------------
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

    const provider = new WebsocketProvider(server, room, ydoc, {
      connect: true,
      resyncInterval: 1000,
      maxBackoffTime: 4000,
    });
    providerRef.current = provider;
    awarenessRef.current = provider.awareness;

    provider.on('status', (evt) => setConnState(evt.status));
    provider.on('sync', (isSynced) => {
      setSynced(!!isSynced);
      if (isSynced) refreshDocList();
    });
    provider.awareness.on('change', refreshPeers);

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

    setJoined(true);
  }, [room, server, localUserId, localColor, name]);

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
    setActiveFile(null);
    setSynced(false);
    setMasterId(null);
    setSelfPerm('viewer');
  }, []);

  // ---- Discover the docs the host has shared -----------------------------
  // The Eric Collab extension stores one Y.Text per open document, keyed
  // as `doc:<fileUri>`. We can't enumerate Y.Texts by name from the
  // outside, so we listen to the Y.Doc for "afterTransaction" and read
  // all current share types. y-protocols exposes this via ydoc.share,
  // but that's an internal map. The cleanest public API is to look at
  // the awareness state: each peer's awareness carries `filePath` (the
  // file they're editing), and from that we can compute the Y.Text key.
  const refreshPeers = useCallback(() => {
    const aw = awarenessRef.current;
    if (!aw) return;
    const states = Array.from(aw.getStates().entries());
    const list = [];
    let foundMaster = null;
    let myPerm = 'viewer';
    for (const [clientId, state] of states) {
      const u = state?.user;
      if (!u) continue;
      list.push({
        clientId,
        userId: u.userId || `c${clientId}`,
        name: u.name || 'Anonymous',
        color: u.color || '#888',
        permission: u.permission || 'viewer',
        filePath: u.filePath || '',
      });
      if (u.permission === 'master' && !foundMaster) foundMaster = u.userId;
      if (u.userId === localUserId) myPerm = u.permission || 'viewer';
    }
    setPeers(list);
    setMasterId(foundMaster);
    setSelfPerm(myPerm);
    setEditable(myPerm === 'master' || myPerm === 'editor');

    // The "active" file is the one the master is editing — fall back to
    // any other user's filePath if no master is present.
    const masterPeer = list.find((p) => p.userId === foundMaster);
    const next = masterPeer?.filePath || list.find((p) => p.filePath)?.filePath || null;
    if (next !== activeFile) {
      setActiveFile(next);
    }
  }, [localUserId, activeFile]);

  // ---- Refresh the list of known shared docs -----------------------------
  const refreshDocList = useCallback(() => {
    const ydoc = docRef.current;
    if (!ydoc) return;
    // Walk the share map (private API) to find all Y.Texts.
    // eslint-disable-next-line no-underscore-dangle
    const share = ydoc.store?.clients;
    // Y.Doc doesn't expose `store.share` publicly; the only way to
    // enumerate Y.Texts without knowing their names is to inspect the
    // doc's internal types. We rely on awareness + the conventional
    // `doc:<uri>` naming the extension uses.
    if (activeFile) {
      const key = 'doc:' + activeFile;
      const yText = ydoc.getText(key);
      bindingsRef.current.set(key, yText);
      setDocContent(yText.toString());
    }
  }, [activeFile]);

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
        setDocContent(cur);
      }
    };
    yText.observe(handler);
    return () => yText.unobserve(handler);
  }, [activeFile, joined]);

  // Auto-connect on mount if we have a room + server.
  useEffect(() => {
    if (initialRoom && initialServer) {
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
    // Naive replace — for a real CRDT editor you'd compute a diff, but
    // since Y.Text diffs are non-trivial, we replace the whole content.
    // This is acceptable for small files (under a few hundred lines)
    // and matches what `Ctrl+A, Ctrl+V` does in a real editor.
    ydoc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newVal);
    }, 'local-edit');
    setDocContent(newVal);
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
              <h1 className="font-bold text-slate-900 dark:text-white">Eric Collab · Lite Viewer</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Read & edit the shared file directly. No code-server required.
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
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
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Your display name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guest A1B2"
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </label>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white shadow-md"
            >
              <Wifi className="w-4 h-4" />
              Connect
            </button>
            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-center">
              The room id is the 8-character code (e.g. <span className="font-mono">KQ7P-3XRN</span>) the
              host sees in their Eric Collab sidebar.
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
                {activeFile || 'Waiting for the host to open a file…'}
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
