// extension.ts
// Entry point for the Eric Collab code-server extension.
// Provides commands to start/join/leave real-time collaborative sessions,
// a status bar to track state, and a sidebar panel with user/permission
// management.
//
// Internet collaboration
// ----------------------
// When the host starts a session, this extension opens a public tunnel
// (localtunnel) that forwards a public subdomain to the host's local
// code-server port. The invite link embeds that public URL so guests on
// the internet can reach the host's code-server UI. The actual document
// CRDT sync is then negotiated through the configured public Yjs
// signaling server (e.g. wss://demos.yjs.dev/ws).

import * as vscode from 'vscode';
import { CollabClient } from './collabClient';
import { CollabStatusBar } from './statusBar';
import {
  buildInviteUrl,
  generateRoomId,
  makeRoomInfo,
  parseInviteLink,
} from './roomManager';
import { TunnelManager, TunnelState, TunnelInfo } from './tunnelManager';
import { ensureLocalUser, type LocalUserContext } from './userPresence';
import {
  readSessionState,
  writeSessionState,
  clearSessionState,
  consumeStartRequest,
} from './sessionState';
import { EricCollabViewProvider, type SidebarViewState } from './sidebarView';
import type { CollabPermission, UserPresence } from './types';

let client: CollabClient | null = null;
let statusBar: CollabStatusBar | null = null;
let localUser: LocalUserContext | null = null;
let outputChannel: vscode.OutputChannel | null = null;
let sidebarProvider: EricCollabViewProvider | null = null;
let globalState: vscode.Memento | null = null;
const tunnel = new TunnelManager();
let tunnelListenerDispose: (() => void) | null = null;
let currentUsers: UserPresence[] = [];
let currentPermissions: Map<string, CollabPermission> = new Map();

// Memento key for the session we want to survive a code-server refresh.
// Stored as `{ roomId, signalingServer, publicOrigin }`. When the host
// reloads code-server, the extension re-opens the same room on the
// same localtunnel subdomain so any guest that already opened the
// invite link in incognito continues to land on the host's code-server
// instead of a 502 from loca.lt.
const SESSION_KEY = 'ericCollab.activeSession';
interface PersistedSession {
  roomId: string;
  signalingServer: string;
  publicOrigin?: string;
  role: 'host' | 'guest';
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Eric Collab');
  outputChannel.appendLine('[Eric Collab] activating…');

  localUser = await ensureLocalUser(context.globalState);
  globalState = context.globalState;
  statusBar = new CollabStatusBar(() => showSessionMenu());

  // ---- Sidebar view (activity bar icon + panel) --------------------------
  sidebarProvider = new EricCollabViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      EricCollabViewProvider.viewId,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
  const cmdOpenActivityBar = vscode.commands.registerCommand(
    'ericCollab.openActivityBar',
    async () => {
      await vscode.commands.executeCommand('workbench.view.extension.ericCollab');
    }
  );
  context.subscriptions.push(cmdOpenActivityBar);

  // ---- Commands -----------------------------------------------------------

  const cmdStart = vscode.commands.registerCommand('ericCollab.start', async () => {
    await startSession();
  });
  const cmdJoin = vscode.commands.registerCommand('ericCollab.join', async () => {
    await joinSessionPrompt();
  });
  const cmdLeave = vscode.commands.registerCommand('ericCollab.leave', async () => {
    leaveSession();
  });
  const cmdCopy = vscode.commands.registerCommand('ericCollab.copyInvite', async () => {
    if (!client || client.state === 'idle') {
      vscode.window.showInformationMessage(
        'No active session. Start or join one first.'
      );
      return;
    }
    await copyInvite();
  });
  const cmdPanel = vscode.commands.registerCommand('ericCollab.openPanel', async () => {
    await showSessionMenu();
  });
  const cmdCopyTunnel = vscode.commands.registerCommand(
    'ericCollab.copyTunnelUrl',
    async () => {
      const url = tunnel.getPublicUrl();
      if (!url) {
        vscode.window.showInformationMessage(
          'No public tunnel is active. Start a session first.'
        );
        return;
      }
      await vscode.env.clipboard.writeText(url);
      vscode.window.showInformationMessage(`Public tunnel URL copied: ${url}`);
    }
  );
  const cmdRestartTunnel = vscode.commands.registerCommand(
    'ericCollab.restartTunnel',
    async () => {
      if (client) {
        await reestablishTunnel();
      } else {
        vscode.window.showInformationMessage(
          'No active session. Start a session to create a tunnel.'
        );
      }
    }
  );

