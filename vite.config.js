import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import runProjectPlugin from './scripts/dev-server-plugin.js'

// Project Eric — Vite config
//
// We deliberately ignore the bundled code-server extensions under
// `extensions/` so Vite never treats them as part of the dashboard
// source. Without this, Vite picks up the TypeScript config inside
// `extensions/eric-collab/tsconfig.json` and forces a full reload +
// clears cache, which has been breaking HMR (white screen on reload).
//
// The `runProjectPlugin` middleware is dev-only and exposes the
// `/api/run-project*` endpoints that power the "Run Project" button on
// the Live IDE page. It only attaches when Vite is running the dev
// server (apply: 'serve' in the plugin) so production builds stay clean.
export default defineConfig({
  plugins: [react(), runProjectPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    // The Eric Collab Lite Viewer is served by this dev server, and a
    // guest on another device reaches it through a Cloudflare quick
    // tunnel (`https://<random>.trycloudflare.com`). Vite blocks
    // requests whose Host header it does not recognise, so allow the
    // tunnel's wildcard domain.
    allowedHosts: ['.trycloudflare.com', '.loca.lt'],
    // A single public URL is enough for a guest: the tunnel points at
    // this server, and the Yjs signaling relay is proxied through the
    // same origin. The guest connects to
    //   wss://<tunnel>/collab-ws/<room>
    // which Vite forwards to
    //   ws://127.0.0.1:1234/ws/<room>
    // on the local relay. `rewrite` performs that path translation.
    //
    // The proxy is deliberately narrow: it only matches `/collab-ws`
    // and only forwards to the relay, so the tunnel cannot be used to
    // reach anything else the dev server exposes.
    proxy: {
      // The BilldDesk signaling service (`scripts/billd-desk-local/server.js`).
      // It speaks the upstream billd-desk wire protocol and is reached
      // through this dev server so that a single public URL (the
      // Cloudflare quick tunnel) carries the dashboard, the device API
      // and the realtime channel together.
      //
      //   /billd/api/…        → http://127.0.0.1:4300/api/…
      //   /billd/socket.io/…  → http://127.0.0.1:4300/socket.io/…
      //
      // `ws: true` is required — the offer/answer/ICE handshake runs over
      // a Socket.IO WebSocket upgrade on the same path.
      '/billd': {
        target: 'http://127.0.0.1:4300',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/billd/, ''),
      },
      '/collab-ws': {
        target: 'ws://127.0.0.1:1234',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/collab-ws/, '/ws'),
      },
      // The P2P Live Share signalling relay (`scripts/p2p-relay-server.mjs`).
      // It backs the `p2p-live-share` extension and speaks that
      // extension's protocol: a client connects to
      //   wss://<tunnel>/p2p-ws/<roomId>/<peerId>
      // which Vite forwards verbatim to
      //   ws://127.0.0.1:1235/<roomId>/<peerId>
      // on the local relay. No path rewrite is needed — the relay's URL
      // shape is already `<roomId>/<peerId>`.
      //
      // The proxy is deliberately narrow: it only matches `/p2p-ws` and
      // only forwards to the relay.
      '/p2p-ws': {
        target: 'ws://127.0.0.1:1235',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/p2p-ws/, ''),
      },
      // The code-server workbench, mounted under `/vscode` on this
      // origin.
      //
      // code-server already serves the workbench under `/vscode` and
      // `/` (see its own route table), and the workbench HTML uses
      // *relative* asset URLs — so a proxy that simply forwards the
      // path unchanged renders correctly under any prefix. Forwarding
      // `/vscode` as-is (rather than rewriting to `/`) is what makes
      // the workbench's own relative links resolve inside the prefix
      // instead of escaping to the dashboard root.
      //
      // `ws: true` is required: the workbench's realtime channel is a
      // WebSocket upgrade on the same path, and without it the editor
      // loads but never connects to the extension host.
      //
      // `changeOrigin` is left off so code-server sees the dashboard's
      // Host header. That keeps its origin check (`host` must match the
      // `origin` header) happy when the workbench is framed from this
      // origin, and it is what lets the same route work through the
      // Cloudflare tunnel.
      '/vscode': {
        target: 'http://127.0.0.1:8080',
        ws: true,
      },
    },
    // Don't let Vite scan the extensions folder or the .cursor workspace.
    watch: {
      ignored: [
        '**/extensions/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/.cursor/**',
        '**/xampp-backend/**',
        '**/database/**',
      ],
    },
    fs: {
      // Vite 5 default; keep it explicit for clarity.
      strict: false,
    },
  },
  // Exclude eric-collab from optimization so its Node-only deps never
  // bleed into the browser bundle.
  optimizeDeps: {
    exclude: ['eric-collab', 'yjs', 'y-websocket', 'localtunnel'],
  },
  build: {
    sourcemap: false,
  },
})
