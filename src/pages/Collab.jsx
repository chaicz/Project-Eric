// Collab.jsx
// ---------------------------------------------------------------------------
// The "Live Collaboration" page — a guided, first-time-user-friendly front
// door for Eric Collab.
//
// Why this page exists
// --------------------
// Collaboration used to live entirely inside the VS Code extension's
// sidebar. That is a fine place for *power* users, but a first-time user
// had to know all of this before they could share anything:
//
//   1. code-server had to be running,
//   2. the Eric Collab panel had to be opened in the activity bar,
//   3. a session had to be started by hand,
//   4. a public tunnel had to come up,
//   5. the resulting localtunnel URL had to be copied and rewritten
//      into a form the guest could use.
//
// This page collapses that into three visible steps with plain-language
// labels, and it produces a link that works on a phone: the Cloudflare
// quick tunnel exposes the Lite Viewer page *and* proxies the realtime
// Yjs channel through the same public origin.
//
// The page has two modes:
//
//   Host  — start a session, get a share link, copy it, watch who joined.
//   Join  — paste a link (or a room code) to join someone else's session.
//
// Both modes are also reachable from the Lite Viewer route, which is what
// a guest opens.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Copy,
  Check,
  Loader2,
  Globe,
  Link2,
  QrCode,
  Smartphone,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  X,
  Radio,
  Monitor,
  Keyboard,
  PartyPopper,
  Info,
  Plug,
  PlugZap,
  ExternalLink,
  UserPlus,
  Code2,
  CircleDot,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import {
  getSession,
  getTunnelStatus,
  requestSession,
  startTunnel,
  stopTunnel,
  buildGuestLink,
  parseShareLink,
  copyToClipboard,
  isCollabAvailable,
} from '../services/collabService';

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const StepBadge = ({ n, done, active }) => (
  <span
    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-colors ${
      done
        ? 'bg-emerald-500 text-white'
        : active
          ? 'bg-blue-600 text-white'
          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
    }`}
  >
    {done ? <Check className="w-3.5 h-3.5" /> : n}
  </span>
);

const StatusDot = ({ state }) => {
  const color =
    state === 'live'
      ? 'bg-emerald-500'
      : state === 'starting'
        ? 'bg-amber-500 animate-pulse'
        : state === 'error'
          ? 'bg-red-500'
          : 'bg-slate-400';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
};

const Panel = ({ children, className = '' }) => (
  <div
    className={`rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur shadow-sm ${className}`}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const Collab = () => {
  const { showToast } = useToast();

  // Which side of the collaboration are we on?
  const [mode, setMode] = useState('host'); // host | join

  // Availability of the dev middleware (the tunnel + session endpoints).
  const [serviceReady, setServiceReady] = useState(null); // null = checking
  const [serviceNote, setServiceNote] = useState('');

  // Tunnel state.
  const [tunnel, setTunnel] = useState({ state: 'idle', publicUrl: null, error: null });
  const [tunnelBusy, setTunnelBusy] = useState(false);

  // Session state (owned by the Eric Collab extension inside code-server).
  const [session, setSession] = useState({
    active: false,
    roomId: '',
    role: '',
    signalingServer: '',
  });
  const [sessionBusy, setSessionBusy] = useState(false);

  // Join flow.
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');

  // Copy feedback.
  const [copied, setCopied] = useState('');

  // The room we generated in the browser, used when the extension has
  // not reported a room yet (so the share link is ready immediately).
  const localRoomRef = useRef('');

  // ---------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------

  const refresh = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([getTunnelStatus(), getSession()]);
      setTunnel(t);
      setSession(s);
      if (s.roomId) localRoomRef.current = s.roomId;
      return s;
    } catch {
      /* the dev middleware is gone — the availability probe handles it */
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isCollabAvailable();
      if (cancelled) return;
      setServiceReady(ok);
      if (!ok) {
        setServiceNote(
          'The collaboration service is not running. Start the project with `npm run run:project`, then reload this page.',
        );
        return;
      }
      await refresh();
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // Poll the tunnel + session every 3 s while the page is open so the
  // status lights and the peer list stay honest.
  useEffect(() => {
    if (serviceReady === false) return undefined;
    const id = setInterval(() => { refresh(); }, 3000);
    return () => clearInterval(id);
  }, [serviceReady, refresh]);

  // ---------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------

  const roomId = session.roomId || localRoomRef.current || '';
  const publicUrl = tunnel.publicUrl || '';
  const guestLink = useMemo(
    () => buildGuestLink({ publicUrl, room: roomId, signalingServer: session.signalingServer }),
    [publicUrl, roomId, session.signalingServer],
  );

  const tunnelLive = tunnel.state === 'live' && !!publicUrl;
  const sessionLive = session.active && !!roomId;

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    const result = await startTunnel();
    setTunnelBusy(false);
    if (result.ok) {
      setTunnel((prev) => ({ ...prev, ...result, state: 'live', publicUrl: result.publicUrl }));
      showToast('Public link is live — your friends can now open it.', 'success');
    } else {
      setTunnel((prev) => ({ ...prev, state: 'error', error: result.error }));
      showToast(result.error || 'Could not start the public link.', 'error');
    }
  };

  const handleStopTunnel = async () => {
    setTunnelBusy(true);
    await stopTunnel();
    setTunnelBusy(false);
    setTunnel((prev) => ({ ...prev, state: 'idle', publicUrl: null }));
    showToast('Public link closed.', 'info');
  };

  const handleStartSession = async () => {
    setSessionBusy(true);
    const result = await requestSession('start');
    setSessionBusy(false);
    if (result.ok) {
      showToast('Starting your session…', 'success');
      // Poll a few times so the room code appears as soon as the
      // extension has published it. We read the room code from the
      // value `refresh` returns, not from `session` — the React state
      // captured by this closure is stale until the next render, so
      // checking it here would always be empty and the loop would
      // always run to the end.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 700));
        const s = await refresh();
        if (s && s.roomId) break;
      }
    } else {
      showToast(result.error || 'Could not start the session.', 'error');
    }
  };

  const handleCopy = async (value, tag) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(tag);
      setTimeout(() => setCopied(''), 1800);
      showToast('Copied to clipboard.', 'success');
    } else {
      showToast('Copy failed — select the text and copy it manually.', 'warning');
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    setJoinError('');
    const parsed = parseShareLink(joinInput);
    if (!parsed) {
      setJoinError('That does not look like a share link or a room code. Expected something like ABCD-1234.');
      return;
    }
    const params = new URLSearchParams({ room: parsed.room });
    if (parsed.server) params.set('server', parsed.server);
    window.location.href = `/viewer?${params.toString()}`;
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  // ---- Service unavailable -------------------------------------------
  if (serviceReady === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <Panel className="max-w-lg w-full p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-4">
            <Plug className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Collaboration service is offline</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">{serviceNote}</p>
          <div className="mt-5 rounded-xl bg-slate-900 dark:bg-slate-950 p-3 text-left">
            <code className="text-[11px] text-emerald-300 font-mono">npm run run:project</code>
          </div>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Back to dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto">

        {/* ---------------- Header ---------------- */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Live Collaboration</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Share your code with anyone, on any device — they open a link, you see them appear.
            </p>
          </div>
        </div>

        {/* ---------------- Mode switch ---------------- */}
        <div className="inline-flex items-center p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 mb-6">
          {[
            { id: 'host', label: 'Share my code', Icon: Radio },
            { id: 'join', label: 'Join someone else', Icon: UserPlus },
          ].map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <opt.Icon className="w-4 h-4" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* ================================================================ */}
        {/* HOST MODE                                                       */}
        {/* ================================================================ */}
        {mode === 'host' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* ---- Steps column ---- */}
            <div className="lg:col-span-2 space-y-4">

              {/* Step 1 — session */}
              <Panel className="p-5">
                <div className="flex items-start gap-3">
                  <StepBadge n={1} done={sessionLive} active={!sessionLive} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Start a session
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      A session is a private room with a code. Anyone with the code and the
                      public link can join it.
                    </p>

                    {sessionLive ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                          <CircleDot className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Room code
                          </span>
                          <code className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                            {roomId}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(roomId, 'room')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          {copied === 'room' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied === 'room' ? 'Copied' : 'Copy code'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartSession}
                        disabled={sessionBusy}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        {sessionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                        {sessionBusy ? 'Starting…' : 'Start session'}
                      </button>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Step 2 — tunnel */}
              <Panel className="p-5">
                <div className="flex items-start gap-3">
                  <StepBadge n={2} done={tunnelLive} active={!tunnelLive && sessionLive} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Open a public link
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Cloudflare creates a temporary address that points at this app. Your
                      friend opens that address — no install, no account, works on a phone.
                    </p>

                    {tunnelLive ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            <StatusDot state="live" /> Live
                          </span>
                          <code className="text-[11px] font-mono text-slate-600 dark:text-slate-300 break-all">
                            {publicUrl}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={handleStopTunnel}
                          disabled={tunnelBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60"
                        >
                          {tunnelBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          Close public link
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <button
                          type="button"
                          onClick={handleStartTunnel}
                          disabled={tunnelBusy}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                        >
                          {tunnelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                          {tunnelBusy ? 'Opening…' : 'Open public link'}
                        </button>
                        {tunnel.error && (
                          <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
                            {tunnel.error}
                            {tunnel.installHint ? ` ${tunnel.installHint}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Step 3 — share */}
              <Panel className={`p-5 ${!guestLink ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <StepBadge n={3} done={!!guestLink} active={!!guestLink} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Send the link to your friend
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      One link is all they need. They can open it on a phone, tablet or a
                      different computer — the code updates live for everyone.
                    </p>

                    {guestLink ? (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                          <code className="text-[11px] font-mono text-slate-700 dark:text-slate-200 break-all">
                            {guestLink}
                          </code>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(guestLink, 'link')}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white shadow-md transition-all"
                          >
                            {copied === 'link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied === 'link' ? 'Copied!' : 'Copy link'}
                          </button>
                          <a
                            href={guestLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open it myself
                          </a>
                        </div>
                        <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-3">
                          <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-blue-800 dark:text-blue-200 leading-relaxed">
                            Send the link over WhatsApp, Discord or email. When your friend
                            opens it, they land on a page that connects them straight to
                            your room — there is nothing to download.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                        Complete steps 1 and 2 to generate a link you can share.
                      </p>
                    )}
                  </div>
                </div>
              </Panel>
            </div>

            {/* ---- Sidebar column ---- */}
            <div className="space-y-4">

              {/* Live status */}
              <Panel className="p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Status
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Session</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                      <StatusDot state={sessionLive ? 'live' : 'idle'} />
                      {sessionLive ? 'Running' : 'Not started'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Public link</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                      <StatusDot state={tunnel.state} />
                      {tunnelLive ? 'Live' : tunnel.state === 'starting' ? 'Opening…' : 'Closed'}
                    </span>
                  </div>
                  {roomId && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Room code</span>
                      <code className="font-mono font-bold text-slate-800 dark:text-slate-100">{roomId}</code>
                    </div>
                  )}
                </div>
              </Panel>

              {/* How it works */}
              <Panel className="p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> How it works
                </h3>
                <ol className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li className="flex gap-2">
                    <Monitor className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                    <span>You edit in <strong className="text-slate-800 dark:text-slate-100">code-server</strong>. The Eric Collab panel mirrors what you type.</span>
                  </li>
                  <li className="flex gap-2">
                    <PlugZap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                    <span>Cloudflare forwards your room to a public address.</span>
                  </li>
                  <li className="flex gap-2">
                    <Smartphone className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                    <span>Your friend opens the link in any browser and joins instantly.</span>
                  </li>
                  <li className="flex gap-2">
                    <Keyboard className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                    <span>You can promote them from viewer to editor from the panel.</span>
                  </li>
                </ol>
              </Panel>

              {/* Privacy note */}
              <Panel className="p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Who can see this?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Only people who have the link. The address is temporary and stops working
                  the moment you close the public link. Your code is never uploaded to a
                  server we control.
                </p>
              </Panel>

              {/* Pro tip */}
              <Panel className="p-4 bg-gradient-to-br from-violet-50 to-cyan-50 dark:from-violet-500/10 dark:to-cyan-500/10 border-violet-200 dark:border-violet-500/30">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-600" /> Tip
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Open your own link in a private window first. It is the fastest way to
                  confirm everything works before you send it out.
                </p>
              </Panel>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* JOIN MODE                                                        */}
        {/* ================================================================ */}
        {mode === 'join' && (
          <div className="max-w-xl">
            <Panel className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4">
                <UserPlus className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Join a shared session
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                Paste the link your host sent you, or type the 8-character room code. If
                you opened a link already, you are in the right place.
              </p>

              <form onSubmit={handleJoin} className="mt-5 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Share link or room code
                  </span>
                  <input
                    value={joinInput}
                    onChange={(e) => { setJoinInput(e.target.value); setJoinError(''); }}
                    placeholder="https://…trycloudflare.com/viewer?room=ABCD-1234&server=…"
                    className="mt-1.5 w-full px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                  />
                </label>

                {joinError && (
                  <p className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 leading-relaxed">
                    <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {joinError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-md transition-all"
                >
                  <ArrowRight className="w-4 h-4" />
                  Join session
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-2">
                  <QrCode className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  On a phone? Just ask your host to send the link — it opens straight in
                  your browser with the room filled in.
                </p>
              </div>
            </Panel>
          </div>
        )}

        <PageTip
          pageId="collab"
          variant="info"
          title="Your code stays on your machine"
          body="The public link is a temporary tunnel created by Cloudflare that points at this app. Close it when you are done and the address stops working immediately."
        />
      </div>
    </div>
  );
};

export default Collab;