  // New commands — recovery actions for the "I have to refresh to see
  // changes" issue, plus host-only user management.
  const cmdForceResync = vscode.commands.registerCommand(
    'ericCollab.forceResync',
    async () => {
      if (!client || client.state === 'idle') {
        vscode.window.showInformationMessage(
          'No active session to resync.'
        );
        return;
      }
      client.forceResync();
      vscode.window.setStatusBarMessage(
        'Eric Collab: re-bound all open documents',
        3000
      );
    }
  );

  // One-click recovery from a stuck WebSocket. The y-websocket client
  // retries on its own, but when the signaling server is down for a
  // while it can give up and the user is left staring at "Connecting…".
  // This tears down the current provider and creates a fresh one.
  const cmdReconnectNow = vscode.commands.registerCommand(
    'ericCollab.reconnectNow',
    async () => {
      if (!client || client.state === 'idle') {
        vscode.window.showInformationMessage(
          'No active session to reconnect.'
        );
        return;
      }
      client.reconnectNow();
      vscode.window.setStatusBarMessage(
        'Eric Collab: reconnecting…',
        3000
      );
    }
  );
  context.subscriptions.push(cmdReconnectNow);
  const cmdShareFile = vscode.commands.registerCommand(
    'ericCollab.shareCurrentFile',
    async () => {
      if (!client || client.state === 'idle') {
        vscode.window.showInformationMessage(
          'No active session. Start or join one first.'
        );
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          'Open a file in the editor to share it.'
        );
        return;
      }
      client.shareCurrentDocument(editor.document);
      vscode.window.setStatusBarMessage(
        `Eric Collab: shared ${editor.document.fileName} with the room`,
        3000
      );
    }
  );
  const cmdSetPermission = vscode.commands.registerCommand(
    'ericCollab.setUserPermission',
    async (userId?: string, permission?: CollabPermission) => {
      if (!client || client.state === 'idle') return;
      if (!userId) {
        vscode.window.showWarningMessage('No user specified.');
        return;
      }
      if (permission) {
        await client.setUserPermission(userId, permission);
        return;
      }
      // Show a quick pick if no permission was passed (e.g. from the
      // sidebar "..." menu).
      const choices: { label: string; description: string; permission: CollabPermission }[] = [
        {
          label: '$(edit) Make editor',
          description: 'Allow this user to edit shared documents',
          permission: 'editor',
        },
        {
          label: '$(eye) Make viewer',
          description: 'Read-only access',
          permission: 'viewer',
        },
      ];
      const picked = await vscode.window.showQuickPick(choices, {
        title: 'Set user permission',
      });
      if (picked) {
        await client.setUserPermission(userId, picked.permission);
      }
    }
  );
  const cmdKickUser = vscode.commands.registerCommand(
    'ericCollab.kickUser',
    async (userId?: string) => {
      if (!client || client.state === 'idle') return;
      if (!userId) return;
      const u = currentUsers.find((x) => x.userId === userId);
      const confirm = await vscode.window.showWarningMessage(
        `Remove ${u?.name || 'this user'} from the room?`,
        { modal: true },
        'Remove'
      );
      if (confirm === 'Remove') {
        await client.kickUser(userId);
      }
    }
  );

  // ---- Lite Viewer commands ---------------------------------------------
  // The Lite Viewer is a public web page that talks to the Yjs
  // signaling server directly — no tunnel. When the host has set
  // `ericCollab.liteViewerUrl`, the sidebar exposes two buttons:
  //   "Open Lite Viewer"  — pop the URL in the default browser
  //   "Copy Lite URL"     — copy to clipboard
  const cmdCopyLiteViewerUrl = vscode.commands.registerCommand(
    'ericCollab.copyLiteViewerUrl',
    async () => {
      if (!client || client.state === 'idle') {
        vscode.window.showInformationMessage('No active session.');
        return;
      }
      const { liteViewerUrl } = buildInviteUrl(
        client.roomId,
        client.signalingServer,
        { publicOrigin: client.publicOrigin ?? undefined }
      );
      if (!liteViewerUrl) {
        vscode.window.showInformationMessage(
          'Lite Viewer is not configured. Set ericCollab.liteViewerUrl in Settings to a public URL that hosts the Eric Collab Lite Viewer.'
        );
        return;
      }
      await vscode.env.clipboard.writeText(liteViewerUrl);
      vscode.window.setStatusBarMessage(
        'Eric Collab: Lite Viewer URL copied',
        3000
      );
    }
  );
  const cmdOpenLiteViewer = vscode.commands.registerCommand(
    'ericCollab.openLiteViewer',
    async () => {
      if (!client || client.state === 'idle') {
        vscode.window.showInformationMessage('No active session.');
        return;
      }
      const { liteViewerUrl } = buildInviteUrl(
        client.roomId,
        client.signalingServer,
        { publicOrigin: client.publicOrigin ?? undefined }
      );
      if (!liteViewerUrl) {
        vscode.window.showInformationMessage(
          'Lite Viewer is not configured. Set ericCollab.liteViewerUrl in Settings to a public URL that hosts the Eric Collab Lite Viewer.'
        );
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(liteViewerUrl));
    }
  );
  context.subscriptions.push(cmdCopyLiteViewerUrl, cmdOpenLiteViewer);
  const cmdRename = vscode.commands.registerCommand(
    'ericCollab.rename',
    async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'New display name for this session',
        value: localUser?.name || '',
      });
      if (name) {
        await localUser?.setName(name);
        client?.setLocalName(name);
        vscode.window.showInformationMessage(`You're now known as ${name}.`);
      }
    }
  );

  // ---- URI handler --------------------------------------------------------
  const uriHandler = vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri) {
      const room = uri.query
        ? new URLSearchParams(uri.query).get('ericCollabRoom')
        : null;
      if (room) {
        joinSession(uri.toString());
      } else {
        outputChannel?.appendLine(`[Eric Collab] ignored URI: ${uri.toString()}`);
      }
    },
  });

  // ---- Tunnel state → status bar -----------------------------------------
  statusBar.setTunnel(tunnel.getState(), tunnel.getPublicUrl());
  tunnelListenerDispose = tunnel.on((info) => {
    statusBar?.setTunnel(info.state, info.publicUrl);
    outputChannel?.appendLine(
      `[Eric Collab] tunnel ${info.state} ${info.publicUrl || ''} ${
        info.errorMessage ? '(' + info.errorMessage + ')' : ''
      }`
    );
    if (client && client.state !== 'idle' && info.state === 'live') {
      client.publicOrigin = info.publicUrl || null;
    }
    void vscode.commands.executeCommand(
      'setContext',
      'ericCollab.tunnelUp',
      info.state === 'live'
    );
    pushSidebarState();
  });

  // ---- Lifecycle ----------------------------------------------------------
  const onEditorChange = vscode.window.onDidChangeTextEditorSelection((e) => {
    if (client && client.state === 'connected') {
      client.setLocalCursor(e.textEditor.document, e.selections[0]);
    }
  });
  const onDocOpen = vscode.workspace.onDidOpenTextDocument((doc) => {
    if (client && client.state === 'connected') {
      client.bindDocument(doc);
    }
  });
  // Switching tabs changes which file the host is "working on" — the
  // guests' Lite Viewer follows the host's active editor, so it has to
  // be republished on every editor switch.
  const onActiveEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (client && client.state === 'connected' && editor) {
      client.publishActiveFile(editor.document);
    }
  });
  const onDocClose = vscode.workspace.onDidCloseTextDocument((doc) => {
    if (client) {
      client.unbindDocument(doc.uri);
    }
  });

  context.subscriptions.push(
    cmdStart,
    cmdJoin,
    cmdLeave,
    cmdCopy,
    cmdPanel,
    cmdCopyTunnel,
    cmdRestartTunnel,
    cmdForceResync,
    cmdShareFile,
    cmdSetPermission,
    cmdKickUser,
    cmdRename,
    uriHandler,
    onEditorChange,
    onDocOpen,
    onDocClose,
    onActiveEditorChange,
    statusBar,
    {
      dispose: () => {
        tunnelListenerDispose?.();
        tunnelListenerDispose = null;
      },
    }
  );

  const cfg = vscode.workspace.getConfiguration('ericCollab');
  if (cfg.get<boolean>('autoStartOnWorkspace')) {
    await startSession();
  }

  // First-time hint: pop the Eric Collab activity bar open so the user
  // can see where the button lives. Only fires the first session per
  // extension install — once dismissed, never shows again.
  const didShowWelcome = globalState?.get<boolean>('ericCollab.didShowWelcome');
  if (!didShowWelcome) {
    try {
      await vscode.commands.executeCommand('workbench.view.extension.ericCollab');
      await globalState?.update('ericCollab.didShowWelcome', true);
    } catch {
      /* activity bar may not exist in some hosts */
    }
  }

  await maybeAutoJoinFromUrl();
  await maybeReconnectPersistedSession();

  // ---- Bridge with the dashboard's Collaboration page -------------------
  //
  // The dashboard (Vite dev server) cannot call VS Code commands, so it
  // writes a `startRequested` flag into the shared session file instead.
  // We poll for it here and act on it, which makes the dashboard's
  // "Start session" button work with a single click.
  //
  // The same file also carries the Cloudflare tunnel origin, which we
  // publish back into the dashboard so it can build the share link.
  const bridgeTimer = setInterval(() => {
    try {
      if (consumeStartRequest()) {
        outputChannel?.appendLine(
          '[Eric Collab] dashboard requested a session — starting one.'
        );
        void startSession();
      }
      const state = readSessionState();
      const origin = tunnel.getPublicUrl() || client?.publicOrigin || null;
      if (origin && state.publicUrl !== origin) {
        writeSessionState({ publicUrl: origin });
      }

      // Publish the live session so the dashboard always shows the real
      // room code. Without this the Collaboration page stays blank
      // whenever the session was started somewhere else — most often
      // when the extension auto-reconnects to the room it persisted
      // from the previous run, and the dashboard's own "Start session"
      // button then hits the "a session is already active" guard and
      // never publishes anything.
      if (client && client.state !== 'idle' && client.roomId) {
        if (state.roomId !== client.roomId || state.role !== 'host') {
          writeSessionState({
            roomId: client.roomId,
            signalingServer: client.signalingServer,
            role: 'host',
            startedAt: state.startedAt || Date.now(),
          });
        }
      }
    } catch (e: any) {
      outputChannel?.appendLine(
        `[Eric Collab] dashboard bridge error: ${e?.message || e}`
      );
    }
  }, 2000);
  context.subscriptions.push({ dispose: () => clearInterval(bridgeTimer) });

  outputChannel?.appendLine('[Eric Collab] ready.');
}

