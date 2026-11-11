// cloudflared-tunnel.js
// ---------------------------------------------------------------------------
// Server-side Cloudflare "quick tunnel" manager.
//
// Why this lives in the Node/Vite layer (and not only inside the VS Code
// extension):
//
//   The Eric Collab extension can open a tunnel to code-server, but a
//   *guest on a different device* usually wants the lightweight Lite
//   Viewer page — not a 5 MB VS Code workbench. The Lite Viewer is
//   served by the Vite dev server, so the tunnel has to point at Vite.
//
//   Having the tunnel in the dev server also means the dashboard UI can
//   open it on demand (one button) instead of requiring the user to
//   install an extension and start a session from inside code-server.
//
// How it works
// ------------
//   `cloudflared tunnel --url http://127.0.0.1:<port>` starts an
//   ephemeral quick tunnel. No account, no config file, no daemon — it
//   prints a `https://<random>.trycloudflare.com` URL on stderr once the
//   edge connection is established (typically 1–3 s) and keeps running
//   until it is killed.
//
//   The URL is ephemeral: it changes every time the tunnel is (re)opened.
//   We therefore surface it through a status endpoint so the UI can show
//   the current link and refresh it if the tunnel dies.
//
// Requirements
// ------------
//   The `cloudflared` binary. We look for it on PATH and in the usual
//   install locations (C:\tools\cloudflared, Program Files, winget
//   links, …). `scripts/setup-ide.ps1` can install it; see the
//   `cloudflared` entry there.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const QUICK_TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/** Where cloudflared commonly lives, per platform. */
function candidatePaths() {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const out = [];

  // 1. Everything on PATH.
  const pathVar = process.env.PATH || process.env.Path || '';
  for (const dir of pathVar.split(path.delimiter)) {
    if (dir) out.push(path.join(dir, exe));
  }

  // 2. Well-known install locations.
  if (process.platform === 'win32') {
    out.push(
      'C:\\tools\\cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', exe),
      path.join(process.env.USERPROFILE || '', 'cloudflared.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'cloudflared', exe),
    );
  } else {
    out.push(
      '/usr/local/bin/cloudflared',
      '/opt/homebrew/bin/cloudflared',
      path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
      '/usr/bin/cloudflared',
      '/snap/bin/cloudflared',
    );
  }

  return out;
}

let cachedPath;

/**
 * Locate the cloudflared binary.
 * @returns {string|null} absolute path, or null when it is not installed.
 */
export function detectCloudflared() {
  if (cachedPath !== undefined) return cachedPath;
  for (const candidate of candidatePaths()) {
    try {
      if (candidate && existsSync(candidate)) {
        cachedPath = candidate;
        return cachedPath;
      }
    } catch {
      /* keep looking */
    }
  }
  cachedPath = null;
  return cachedPath;
}

/**
 * Human-readable install hint shown in the UI when cloudflared is
 * missing. Keeping it here (rather than in the React layer) means the
 * message stays in sync with the detection logic above.
 */
export const CLOUDFLARED_INSTALL_HINT =
  process.platform === 'win32'
    ? 'Install it with: winget install --id Cloudflare.cloudflared   (or download cloudflared-windows-amd64.exe into C:\\tools\\cloudflared)'
    : 'Install it with: brew install cloudflared   (or see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)';

/**
 * A running (or running-to-be) Cloudflare quick tunnel.
 *
 * Lifecycle:
 *   const tunnel = new CloudflaredTunnel();
 *   await tunnel.open(5173);        // resolves with the public URL
 *   tunnel.getStatus();             // { state, publicUrl, ... }
 *   await tunnel.close();
 *
 * The tunnel is intentionally a singleton per process: the dev server
 * owns exactly one public URL, and every page in the dashboard reads it
 * from the same place.
 */
export class CloudflaredTunnel {
  constructor() {
    /** @type {import('node:child_process').ChildProcess|null} */
    this.child = null;
    this.state = 'idle'; // idle | starting | live | error
    this.publicUrl = null;
    this.error = null;
    this.startedAt = 0;
    this.port = null;
    /** @type {Set<(status: object) => void>} */
    this.listeners = new Set();
  }

  /** Subscribe to status changes. Returns an unsubscribe function. */
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #emit() {
    const status = this.getStatus();
    for (const l of this.listeners) {
      try {
        l(status);
      } catch {
        /* a listener threw — ignore */
      }
    }
  }

  getStatus() {
    return {
      state: this.state,
      publicUrl: this.publicUrl,
      port: this.port,
      error: this.error,
      startedAt: this.startedAt,
      provider: 'cloudflared',
      available: detectCloudflared() !== null,
      installHint: CLOUDFLARED_INSTALL_HINT,
    };
  }

  /**
   * Open a quick tunnel to `http://127.0.0.1:<port>`.
   * Resolves with the public `https://…trycloudflare.com` URL.
   */
  open(port) {
    if (this.child) {
      // Already running. Return the existing URL when it points at the
      // same port, otherwise tear it down and start over.
      if (this.port === port && this.publicUrl) return Promise.resolve(this.publicUrl);
      this.close();
    }

    const bin = detectCloudflared();
    if (!bin) {
      this.state = 'error';
      this.error = 'cloudflared is not installed.';
      this.#emit();
      return Promise.reject(new Error(this.error));
    }

    this.state = 'starting';
    this.error = null;
    this.port = port;
    this.#emit();

    return new Promise((resolve, reject) => {
      let settled = false;
      let stderrBuf = '';

      const child = spawn(
        bin,
        ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      this.child = child;

      const onStderr = (chunk) => {
        stderrBuf += chunk.toString();
        const m = stderrBuf.match(QUICK_TUNNEL_URL_RE);
        if (m && !settled) {
          settled = true;
          this.publicUrl = m[0];
          this.state = 'live';
          this.startedAt = Date.now();
          this.#emit();
          resolve(this.publicUrl);
        }
      };

      child.stderr?.on('data', onStderr);
      child.stdout?.on('data', () => { /* cloudflared logs to stderr */ });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          this.state = 'error';
          this.error = `cloudflared failed to start: ${err.message}`;
          this.#emit();
          reject(new Error(this.error));
        }
      });

      child.on('exit', (code) => {
        this.child = null;
        // A tunnel that dies after it was live is an error the user
        // needs to see (the share link is now dead).
        if (this.state === 'live') {
          this.state = 'error';
          this.error = `The tunnel closed unexpectedly (exit code ${code}).`;
          this.publicUrl = null;
          this.#emit();
        } else if (!settled) {
          settled = true;
          this.state = 'error';
          this.error = `cloudflared exited before publishing a URL (code ${code}).`;
          this.#emit();
          reject(new Error(this.error));
        }
      });

      // cloudflared normally publishes within 1–3 s. Give it 30 s
      // before giving up so a slow handshake doesn't fail instantly.
      setTimeout(() => {
        if (settled) return;
        settled = true;
        this.state = 'error';
        this.error = 'Timed out after 30s waiting for the Cloudflare tunnel URL.';
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        this.#emit();
        reject(new Error(this.error));
      }, 30_000);
    });
  }

  /** Close the tunnel. Idempotent. */
  close() {
    const child = this.child;
    this.child = null;
    this.publicUrl = null;
    this.port = null;
    this.state = 'idle';
    this.error = null;
    if (child) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
    this.#emit();
  }
}

export default CloudflaredTunnel;
