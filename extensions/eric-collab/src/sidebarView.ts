// sidebarView.ts
// Renders the "Eric Collab" panel that appears when the user clicks the
// activity bar icon. The view is a `webview` view — a small HTML page
// hosted inside the VS Code panel. The view talks to the extension host
// via `vscode.postMessage` ↔ `webview.onDidReceiveMessage`.
//
// What the panel shows
// --------------------
//  • When idle: two big "Start new session" and "Join session" buttons,
//    plus a small "how it works" explainer.
//  • When a session is active: room code, signaling server, public tunnel
//    status + URL, list of connected users with role badges, and the
//    management actions (copy invite, restart tunnel, force resync,
//    share file, end session).
//  • For the host: per-user "..." menu with Make editor / Make viewer /
//    Kick options.
//  • For viewers: a banner explaining the read-only state.

import * as vscode from 'vscode';
import type { CollabClient, ConnStep } from './collabClient';
import type { CollabPermission, CollabState, UserPresence } from './types';
import type { TunnelInfo } from './tunnelManager';
import { readSessionState } from './sessionState';

export interface SidebarViewState {
  sessionActive: boolean;
  collabState: CollabState;
  roomId: string;
  signalingServer: string;
  publicUrl: string | null;
  liteViewerUrl: string | null;
  tunnelState: string;
  tunnelError?: string;
  connDetail: string;        // last WebSocket event ("WebSocket: open", "WebSocket closed (1006)…")
  connSteps: ConnStep[];     // ordered list of connection-handshake steps
  elapsedMs: number;         // ms since the current connect() started
  users: UserPresence[];
  permissions: Map<string, CollabPermission>;
  isHost: boolean;
  localUserId: string;
  localPermission: CollabPermission;
}

const NO_STATE: SidebarViewState = {
  sessionActive: false,
  collabState: 'idle',
  roomId: '',
  signalingServer: '',
  publicUrl: null,
  liteViewerUrl: null,
  tunnelState: 'idle',
  connDetail: '',
  connSteps: [],
  elapsedMs: 0,
  users: [],
  permissions: new Map(),
  isHost: false,
  localUserId: '',
  localPermission: 'viewer',
};