export function deactivate() {
  if (client) {
    client.disconnect();
    client = null;
  }
  if (statusBar) {
    statusBar.dispose();
    statusBar = null;
  }
  void tunnel.close();
}

// ---- Session actions -----------------------------------------------------

function detectLocalPort(): number {
  const w: any = globalThis as any;
  try {
    if (w?.location?.port) {
      const p = parseInt(w.location.port, 10);
      if (!Number.isNaN(p) && p > 0) return p;
    }
    if (typeof w?.location?.href === 'string') {
      const u = new URL(w.location.href);
      if (u.port) {
        const p = parseInt(u.port, 10);
        if (!Number.isNaN(p) && p > 0) return p;
      }
    }
  } catch {
    /* fall through */
  }
  const cfg = vscode.workspace.getConfiguration('ericCollab');
  return cfg.get<number>('tunnelPort') ?? 8080;
}

async function startSession(): Promise<void> {
  if (client && client.state !== 'idle') {
    // A session is already running (most often the one the extension
    // restored from the previous run). The dashboard asked for a
    // session, so publish what is actually live instead of bailing
    // out — otherwise the Collaboration page would sit on "not
    // started" while a perfectly good room is open.
    writeSessionState({
      roomId: client.roomId,
      signalingServer: client.signalingServer,
      role: 'host',
      startedAt: readSessionState().startedAt || Date.now(),
    });
    outputChannel?.appendLine(
      `[Eric Collab] dashboard requested a session, but room ${client.roomId} is already active — published it instead.`
    );
    pushSidebarState();
    return;
  }
  const roomId = generateRoomId();

  const cfg = vscode.workspace.getConfiguration('ericCollab');
  const wantTunnel = cfg.get<boolean>('autoTunnel') !== false;
  const port = detectLocalPort();

  // Open the Yjs client FIRST. It only needs the signaling server URL
  // (wss://demos.yjs.dev/ws) — it doesn't need the public tunnel at
  // all. Doing this before the tunnel lets the host see the room and
  // copy the invite in ~1s instead of waiting 5–15s for the tunnel
  // handshake.
  //
  // The tunnel is opened in parallel in the background. When it comes
  // up, the invite is rebuilt with the public origin so guests on
  // other networks can reach the host's code-server UI.
  const infoNoTunnel = makeRoomInfo('host', roomId, undefined);
  await openClientAndConnect(infoNoTunnel.signalingServer, roomId, undefined);
  await persistSession({
    roomId,
    signalingServer: infoNoTunnel.signalingServer,
    publicOrigin: undefined,
    role: 'host',
  });
  // Publish the session so the dashboard's Collaboration page can show
  // the room code and build the share link without the user having to
  // copy it by hand.
  writeSessionState({
    roomId,
    signalingServer: infoNoTunnel.signalingServer,
    role: 'host',
    startedAt: Date.now(),
  });
  await copyInvite();
  pushSidebarState();
  outputChannel?.appendLine(
    `[Eric Collab] host started room ${roomId} on ${infoNoTunnel.signalingServer} (Yjs ready, tunnel ${wantTunnel ? 'pending' : 'off'})`
  );

  // Now open the tunnel in the background. We use a "fire-and-forget"
  // pattern but still `await` the result so we can update the invite
  // and emit a single completion notification.
  if (!wantTunnel) {
    return;
  }
  void (async () => {
    try {
      statusBar?.setTunnel('starting');
      const publicOrigin = await tunnel.open(port);
      outputChannel?.appendLine(
        `[Eric Collab] tunnel open at ${publicOrigin} (forwarding to local :${port})`
      );
      if (client) {
        client.publicOrigin = publicOrigin;
      }
      await persistSession({
        roomId,
        signalingServer: infoNoTunnel.signalingServer,
        publicOrigin,
        role: 'host',
      });
      // Rebuild the invite now that the public origin is known.
      await copyInvite();
      pushSidebarState();
    } catch (err: any) {
      outputChannel?.appendLine(
        `[Eric Collab] tunnel failed: ${err?.message || err} — invite stays as room code only`
      );
      vscode.window.showWarningMessage(
        `Eric Collab: public tunnel could not be opened (${err?.message || err}). Guests on the same network can still join using the room code. Retry with "Eric Collab: Restart Public Tunnel".`
      );
    }
  })();
}

