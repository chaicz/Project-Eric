# Eric Collab — code-server extension

Real-time collaborative editing inside code-server, with **shareable invite links that work over the internet** — no account, no signup, no port forwarding.

Built on **Yjs CRDTs** over a **y-websocket** transport. Each session has an 8-character room code (e.g. `KQ7P-3XRN`) and a copyable invite URL.

## What you get

- `Eric Collab: Start Session` — host a new room, **opens a public tunnel automatically**, and copies the invite link.
- `Eric Collab: Join Session` — paste an invite link or room code to join.
- `Eric Collab: End Session` — leave the current room (and close the public tunnel).
- `Eric Collab: Copy Invite Link` — re-copy the current invite.
- `Eric Collab: Copy Public Tunnel URL` — copy just the public URL (when one is up).
- `Eric Collab: Restart Public Tunnel` — re-establish the tunnel if it dropped.
- A status bar indicator (right side) showing **tunnel state · state · room · user count**.
- A web URI handler so invite links open the right room automatically.
- Any open text document is bound to a shared `Y.Text`, so edits propagate in real time.
- Cursor presence — other collaborators see your caret position and the file you're in.

## How internet invitations work

code-server normally runs on `http://127.0.0.1:8080`, which other machines on the internet can't reach. This extension closes that gap with an **automatic public tunnel** powered by [localtunnel](https://github.com/localtunnel/localtunnel):

1. The **host** clicks **Eric Collab: Start Session**.
2. The extension opens a tunnel that forwards a public subdomain (e.g. `https://eric-room-xyz.loca.lt`) to the host's local `127.0.0.1:8080`.
3. The host's invite link is built with that public URL and copied to the clipboard.
4. The **guest** opens the invite link in their browser → their request hits the public tunnel → the tunnel forwards to the host's code-server → code-server loads → the extension sees the `?ericCollabRoom=…` query parameter and joins the room.
5. Both clients sync document edits and cursors over the public Yjs signaling server (`wss://demos.yjs.dev/ws` by default).

> No firewall changes, no `ngrok` account, no port forwarding on your router. The host only needs outbound HTTPS to `loca.lt` and `demos.yjs.dev`.

### Invite URL shape

```
https://<tunnel>.loca.lt/?ericCollabRoom=KQ7P-3XRN
                          &ericCollabServer=wss://demos.yjs.dev/ws
                          &ericCollabTunnel=1
```

The `ericCollabTunnel=1` flag tells joining clients that the origin is publicly reachable.

## Building

```powershell
cd extensions\eric-collab
npm install
npm run package
```

This produces `dist\eric-collab-<version>.vsix`. The build runs `tsc` for type-checking and then uses `esbuild` to bundle the `localtunnel` dependency into a single `out/extension.js`, so the .vsix has no runtime `node_modules` requirement.

## Installing into code-server

```powershell
# Make sure code-server is running on port 8080
C:\tools\code-server\bin\code-server.cmd --install-extension dist\eric-collab-0.2.0.vsix
```

Then open code-server, run **Eric Collab: Start Session** from the Command Palette, and copy the invite link. The status bar (bottom right) shows a globe icon once the public tunnel is up.

## Configuration

Open code-server settings (Ctrl+,) and search for "Eric Collab":

| Setting | Default | Purpose |
|---|---|---|
| `ericCollab.signalingServer` | `wss://demos.yjs.dev/ws` | WebSocket URL of the Yjs relay used to sync document edits. |
| `ericCollab.autoStartOnWorkspace` | `false` | Open a solo session automatically when code-server loads. |
| `ericCollab.autoTunnel` | `true` | Open a public tunnel when the host starts a session. Disable if you already have your own public code-server URL. |
| `ericCollab.tunnelSubdomain` | `""` | Optional reserved localtunnel subdomain. Leave blank for a random one. |
| `ericCollab.tunnelHost` | `""` | Override the localtunnel host. Default uses `https://loca.lt`. Point at a self-hosted localtunnel server if you run one. |
| `ericCollab.tunnelPort` | `8080` | Local code-server port the tunnel forwards to. Auto-detected from the page URL in most cases. |
| `ericCollab.tunnelBypassToken` | `""` | Optional bypass token for tunnel providers that show an interstitial warning. |

## Self-hosting the signaling server

For full control, run your own y-websocket server:

```bash
HOST=0.0.0.0 PORT=1234 npx y-websocket
```

Then set `ericCollab.signalingServer` to `ws://your-host:1234` in code-server settings.

## Self-hosting the tunnel

If `loca.lt` is blocked or you want a private tunnel, run your own localtunnel server:

```bash
npx localtunnel server --port 1337
```

Then set `ericCollab.tunnelHost` to `https://your-tunnel-server.example.com`.

## Security notes

- The default `wss://demos.yjs.dev/ws` is a **public** Yjs demo relay. Don't use it for sensitive code without also encrypting your code-server traffic (HTTPS).
- The default `loca.lt` tunnel is **public** — anyone with the invite URL can reach the host's code-server. If your code-server is set to `auth: none` (the default in `scripts\start-ide.ps1`), turn auth on or run behind a reverse proxy with a password.
- Anyone with the invite link can join the room. Share it intentionally.
- For private collab: run your own y-websocket server + your own localtunnel server + auth-protected code-server.

## Files

```
extensions/eric-collab/
├── package.json              # extension manifest
├── tsconfig.json
├── .vscodeignore
├── src/
│   ├── extension.ts          # entry, commands, URI handler, tunnel orchestration
│   ├── collabClient.ts       # Y.Doc + y-websocket + VS Code text binding
│   ├── roomManager.ts        # room id, invite URL parsing/building
│   ├── tunnelManager.ts      # public tunnel lifecycle (localtunnel)
│   ├── userPresence.ts       # local user identity + awareness
│   ├── statusBar.ts          # status bar item (now shows tunnel state)
│   └── types.ts
└── scripts/
    ├── build.js              # tsc + esbuild bundle
    └── package.js            # vsce .vsix
```

## Commands summary

| Command | What it does |
|---|---|
| `Eric Collab: Start Session` | Generate room ID, open public tunnel, connect to Yjs relay, copy invite URL. |
| `Eric Collab: Join Session` | Prompt for invite URL or room code, connect. |
| `Eric Collab: End Session` | Disconnect from Yjs, close the public tunnel. |
| `Eric Collab: Copy Invite Link` | Re-copy the active invite URL. |
| `Eric Collab: Copy Public Tunnel URL` | Copy just the tunnel URL. |
| `Eric Collab: Restart Public Tunnel` | Reopen the tunnel (e.g. after a drop). |
| `Eric Collab: Show Session Panel` | Open the session quick-pick menu. |
