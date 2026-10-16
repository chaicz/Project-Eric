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