async function joinSessionPrompt(): Promise<void> {
  const input = await vscode.window.showInputBox({
    title: 'Join Eric Collab session',
    prompt: 'Paste the invite URL or the 8-character room code (e.g. KQ7P-3XRN).',
    placeHolder: 'https://eric-room-xyz.loca.lt/?ericCollabRoom=…  or  KQ7P-3XRN',
    ignoreFocusOut: true,
  });
  if (!input) return;
  await joinSession(input);
}

async function joinSession(input: string): Promise<void> {
  const parts = parseInviteLink(input);
  if (!parts) {
    vscode.window.showErrorMessage(
      `Eric Collab: couldn't parse "${input}". Expected a room code (KQ7P-3XRN) or invite URL.`
    );
    return;
  }
  await openClientAndConnect(parts.signalingServer, parts.roomId, parts.publicOrigin);
  await persistSession({
    roomId: parts.roomId,
    signalingServer: parts.signalingServer,
    publicOrigin: parts.publicOrigin,
    role: 'guest',
  });
  outputChannel?.appendLine(
    `[Eric Collab] guest joined room ${parts.roomId} on ${parts.signalingServer}` +
      (parts.publicOrigin ? ` via ${parts.publicOrigin}` : '')
  );
}

function leaveSession(): void {
  if (!client) return;
  const room = client.roomId;
  client.disconnect();
  client = null;
  currentUsers = [];
  currentPermissions = new Map();
  statusBar?.setState('idle');
  statusBar?.setUserCount(0);
  void tunnel.close();
  statusBar?.setTunnel('idle', null);
  void vscode.commands.executeCommand('setContext', 'ericCollab.active', false);
  void vscode.commands.executeCommand('setContext', 'ericCollab.tunnelUp', false);
  void clearPersistedSession();
  // Tell the dashboard the session is over so its Collaboration page
  // stops advertising a room code that no longer exists.
  clearSessionState();
  vscode.window.showInformationMessage(`Eric Collab: left room ${room}.`);
  outputChannel?.appendLine(`[Eric Collab] left room ${room}`);
  pushSidebarState();
}

