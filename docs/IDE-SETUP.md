# Live IDE Workspace — Setup Guide

This page explains how the **Live IDE** tab in Project Eric works and how
to wire up `code-server` (from <https://github.com/coder/code-server>) so
the React dashboard can launch a full VS Code editor in a new window and
let your team code together in real time.

> ⚠️ **One note up front** — `code-server` is a self-hosted VS Code-in-a-browser.
> It's **not** an Eclipse product. The Eclipse Foundation equivalent is
> **Eclipse Theia** (which Gitpod / Arduino Pro IDE are built on). If you
> want to run Theia instead of code-server, the React UI's settings
> drawer (Live IDE → "Edit" → Base URL) just points at your Theia
> instance — no other changes needed.
>
> For real-time collaboration in code-server we ship **three** options.
> They're all installed by the setup script and the React UI lets you
> pick which one to use when you create a room.
>
> | Package | Account | Best for |
> |---|---|---|
> | **Eric Collab** (`project-eric.eric-collab`) | None | **Bundled with Eric**. Internet-routable invite URLs (auto-tunnel), no port-forwarding |
> | **CodeTogether** (`genuitecllc.codetogether`) | None | URL-based rooms, free tier, drop-in |
> | **VS Live Share** (`ms-vsliveshare.vsliveshare`) | Microsoft | Tightest debug-protocol integration |

---

## Architecture

```
┌──────────────────────────┐         ┌────────────────────────────┐
│  React dashboard         │  HTTP   │  code-server (Node.js)     │
│  /ide                    │ ──────▶ │  http://localhost:8080     │
│  • Launch button         │         │  • VS Code in browser      │
│  • Room manager          │         │  • Eric Collab extension   │
│  • Health probe (5s)     │         │  • Terminal, debugger      │
│  • Recent projects       │         │  • Eric Colab Tunnel (public URL)
└──────────────────────────┘         └────────────────────────────┘
           │                                       │
           │ window.open(...)                      │ CRDT/WebSocket
           ▼                                       ▼
┌──────────────────────────┐         ┌────────────────────────────┐
│  New browser tab         │         │  Teammates join via URL    │
│  (the IDE)               │         │  (Eric Collab / CodeTogether / Live Share)
└──────────────────────────┘         └────────────────────────────┘
```

code-server is a **separate process** on the same machine. The React
app can't host it — it just opens a new tab pointing at
`http://localhost:8080`.

---

## One-time setup (Windows / XAMPP machine)

You need PowerShell. Everything else is automated.

```powershell
# 1. From the project root
cd "D:\webpage design"

# 2. Download + install code-server
npm run ide:setup
```

This will:
1. Download `code-server v4.96.4` from the official GitHub release.
2. Extract it to `C:\tools\code-server`.
3. Create the workspace folder at `C:\Users\Public\project-eric-ide`.
4. Write `~\.config\code-server\config.yaml` (no auth, no telemetry).
5. **Build & install the bundled `Eric Collab` extension** (this repo's
   `extensions\eric-collab`) so it shows up automatically the first time
   you open code-server.
6. Pre-install the other collaboration extensions from the Open VSX
   marketplace (CodeTogether, VS Live Share) so the team has fallbacks.
7. Pre-install the **Eclipse Java extension pack**
   (`vscjava.vscode-java-pack` + debug/test/Maven) so Java teams get the
   same toolchain they have in the desktop Eclipse IDE.
8. Add `C:\tools\code-server\bin` to the user PATH.

## Starting the IDE

```powershell
npm run ide:start
```

You'll see:

```
▶ Starting code-server on 127.0.0.1:8080
  ✓ Started (PID: 1234)
  ✓ Logs:   C:\tools\code-server\logs\code-server.log

  code-server is live at:
    http://127.0.0.1:8080
```

Then in the Eric app:

1. Open the **Live IDE** tab (Tools sidebar).
2. The status pill will flip from `Checking…` to `Online`.
3. Click **Launch IDE in new window** — a new tab opens with the IDE.
4. The workspace `C:\Users\Public\project-eric-ide` is loaded.
5. Run `Eric Collab: Start Session` from the Command Palette (Ctrl+Shift+P).
   A public tunnel is opened automatically and the invite link is copied
   to your clipboard.
6. Back in the dashboard, paste the invite link into a new Room and share
   the room link with your team — they click it and join from anywhere on
   the internet.

## Other commands

```powershell
npm run ide:status   # show PID + URL
npm run ide:stop     # kill the server
```

---

## Real-time collaboration

### Option A: Eric Collab (bundled, recommended)

Eric Collab is built into this repo (`extensions\eric-collab`). It's a
custom VS Code extension that uses **Yjs CRDTs** for the document sync
and **localtunnel** to give the host's `127.0.0.1:8080` a public URL
guests can reach from anywhere on the internet — no router config, no
account, no port forwarding.

1. Open the IDE in your browser.
2. Press **Ctrl+Shift+P** and run `Eric Collab: Start Session`.
3. After a couple of seconds a public URL like
   `https://eric-room-xyz.loca.lt` shows up in the status bar and the
   invite link is copied to your clipboard.
4. Back in Eric → **Live IDE**, click **Create room**, leave the
   provider on **Eric Collab**, name the room, and paste the public
   invite URL into the *Session URL* field.
5. Share the room invite link Eric shows (`/ide?room=ABCD-EFGH`) with
   your team. They click it and code-server opens the host's workspace.

Useful commands:

- `Eric Collab: Copy Invite Link` — re-copy the current invite URL.
- `Eric Collab: Copy Public Tunnel URL` — copy just the tunnel URL.
- `Eric Collab: Restart Public Tunnel` — re-establish the tunnel if it
  drops (e.g. after your laptop sleeps).
- `Eric Collab: End Session` — disconnect from the Yjs relay and close
  the tunnel.

The extension reads these VS Code settings (search "Eric Collab" in
Ctrl+,):

| Setting | Default | Purpose |
|---|---|---|
| `ericCollab.signalingServer` | `wss://demos.yjs.dev/ws` | Public Yjs relay used for CRDT sync |
| `ericCollab.autoTunnel` | `true` | Open a public tunnel when the host starts |
| `ericCollab.tunnelSubdomain` | `""` | Optional reserved localtunnel subdomain |
| `ericCollab.tunnelHost` | `""` | Override the localtunnel host (self-host friendly) |
| `ericCollab.tunnelPort` | `8080` | Local code-server port to forward |

For full source & docs see [`extensions/eric-collab/README.md`](../extensions/eric-collab/README.md).

### Option B: CodeTogether (no account, drop-in)

1. Open the IDE in your browser.
2. Click the **CodeTogether** icon in the left activity bar (it looks
   like two overlapping circles).
3. Click **Start Session** → choose a region → **Start**.
4. Copy the session URL it gives you.
5. Back in Eric → **Live IDE**, click **Create room**, leave the provider
   on **CodeTogether**, name the room, and paste the URL into the
   *Session URL* field.
6. Share the invite link Eric generates (`/ide?room=ABCD-EFGH`) with
   your team.

### Option C: VS Live Share (Microsoft)

If you want the Microsoft Live Share experience (tightest integration
with VS Code's debug protocol, audio calling, terminal sharing):

1. Open the IDE in your browser.
2. Click the **Live Share** icon in the left activity bar.
3. Sign in with a Microsoft account.
4. Click **Share** → copy the join link.
5. Back in Eric → **Live IDE**, click **Create room**, switch the
   provider to **VS Live Share**, name the room, and paste the join link
   into the *Session URL* field.
6. Share the invite link with your team.

### How the provider flag flows through

```
User picks "Eric Collab" / "CodeTogether" / "Live Share" in the
Create-room modal
   ↓
Room record is stored with
{ provider: "ericcollab" | "codetogether" | "liveshare" }
   ↓
Room card shows a coloured badge for the provider
   ↓
Teammates who open the invite URL see the same provider and know
which extension to use when they join
```

---

## HTTPS (recommended for shared teams)

`code-server` defaults to plain HTTP on `127.0.0.1`. If you want HTTPS
(e.g. for sharing on a LAN), pass the `--cert` flag:

```powershell
# Generate a self-signed cert once
& "C:\tools\code-server\bin\code-server.cmd" `
    --cert
```

Then in `~\.config\code-server\config.yaml`:

```yaml
bind-addr: 0.0.0.0:8080
cert: true
```

For real TLS in production, put code-server behind a reverse proxy
(Caddy / nginx / Cloudflare Tunnel).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Status pill says **Offline** | Run `npm run ide:start` and check `C:\tools\code-server\logs\code-server.log` |
| Browser blocks the popup | Allow pop-ups for `http://localhost:5173` in your browser |
| "code-server is not recognized" | Restart your terminal so PATH reloads, or use the full path: `C:\tools\code-server\bin\code-server.cmd` |
| Extension install fails | The bundled gallery sometimes flakes — retry with `--force` or just install from inside the IDE |
| Want a different port | Pass `-Bind "0.0.0.0:9000"` to `start-ide.ps1`, then update the Base URL in the Live IDE settings drawer |
| Live Share asks for Microsoft sign-in | Expected — it's a Microsoft product. Use Eric Collab (bundled, no account) or CodeTogether instead. |
| Eric Collab tunnel page shows a "click to continue" interstitial | That's `loca.lt`'s anti-abuse page. Either click it once, or set `ericCollab.tunnelBypassToken` to bypass it. |
| Eric Collab build fails during `npm run ide:setup` | Run `cd extensions\eric-collab && npm install` once and retry. |

---

## File map

```
extensions/
  eric-collab/                  # the bundled Eric Collab extension
    src/                        # TypeScript source
    scripts/build.js            # tsc + esbuild bundle
    scripts/package.js          # produces dist\eric-collab-*.vsix
    README.md                    # extension docs
scripts/
  setup-ide.ps1                 # one-time installer (downloads code-server,
                                # builds + installs Eric Collab, installs
                                # CodeTogether / Live Share / Java pack)
  start-ide.ps1                 # start / stop / status
src/
  pages/
    IDEWorkspace.jsx            # the React page (Launch / Rooms / Recent)
  components/
    layout/Layout.jsx           # adds "Live IDE" link in sidebar
```