export class EricCollabViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'ericCollab.view';

  private _view?: vscode.WebviewView;
  private _state: SidebarViewState = NO_STATE;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts and the inline CSS we use.
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg?.command) {
        case 'start':
          await vscode.commands.executeCommand('ericCollab.start');
          break;
        case 'join':
          await vscode.commands.executeCommand('ericCollab.join');
          break;
        case 'copyInvite':
          await vscode.commands.executeCommand('ericCollab.copyInvite');
          break;
        case 'copyTunnelUrl':
          await vscode.commands.executeCommand('ericCollab.copyTunnelUrl');
          break;
        case 'copyLiteViewerUrl':
          await vscode.commands.executeCommand('ericCollab.copyLiteViewerUrl');
          break;
        case 'openLiteViewer':
          await vscode.commands.executeCommand('ericCollab.openLiteViewer');
          break;
        case 'restartTunnel':
          await vscode.commands.executeCommand('ericCollab.restartTunnel');
          break;
        case 'leave':
          await vscode.commands.executeCommand('ericCollab.leave');
          break;
        case 'forceResync':
          await vscode.commands.executeCommand('ericCollab.forceResync');
          break;
        case 'shareFile':
          await vscode.commands.executeCommand('ericCollab.shareCurrentFile');
          break;
        case 'rename':
          await vscode.commands.executeCommand('ericCollab.rename');
          break;
        case 'setPermission':
          // msg.userId + msg.permission
          await vscode.commands.executeCommand(
            'ericCollab.setUserPermission',
            msg.userId,
            msg.permission
          );
          break;
        case 'kickUser':
          await vscode.commands.executeCommand(
            'ericCollab.kickUser',
            msg.userId
          );
          break;
        case 'reconnectNow':
          await vscode.commands.executeCommand('ericCollab.reconnectNow');
          break;
        case 'openDocs':
          await vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/localtunnel/localtunnel')
          );
          break;
      }
    });

    // Push the current state into the view as soon as it's resolved.
    this._pushUpdate();
  }

  /** Push a state snapshot into the view. */
  update(s: SidebarViewState): void {
    this._state = s;
    this._pushUpdate();
  }

  /** Wire the provider up to a CollabClient + tunnel so it auto-updates. */
  bind(client: CollabClient | null, tunnel: {
    on(listener: (info: TunnelInfo) => void): () => void;
    getState(): string;
    getPublicUrl(): string | null;
    getInfo(): TunnelInfo | null;
  }, localUserId: string, signalingServer: string): void {
    // Wipe previous listeners if re-binding.
    while (this._disposables.length) {
      const d = this._disposables.pop();
      try { d?.dispose(); } catch { /* noop */ }
    }

    const collect = () => {
      const tunnelInfo = tunnel.getInfo();
      // Build the Lite Viewer URL from the current room + signaling
      // server, so it always matches the active session. When the base
      // URL is the dashboard's Cloudflare tunnel, the realtime channel
      // lives on the same public origin under `/collab-ws` — that is
      // what makes a single link work on a phone.
      const liteViewerUrl: string | null = (() => {
        try {
          const cfg = vscode.workspace.getConfiguration('ericCollab');
          const configured = (cfg.get<string>('liteViewerUrl') || '').trim();
          let base = configured.replace(/\/$/, '');
          let server = client?.signalingServer || '';
          if (!base) {
            const shared = readSessionState();
            if (shared.publicUrl) {
              base = String(shared.publicUrl).replace(/\/$/, '');
              server = `${base.replace(/^http/, 'ws')}/collab-ws`;
            }
          }
          if (!base || !client) return null;
          const params = new URLSearchParams({
            room: client.roomId,
            server: server || `${base.replace(/^http/, 'ws')}/collab-ws`,
          });
          return `${base}/viewer?${params.toString()}`;
        } catch {
          return null;
        }
      })();
      this.update({
        sessionActive: !!client && client.state !== 'idle',
        collabState: client?.state ?? 'idle',
        roomId: client?.roomId ?? '',
        signalingServer: client?.signalingServer || signalingServer,
        publicUrl: client?.publicOrigin ?? tunnel.getPublicUrl() ?? null,
        liteViewerUrl,
        tunnelState: tunnel.getState(),
        tunnelError: tunnelInfo?.errorMessage,
        connDetail: client?.lastConnDetail ?? '',
        connSteps: client?.connSteps ?? [],
        elapsedMs: client?.getElapsedMs() ?? 0,
        users: [],
        permissions: new Map(),
        isHost: client?.isHost() ?? false,
        localUserId,
        localPermission: client?.getLocalPermission() ?? 'viewer',
      });
    };

    if (client) {
      // EventEmitter#on returns `this`, not a Disposable. Track the
      // listener reference and unregister it on dispose via removeListener.
      const stateListener = () => collect();
      const presenceListener = (users: UserPresence[]) => {
        this.update({ ...this._state, users });
      };
      (client as unknown as {
        on(event: string, listener: (...args: any[]) => void): unknown;
        removeListener(event: string, listener: (...args: any[]) => void): unknown;
      }).on('stateChange', stateListener as any);
      (client as unknown as {
        on(event: string, listener: (...args: any[]) => void): unknown;
      }).on('presenceChange', presenceListener as any);
      this._disposables.push(
        new vscode.Disposable(() => {
          (client as unknown as {
            removeListener(event: string, listener: (...args: any[]) => void): unknown;
          }).removeListener('stateChange', stateListener as any);
          (client as unknown as {
            removeListener(event: string, listener: (...args: any[]) => void): unknown;
          }).removeListener('presenceChange', presenceListener as any);
        })
      );
    }
    const tunnelUnsub = tunnel.on(collect);
    this._disposables.push(new vscode.Disposable(() => tunnelUnsub()));
    collect();
  }

  private _pushUpdate(): void {
    if (!this._view) return;
    // postMessage can't send a Map — convert permissions to a plain
    // object before serialising.
    const permsObj: Record<string, string> = {};
    if (this._state.permissions) {
      for (const [k, v] of this._state.permissions.entries()) {
        permsObj[k] = v;
      }
    }
    void this._view.webview.postMessage({
      type: 'state',
      payload: { ...this._state, permissions: permsObj },
    });
  }

  // -----------------------------------------------------------------
  // HTML rendering
  // -----------------------------------------------------------------

  private _renderHtml(webview: vscode.Webview): string {
    // The webview must be CSP-safe; we use only inline styles + a small
    // postMessage script. No external resources.
    const nonce = String(Math.random()).slice(2);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Eric Collab</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-sideBar-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --accent-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --error: var(--vscode-errorForeground);
      --ok: var(--vscode-testing-iconPassed, #4ec9b0);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      font-size: 13px;
      line-height: 1.45;
    }
    .wrap { padding: 16px 16px 24px; }
    h1 {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 12px 0;
      display: flex; align-items: center; gap: 8px;
    }
    .icon { width: 18px; height: 18px; flex: 0 0 18px; }
    .led {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--muted);
      display: inline-block;
      box-shadow: 0 0 0 0 transparent;
      transition: background 120ms ease, box-shadow 120ms ease;
    }
    .led.live { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
    .led.connecting { background: #c8a020; }
    .led.error { background: var(--error); }
    .led.tunnel { background: #4aa3ff; }

    p.muted { color: var(--muted); margin: 0 0 16px 0; }
    .row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .kv {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 8px; border-radius: 4px;
      background: rgba(127,127,127,0.06);
    }
    .kv .k { color: var(--muted); }
    .kv .v { font-family: var(--vscode-editor-font-family, monospace); }

    button {
      appearance: none;
      width: 100%;
      padding: 8px 12px;
      background: var(--accent);
      color: var(--accent-fg);
      border: 1px solid transparent;
      border-radius: 4px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background 80ms ease;
    }
    button:hover { background: var(--accent-hover); }
    button.secondary {
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--input-border);
    }
    button.secondary:hover {
      background: rgba(127,127,127,0.08);
    }
    button.danger {
      background: transparent;
      color: var(--error);
      border: 1px solid var(--error);
    }
    button.danger:hover {
      background: rgba(255, 80, 80, 0.12);
    }
    .btn-row { display: flex; gap: 8px; }
    .btn-row > button { flex: 1; }

    .input {
      width: 100%;
      padding: 6px 8px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      font: inherit;
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .users { list-style: none; margin: 0; padding: 0; }
    .users li {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 0;
    }
    .dot {
      width: 10px; height: 10px; border-radius: 50%;
      display: inline-block; flex: 0 0 10px;
    }
    .name { flex: 1; }
    .file { color: var(--muted); font-size: 11px; }
    .pill {
      display: inline-block;
      padding: 1px 6px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      border-radius: 8px;
      font-size: 11px;
    }
    .url {
      word-break: break-all;
      background: rgba(127,127,127,0.08);
      padding: 8px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    hr {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 16px 0;
    }
    .toast {
      position: fixed; left: 16px; right: 16px; bottom: 16px;
      padding: 8px 12px; border-radius: 4px;
      background: var(--accent); color: var(--accent-fg);
      opacity: 0; transform: translateY(8px);
      transition: opacity 160ms ease, transform 160ms ease;
      pointer-events: none;
      text-align: center;
      font-size: 12px;
    }
    .toast.show { opacity: 1; transform: translateY(0); }

    /* ---------- role badges ---------- */
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      line-height: 14px;
    }
    .badge.master  { background: linear-gradient(135deg, #6b46c1, #8b5cf6); color: #fff; box-shadow: 0 0 0 1px rgba(107,70,193,0.25); }
    .badge.editor  { background: #1f8f5e; color: #fff; }
    .badge.viewer  { background: rgba(127,127,127,0.25); color: var(--muted); }

    /* ---------- viewer banner ---------- */
    .banner {
      background: rgba(214, 143, 0, 0.12);
      border-left: 3px solid #d68f00;
      color: var(--fg);
      padding: 8px 10px;
      border-radius: 4px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .banner.host {
      background: rgba(107, 70, 193, 0.12);
      border-left-color: #6b46c1;
    }
    .banner .b-title { font-weight: 600; margin-bottom: 2px; }
    .banner .b-sub { color: var(--muted); }

    /* ---------- per-user menu ---------- */
    .users { position: relative; }
    .users li { position: relative; }
    .users li .right {
      display: flex; align-items: center; gap: 4px; margin-left: auto;
    }
    .user-menu-btn {
      appearance: none;
      width: 22px; height: 22px;
      padding: 0;
      background: transparent;
      color: var(--muted);
      border: none;
      border-radius: 4px;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .user-menu-btn:hover { background: rgba(127,127,127,0.18); color: var(--fg); }
    .user-menu {
      position: absolute;
      top: 24px; right: 0;
      z-index: 50;
      min-width: 180px;
      background: var(--vscode-menu-background, var(--bg));
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px;
      display: flex; flex-direction: column;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
    }
    .user-menu[hidden] { display: none; }
    .user-menu button {
      width: 100%;
      padding: 6px 10px;
      background: transparent;
      color: var(--fg);
      border: none;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 400;
      text-align: left;
      justify-content: flex-start;
    }
    .user-menu button:hover { background: var(--accent); color: var(--accent-fg); }
    .user-menu button.danger-item { color: var(--error); }
    .user-menu button.danger-item:hover { background: var(--error); color: #fff; }
    .user-menu .sep {
      height: 1px;
      background: var(--border);
      margin: 4px 2px;
    }
    .user-menu .label {
      padding: 4px 10px;
      color: var(--muted);
      font-size: 11px;
    }

    /* ---------- step list ---------- */
    .steps {
      list-style: none; margin: 8px 0 0; padding: 0;
      display: flex; flex-direction: column; gap: 4px;
      font-size: 12px;
    }
    .steps li {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(127,127,127,0.04);
    }
    .steps li.pending { color: var(--muted); opacity: 0.7; }
    .steps li.active  { background: rgba(200, 160, 32, 0.10); color: var(--fg); }
    .steps li.ok      { color: var(--fg); }
    .steps li.error   { background: rgba(255, 80, 80, 0.10); color: var(--error); }
    .step-icon {
      width: 14px; height: 14px;
      display: inline-flex; align-items: center; justify-content: center;
      flex: 0 0 14px;
    }
    .step-icon .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--muted);
    }
    .steps li.active .step-icon .dot { background: #c8a020; animation: pulse 1.2s ease-in-out infinite; }
    .steps li.ok .step-icon .dot { background: var(--ok); }
    .steps li.error .step-icon .dot { background: var(--error); }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .step-label { flex: 1; }
    .step-detail {
      color: var(--muted);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10px;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ---------- elapsed chip ---------- */
    .elapsed {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 8px;
      background: rgba(127,127,127,0.10);
      color: var(--muted);
    }
    .elapsed.warn { background: rgba(255, 165, 0, 0.16); color: #c87a00; }
    .elapsed.bad  { background: rgba(255, 80, 80, 0.16);  color: var(--error); }
  </style>
</head>
<body>
  <div class="wrap" id="root">
    <!-- content rendered by script -->
  </div>
  <div id="toast" class="toast"></div>
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const root = document.getElementById('root');
      const toast = document.getElementById('toast');

      function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
      }

      function ledClassFor(state) {
        if (state === 'connected') return 'led live';
        if (state === 'connecting' || state === 'reconnecting') return 'led connecting';
        if (state === 'error') return 'led error';
        return 'led';
      }

      function tunnelLedClass(state) {
        if (state === 'live') return 'led tunnel';
        if (state === 'starting' || state === 'reconnecting') return 'led connecting';
        if (state === 'error') return 'led error';
        return 'led';
      }

      function tunnelLabel(state) {
        switch (state) {
          case 'live': return 'Public tunnel: live';
          case 'starting': return 'Public tunnel: starting…';
          case 'reconnecting': return 'Public tunnel: reconnecting…';
          case 'error': return 'Public tunnel: error';
          default: return 'Public tunnel: off';
        }
      }

      function renderIdle() {
        root.innerHTML = \`
          <h1><span class="led"></span> Eric Collab</h1>
          <p class="muted">
            No active session. Start a new room to invite collaborators over
            the internet, or join an existing one with a room code or invite link.
          </p>
          <div class="row">
            <button data-cmd="start">$(broadcast) Start new session</button>
            <button class="secondary" data-cmd="join">$(sign-in) Join session</button>
          </div>
          <hr />
          <p class="muted">
            When the host starts a session, the extension opens a public tunnel
            and copies an invite link. Document edits and cursor presence sync
            over the public Yjs signaling server.
          </p>
        \`;
      }

      function renderActive(state) {
        const users = state.users || [];
        const isHost = !!state.isHost;
        const isViewer = state.localPermission === 'viewer';
        const perms = state.permissions || {};

        const userList = users.length === 0
          ? '<p class="muted" style="margin: 8px 0 0">No remote users yet — share the invite link.</p>'
          : '<ul class="users">' + users.map(u => {
              const perm = (perms && perms[u.userId]) || u.permission || 'viewer';
              const badge = '<span class="badge ' + escapeAttr(perm) + '">' + escapeText(perm) + '</span>';
              const youLabel = u.userId === state.localUserId ? ' (you)' : '';
              const fileTag = u.filePath
                ? '<span class="file">' + escapeText(shortenPath(u.filePath)) + '</span>'
                : '';
              // Host can manage everyone except themselves; the host's
              // own row still shows the menu but the actions are hidden
              // by the extension-side guard.
              const menuId = 'um-' + (u.userId || 'x').replace(/[^a-z0-9_-]/gi, '');
              const menu = isHost && u.userId !== state.localUserId
                ? \`<div class="right">
                     \${badge}
                     <button class="user-menu-btn" data-menu-toggle="\${escapeAttr(menuId)}" title="Manage \${escapeAttr(u.name || 'user')}">⋮</button>
                   </div>
                   <div class="user-menu" data-menu="\${escapeAttr(menuId)}" hidden>
                     <div class="label">\${escapeText(u.name || 'User')}</div>
                     <div class="sep"></div>
                     <button data-cmd="setPermission" data-user-id="\${escapeAttr(u.userId || '')}" data-permission="editor">\${perm === 'editor' ? '✓ ' : ''}Make editor</button>
                     <button data-cmd="setPermission" data-user-id="\${escapeAttr(u.userId || '')}" data-permission="viewer">\${perm === 'viewer' ? '✓ ' : ''}Make viewer</button>
                     <div class="sep"></div>
                     <button class="danger-item" data-cmd="kickUser" data-user-id="\${escapeAttr(u.userId || '')}">Remove from room</button>
                   </div>\`
                : \`<div class="right">\${badge}</div>\`;
              return \`<li>
                <span class="dot" style="background:\${escapeAttr(u.color || '#888')}"></span>
                <span class="name">\${escapeText(u.name || 'Anonymous')}\${escapeText(youLabel)}</span>
                \${fileTag}
                \${menu}
              </li>\`;
            }).join('') + '</ul>';

        const liteViewerSection = state.liteViewerUrl
          ? \`<div class="kv" style="display: block; padding: 8px 10px; border-left: 2px solid var(--accent); margin-top: 4px;">
               <div class="k" style="font-weight: 600; margin-bottom: 4px;">$(zap) Lite Viewer (no tunnel)</div>
               <div class="v" style="font-size: 11px; word-break: break-all;">\${escapeText(state.liteViewerUrl)}</div>
               <div class="btn-row" style="margin-top: 6px;">
                 <button data-cmd="openLiteViewer">\$(zap) Open</button>
                 <button class="secondary" data-cmd="copyLiteViewerUrl">\$(clippy) Copy</button>
               </div>
               <p class="muted" style="margin: 4px 0 0; font-size: 10px;">Open this on any browser. Connects directly to the signaling server — works even when the tunnel returns 502.</p>
             </div>\`
          : '';

        const tunnelSection = state.publicUrl
          ? \`            <div class="row">
              <div class="kv"><span class="k">Tunnel</span><span class="v"><span class="led \${tunnelLedClass(state.tunnelState).replace('led ','')}"></span> \${escapeText(tunnelLabel(state.tunnelState).replace('Public tunnel: ',''))}</span></div>
              <div class="url" id="inviteUrl">\${escapeText(state.publicUrl)}</div>
              <div class="btn-row">
                <button data-cmd="copyInvite">$(clippy) Copy invite</button>
                <button class="secondary" data-cmd="copyTunnelUrl">$(globe) Copy URL</button>
              </div>
              \${liteViewerSection}
            </div>
          \`
          : \`
            <div class="row">
              <div class="kv"><span class="k">Tunnel</span><span class="v"><span class="led"></span> \${escapeText(tunnelLabel(state.tunnelState))}\${state.tunnelError ? ' — ' + escapeText(state.tunnelError) : ''}</span></div>
              <div class="btn-row">
                <button data-cmd="restartTunnel">\$(refresh) Open public tunnel</button>
              </div>
              <p class="muted" style="margin: 4px 0 0">Without a public tunnel, only guests on the same network as you can join via the local code-server URL.</p>
              \${liteViewerSection}
            </div>
          \`;

        // Connection diagnostics — show the full handshake step list so
        // the user can see *which* step is currently active instead of
        // staring at a bare "Connecting…" spinner. An elapsed timer at
        // the top warns when we've been stuck more than a few seconds.
        const allOk = (state.connSteps || []).every((s) => s.status === 'ok' || s.status === 'pending');
        const elapsedSec = Math.floor((state.elapsedMs || 0) / 1000);
        const elapsedCls = elapsedSec > 15 ? 'bad' : elapsedSec > 5 ? 'warn' : '';
        const connBlock = \`<div class="kv" style="display: block; padding: 8px 10px;">
               <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                 <span class="k" style="font-weight: 600">Connection</span>
                 <span class="elapsed \${elapsedCls}">\${elapsedSec}s</span>
               </div>
               <div class="v" style="font-size: 11px; word-break: break-all; margin: 4px 0;">\${escapeText(shortenUrl(state.signalingServer))}</div>
               \${(state.connSteps && state.connSteps.length)
                 ? \`<ul class="steps">
                     \${state.connSteps.map(s => \`<li class="\${escapeAttr(s.status)}">
                       <span class="step-icon"><span class="dot"></span></span>
                       <span class="step-label">\${escapeText(s.label)}</span>
                       \${s.detail ? \`<span class="step-detail" title="\${escapeAttr(s.detail)}">\${escapeText(shortenUrl(s.detail))}</span>\` : ''}
                     </li>\`).join('')}
                   </ul>\`
                 : (state.connDetail ? \`<div class="v" style="font-size: 10px; color: var(--muted); margin-top: 4px; word-break: break-all;">\${escapeText(state.connDetail)}</div>\` : '')}
               \${state.collabState !== 'connected' && allOk === false
                 ? \`<button class="secondary" data-cmd="reconnectNow" style="margin-top: 6px; width: 100%;">\$(refresh) Reconnect now</button>\`
                 : (state.collabState !== 'connected'
                         ? \`<button class="secondary" data-cmd="reconnectNow" style="margin-top: 6px; width: 100%;">\$(refresh) Reconnect now</button>\`
                         : '')}
             </div>\`;

        // Role banner — different copy for master vs. viewer vs. editor.
        const banner = isHost
          ? \`<div class="banner host">
               <div class="b-title">You are the master</div>
               <div class="b-sub">You can edit files, change every guest's permission, and remove them from the room. Use the ⋮ menu next to a user.</div>
             </div>\`
          : isViewer
            ? \`<div class="banner">
                 <div class="b-title">You joined as a viewer</div>
                 <div class="b-sub">Your edits will be reverted. Ask the master to grant you editor access to make changes.</div>
               </div>\`
            : \`<div class="banner">
                 <div class="b-title">You joined as an editor</div>
                 <div class="b-sub">You can edit shared documents. Changes sync to all peers in real time.</div>
               </div>\`;

        root.innerHTML = \`
          <h1><span class="led \${ledClassFor(state.collabState).replace('led ','')}"></span> Eric Collab · live</h1>
          \${banner}
          <div class="row">
            <div class="kv"><span class="k">Room</span><span class="v">\${escapeText(state.roomId || '—')}</span></div>
            <div class="kv"><span class="k">Users</span><span class="v"><span class="pill">\${users.length}</span></span></div>
            <div class="kv"><span class="k">Your role</span><span class="v"><span class="badge \${escapeAttr(state.localPermission || 'viewer')}">\${escapeText(state.localPermission || 'viewer')}</span></span></div>
          </div>
          \${connBlock}
          \${tunnelSection}
          <div class="row">
            <p class="muted" style="margin: 0 0 6px">Connected</p>
            \${userList}
          </div>
          <hr />
          <div class="row">
            <div class="btn-row">
              <button class="secondary" data-cmd="forceResync" title="Rebind all open files — recovery for missed updates">$(sync) Resync files</button>
              <button class="secondary" data-cmd="shareFile" title="Push the active file to all peers">$(share) Share file</button>
            </div>
            <div class="btn-row">
              <button class="secondary" data-cmd="rename">$(rename) Change my name</button>
            </div>
            <button class="danger" data-cmd="leave">$(debug-disconnect) End session</button>
          </div>
        \`;
      }

      function escapeText(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      function escapeAttr(s) { return escapeText(s).replace(/"/g, '&quot;'); }
      function shortenPath(p) {
        if (!p) return '';
        const parts = p.replace(/\\\\/g, '/').split('/');
        return parts.length <= 2 ? p : '…/' + parts.slice(-2).join('/');
      }
      function shortenUrl(u) {
        if (!u) return '';
        return u.length > 36 ? u.slice(0, 33) + '…' : u;
      }

      // Replace the $(name) placeholders in the HTML with codicon markup.
      function codify() {
        root.querySelectorAll('button[data-cmd]').forEach(btn => {
          const raw = btn.innerHTML;
          btn.innerHTML = raw.replace(/\\$\\(([a-z-]+)\\)/g, (m, name) => {
            return '<span class="codicon codicon-' + name + '"></span>';
          });
        });
      }

      // Event delegation
      document.addEventListener('click', (e) => {
        // 1) Per-user "..." menu toggle.
        const toggle = e.target.closest('[data-menu-toggle]');
        if (toggle) {
          e.stopPropagation();
          const menuId = toggle.getAttribute('data-menu-toggle');
          document.querySelectorAll('.user-menu').forEach((m) => {
            if (m.getAttribute('data-menu') !== menuId) m.hidden = true;
          });
          const menu = document.querySelector('[data-menu="' + menuId + '"]');
          if (menu) {
            menu.hidden = !menu.hidden;
            // Position the menu next to the toggle button.
            if (!menu.hidden) {
              const rect = toggle.getBoundingClientRect();
              const menuWidth = menu.offsetWidth || 180;
              let right = Math.max(8, window.innerWidth - rect.right);
              if (right + menuWidth > window.innerWidth - 8) {
                right = window.innerWidth - menuWidth - 8;
              }
              menu.style.right = right + 'px';
              menu.style.top = (rect.bottom + 4) + 'px';
            }
          }
          return;
        }
        // 2) Click anywhere else → close any open menu.
        if (!e.target.closest('.user-menu')) {
          document.querySelectorAll('.user-menu').forEach((m) => (m.hidden = true));
        }
        // 3) Command button → post a message to the extension host.
        const btn = e.target.closest('button[data-cmd]');
        if (!btn) return;
        const cmd = btn.getAttribute('data-cmd');
        const userId = btn.getAttribute('data-user-id') || undefined;
        const permission = btn.getAttribute('data-permission') || undefined;
        vscode.postMessage({
          command: cmd,
          userId,
          permission,
        });
        // Close the menu after a selection.
        document.querySelectorAll('.user-menu').forEach((m) => (m.hidden = true));
        showToast('Sending: ' + cmd + (userId ? ' · ' + userId : ''));
      });

      // Incoming state from the extension host
      window.addEventListener('message', (e) => {
        const msg = e.data;
        if (msg && msg.type === 'state' && msg.payload) {
          if (msg.payload.sessionActive) renderActive(msg.payload);
          else renderIdle();
          codify();
        }
      });

      // Initial paint
      renderIdle();
      codify();
    })();
  </script>
</body>
</html>`;
  }
}