async function reestablishTunnel(): Promise<void> {
  if (!client) return;
  const port = detectLocalPort();
  statusBar?.setTunnel('starting');
  try {
    const publicUrl = await tunnel.open(port);
    client.publicOrigin = publicUrl;
    // Update the persisted session so the new public origin survives
    // a future code-server refresh.
    await persistSession({
      roomId: client.roomId,
      signalingServer: client.signalingServer,
      publicOrigin: publicUrl,
      role: 'host',
    });
    vscode.window.showInformationMessage(
      `Eric Collab: public tunnel restored at ${publicUrl}`
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Eric Collab: failed to reopen tunnel (${err?.message || err})`
    );
  }
}

async function copyInvite(): Promise<void> {
  if (!client) return;
  const { url, publicUrl, liteViewerUrl } = buildInviteUrl(
    client.roomId,
    client.signalingServer,
    { publicOrigin: client.publicOrigin ?? undefined }
  );
  const invite = client.publicOrigin ? publicUrl : url;
  // Always put the code-server invite on the clipboard first; the
  // popup below lets the host swap in just the tunnel URL, the local
  // URL, or the Lite Viewer URL (when configured).
  await vscode.env.clipboard.writeText(invite);
  const choice = await vscode.window.showInformationMessage(
    `Invite link copied (room ${client.roomId})`,
    'Open in browser',
    'Copy tunnel URL only',
    'Copy local URL only',
    ...(liteViewerUrl ? ['Copy Lite Viewer URL'] : []),
  );
  if (choice === 'Open in browser') {
    void vscode.env.openExternal(vscode.Uri.parse(invite));
  } else if (choice === 'Copy tunnel URL only' && client.publicOrigin) {
    await vscode.env.clipboard.writeText(publicUrl);
    vscode.window.setStatusBarMessage('Eric Collab: tunnel URL copied', 3000);
  } else if (choice === 'Copy local URL only') {
    await vscode.env.clipboard.writeText(url);
    vscode.window.setStatusBarMessage('Eric Collab: local URL copied', 3000);
  } else if (choice === 'Copy Lite Viewer URL' && liteViewerUrl) {
    await vscode.env.clipboard.writeText(liteViewerUrl);
    vscode.window.setStatusBarMessage('Eric Collab: Lite Viewer URL copied', 3000);
  }
}

async function openClientAndConnect(
  signalingServer: string,
  roomId: string,
  publicOrigin?: string
): Promise<void> {
  if (!localUser) return;
  if (client) client.disconnect();

  client = new CollabClient(localUser);
  client.on('stateChange', (state) => {
    statusBar?.setState(state, roomId);
    void vscode.commands.executeCommand(
      'setContext',
      'ericCollab.active',
      state !== 'idle'
    );
    pushSidebarState();
  });
  client.on('presenceChange', (users: UserPresence[]) => {
    currentUsers = users;
    // Merge in the latest permissions so the sidebar shows the right
    // badge even before the awareness state reflects a permission
    // change.
    for (const u of users) {
      if (u.userId) currentPermissions.set(u.userId, u.permission);
    }
    statusBar?.setUserCount(users.length);
    pushSidebarState();
  });
  client.on('error', (msg) => {
    outputChannel?.appendLine(`[Eric Collab] error: ${msg}`);
  });
  client.on('metaChange', () => {
    void vscode.commands.executeCommand(
      'setContext',
      'ericCollab.isHost',
      client?.isHost() ?? false
    );
    pushSidebarState();
  });
  client.on('permissionsChange', () => {
    currentPermissions = client!.getAllPermissions();
    // Re-render presence with the latest permissions so the badges
    // update immediately.
    if (client?.awareness) {
      for (const u of currentUsers) {
        u.permission = currentPermissions.get(u.userId) || 'viewer';
      }
    }
    pushSidebarState();
  });
  client.on('kicked', () => {
    leaveSession();
  });

  statusBar?.setState('connecting', roomId);
  client.connect(roomId, signalingServer, publicOrigin);
  void vscode.commands.executeCommand('setContext', 'ericCollab.active', true);

  for (const doc of vscode.workspace.textDocuments) {
    client.bindDocument(doc);
  }

  pushSidebarState();
}

/** Push the latest combined state into the sidebar webview. */
function pushSidebarState(): void {
  if (!sidebarProvider) return;
  const cfg = vscode.workspace.getConfiguration('ericCollab');
  const defaultSig = cfg.get<string>('signalingServer') || 'wss://demos.yjs.dev/ws';
  const tunnelInfo = tunnel.getInfo();
  const state: SidebarViewState = {
    sessionActive: !!client && client.state !== 'idle',
    collabState: client?.state ?? 'idle',
    roomId: client?.roomId ?? '',
    signalingServer: client?.signalingServer || defaultSig,
    publicUrl: client?.publicOrigin ?? tunnel.getPublicUrl() ?? null,
    liteViewerUrl: (() => {
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
    })(),
    tunnelState: tunnel.getState(),
    tunnelError: tunnelInfo?.errorMessage,
    connDetail: client?.lastConnDetail ?? '',
    connSteps: client?.connSteps ?? [],
    elapsedMs: client?.getElapsedMs() ?? 0,
    users: currentUsers,
    permissions: currentPermissions,
    isHost: client?.isHost() ?? false,
    localUserId: localUser?.userId ?? '',
    localPermission: client?.getLocalPermission() ?? 'viewer',
  };
  sidebarProvider.update(state);
}

async function showSessionMenu(): Promise<void> {
  if (!client || client.state === 'idle') {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(broadcast) Start new session', description: 'host a new room and invite others over the internet', action: 'start' },
        { label: '$(sign-in) Join session', description: 'enter an invite link or room code', action: 'join' },
      ],
      { title: 'Eric Collab', placeHolder: 'No active session — choose an action' }
    );
    if (!choice) return;
    if (choice.action === 'start') await startSession();
    if (choice.action === 'join') await joinSessionPrompt();
    return;
  }
  const tunnelLabel = client.publicOrigin
    ? `$(globe) Tunnel: ${client.publicOrigin}`
    : '$(globe) No public tunnel — guests on other networks cannot join';
  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(clippy) Copy invite link', description: 'public URL when tunnel is up, else localhost', action: 'copy' },
      { label: tunnelLabel, action: 'tunnel' },
      { label: '$(refresh) Restart public tunnel', description: 're-establish the internet-facing URL', action: 'restartTunnel' },
      { label: '$(sync) Force resync documents', description: 're-bind all open files (recovery for missed updates)', action: 'resync' },
      { label: '$(share) Share current file', description: 'push the active file to all peers', action: 'share' },
      { label: '$(broadcast) Show room code', action: 'show' },
      { label: '$(rename) Change my display name', action: 'rename' },
      { label: '$(debug-disconnect) End session', action: 'leave' },
    ],
    { title: `Eric Collab · room ${client.roomId}`, placeHolder: 'Active session' }
  );
  if (!choice) return;
  switch (choice.action) {
    case 'copy':
      await copyInvite();
      break;
    case 'tunnel':
      if (client.publicOrigin) {
        await vscode.env.clipboard.writeText(client.publicOrigin);
        vscode.window.setStatusBarMessage('Tunnel URL copied', 3000);
      } else {
        await reestablishTunnel();
      }
      break;
    case 'restartTunnel':
      await reestablishTunnel();
      break;
    case 'resync':
      client.forceResync();
      vscode.window.setStatusBarMessage('Eric Collab: documents re-bound', 3000);
      break;
    case 'share': {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a file in the editor first.');
        return;
      }
      client.shareCurrentDocument(editor.document);
      vscode.window.setStatusBarMessage(
        `Eric Collab: shared ${editor.document.fileName}`,
        3000
      );
      break;
    }
    case 'show':
      vscode.window.showInformationMessage(
        `Room code: ${client.roomId}\nSignaling: ${client.signalingServer}\n` +
          (client.publicOrigin ? `Public URL: ${client.publicOrigin}` : 'No public tunnel — local URL only')
      );
      break;
    case 'rename':
      await vscode.commands.executeCommand('ericCollab.rename');
      break;
    case 'leave':
      leaveSession();
      break;
  }
}

async function maybeAutoJoinFromUrl(): Promise<void> {
  const w: any = globalThis as any;
  const href: string | undefined = w?.location?.href;
  if (!href) return;
  try {
    const u = new URL(href);
    const room = u.searchParams.get('ericCollabRoom');
    if (room) {
      outputChannel?.appendLine(
        `[Eric Collab] auto-join detected room=${room} from URL`
      );
      await joinSession(href);
    }
  } catch {
    /* not a URL context */
  }
}

// ---------------------------------------------------------------
// Session persistence + auto-reconnect
// ---------------------------------------------------------------
//
// Why this exists
// ---------------
// When the host reloads code-server, the localtunnel client inside
// the Eric Collab extension terminates. loca.lt then has no
// upstream to forward to, and any guest that already opened the
// invite link in incognito starts getting 502 Bad Gateway until
// the host manually re-opens the session.
//
// We solve that by saving the active session (room id, signaling
// server, public origin) in memento and re-opening it on
// `activate()`. When the host restarts, we re-issue a localtunnel
// request for the *same subdomain* (parsed from the saved public
// origin), so loca.lt re-attaches the guest's pending request to
// the new client and the 502 clears.

async function persistSession(s: PersistedSession): Promise<void> {
  if (!globalState) return;
  await globalState.update(SESSION_KEY, s);
}

async function clearPersistedSession(): Promise<void> {
  if (!globalState) return;
  await globalState.update(SESSION_KEY, undefined);
}

function readPersistedSession(): PersistedSession | null {
  if (!globalState) return null;
  const s = globalState.get<PersistedSession>(SESSION_KEY);
  if (!s || !s.roomId || !s.signalingServer) return null;
  return s;
}

/**
 * Extract the localtunnel subdomain from a public origin URL.
 * e.g. `https://eric-room-xyz.loca.lt` → `eric-room-xyz`
 */
function subdomainFromOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    const u = new URL(origin);
    const host = u.hostname; // e.g. "eric-room-xyz.loca.lt"
    const parts = host.split('.');
    if (parts.length < 2) return undefined;
    return parts[0];
  } catch {
    return undefined;
  }
}

async function maybeReconnectPersistedSession(): Promise<void> {
  if (client && client.state !== 'idle') return; // already connected
  const saved = readPersistedSession();
  if (!saved) return;

  outputChannel?.appendLine(
    `[Eric Collab] reconnecting to room ${saved.roomId} (role=${saved.role})`
  );
  statusBar?.setState('reconnecting', saved.roomId);

  try {
    if (saved.role === 'host' && saved.publicOrigin) {
      // Re-open the tunnel with the SAME subdomain so loca.lt re-uses
      // the existing forwarding path. The guest's incognito tab will
      // resolve as soon as the new client attaches.
      const subdomain = subdomainFromOrigin(saved.publicOrigin);
      const port = detectLocalPort();
      try {
        const newOrigin = await tunnel.open(port, { subdomain });
        // localtunnel might rotate the subdomain on conflict (the
        // server may have released the old one); persist the actual
        // URL it returned so the next refresh is correct.
        if (newOrigin !== saved.publicOrigin) {
          outputChannel?.appendLine(
            `[Eric Collab] tunnel subdomain rotated: ${saved.publicOrigin} → ${newOrigin}`
          );
        }
        await openClientAndConnect(saved.signalingServer, saved.roomId, newOrigin);
        await persistSession({
          roomId: saved.roomId,
          signalingServer: saved.signalingServer,
          publicOrigin: newOrigin,
          role: 'host',
        });
        vscode.window.showInformationMessage(
          `Eric Collab: reconnected to room ${saved.roomId}. ` +
            `Invite link is the same${newOrigin !== saved.publicOrigin ? ` (new URL: ${newOrigin})` : ''}.`
        );
      } catch (err: any) {
        // Subdomain might be taken or loca.lt may be down. Fall back
        // to a random subdomain so the host at least has *a* tunnel.
        outputChannel?.appendLine(
          `[Eric Collab] could not restore subdomain ${subdomain}: ${err?.message || err}`
        );
        const fallback = await tunnel.open(port);
        await openClientAndConnect(saved.signalingServer, saved.roomId, fallback);
        await persistSession({
          roomId: saved.roomId,
          signalingServer: saved.signalingServer,
          publicOrigin: fallback,
          role: 'host',
        });
        vscode.window.showWarningMessage(
          `Eric Collab: reconnected to room ${saved.roomId} on a new tunnel (${fallback}). ` +
            `The old invite link won't work — share the new one.`
        );
      }
    } else if (saved.role === 'host') {
      // Host without a tunnel — just re-open the client.
      await openClientAndConnect(saved.signalingServer, saved.roomId, undefined);
      vscode.window.showInformationMessage(
        `Eric Collab: reconnected to room ${saved.roomId} (no public tunnel).`
      );
    } else {
      // Guest — just re-open the client. If the host's tunnel is
      // still alive the room is reachable, otherwise the user will
      // see the "waiting for the host" status.
      await openClientAndConnect(saved.signalingServer, saved.roomId, saved.publicOrigin);
      vscode.window.showInformationMessage(
        `Eric Collab: reconnected to room ${saved.roomId} as guest.`
      );
    }
  } catch (err: any) {
    outputChannel?.appendLine(
      `[Eric Collab] auto-reconnect failed: ${err?.message || err}`
    );
    // Don't leave a half-broken session around — clear it so the
    // next refresh starts fresh.
    await clearPersistedSession();
  }
}
