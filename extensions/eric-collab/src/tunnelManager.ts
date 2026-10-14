// tunnelManager.ts
// Exposes the local code-server to the public internet via a tunnel.
// Only the host runs a tunnel; guests connect to the host's public URL.
//
// Why this is needed
// ------------------
// code-server normally runs at http://127.0.0.1:8080, which is unreachable
// from another machine. A tunnel gives us a public subdomain that
// reverse-proxies to the local port so a guest can:
//   1. Open the host's code-server in their browser, and
//   2. The y-websocket connection originating from the guest's machine is
//      accepted by the public tunnel.
//
// Tunnel providers, fastest first
// -------------------------------
//   1. cloudflared (`cloudflared tunnel --url <port>`) — ~1s handshake,
//      no signup, ephemeral `*.trycloudflare.com` URL. This is the
//      preferred provider when the binary is on PATH.
//   2. localtunnel (`loca.lt`) — ~5–15s first request through a new
//      subdomain, no signup. Used as the fallback because it works
//      everywhere with zero install.
//
// Note: the Yjs document sync is peer-to-peer via the *signaling server*
// (e.g. wss://demos.yjs.dev/ws). The tunnel is only required so the
// guest can *reach the host's code-server UI* and complete the
// same-handshake the local user did. The actual CRDT traffic goes
// through the public signaling server in both directions.

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const localtunnel = require('localtunnel') as {
  (
    port: number,
    opts?: { subdomain?: string; host?: string }
  ): Promise<TunnelInstance>;
};

export type TunnelState =
  | 'idle'
  | 'starting'
  | 'live'
  | 'reconnecting'
  | 'closed'
  | 'error';

export interface TunnelInfo {
  publicUrl: string;       // e.g. https://eric-room-xyz.loca.lt
  port: number;            // local port forwarded
  state: TunnelState;
  startedAt: number;
  errorMessage?: string;
}

export interface TunnelInstance {
  url: string;
  close(): Promise<void>;
  on(event: 'request' | 'error' | 'close', listener: (...args: any[]) => void): void;
}

export type TunnelListener = (info: TunnelInfo) => void;

// ============================================================
// Tunnel provider detection
// ============================================================
//
// `cloudflared` is a single static binary (~30 MB on Windows) that
// exposes a `*.trycloudflare.com` URL via `cloudflared tunnel --url`.
// No signup, no auth — it's an unauthenticated "quick tunnel" feature.
// Handshake is typically <2s, vs 5–15s for localtunnel's first request
// through a fresh subdomain.

let cachedCloudflaredPath: string | null | undefined;

/** Locate a cloudflared binary on PATH or in well-known install dirs. */
function detectCloudflared(): string | null {
  if (cachedCloudflaredPath !== undefined) return cachedCloudflaredPath;

  // 1. Try the user's PATH first.
  const pathVar = process.env.PATH || process.env.Path || '';
  const sep = process.platform === 'win32' ? ';' : ':';
  for (const dir of pathVar.split(sep)) {
    if (!dir) continue;
    const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    const candidate = path.join(dir, exe);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      if (fs.existsSync(candidate)) {
        cachedCloudflaredPath = candidate;
        return candidate;
      }
    } catch {
      /* keep searching */
    }
  }
  // 2. Common install locations.
  const wellKnown: string[] =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\cloudflared\\cloudflared.exe',
          'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
          'C:\\tools\\cloudflared\\cloudflared.exe',
          `${process.env.USERPROFILE || ''}\\cloudflared.exe`,
          `${process.env.LOCALAPPDATA || ''}\\cloudflared\\cloudflared.exe`,
        ]
      : [
          '/usr/local/bin/cloudflared',
          '/opt/homebrew/bin/cloudflared',
          `${process.env.HOME || ''}/.local/bin/cloudflared`,
        ];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    for (const c of wellKnown) {
      if (c && fs.existsSync(c)) {
        cachedCloudflaredPath = c;
        return c;
      }
    }
  } catch {
    /* ignore */
  }
  cachedCloudflaredPath = null;
  return null;
}

export function isCloudflaredAvailable(): boolean {
  return detectCloudflared() !== null;
}

export type TunnelProvider = 'cloudflared' | 'localtunnel';

/**
 * Open a cloudflared "quick tunnel" to `port` and return a TunnelInstance
 * whose `url` is the public `https://...trycloudflare.com` URL.
 *
 * `cloudflared` prints the URL on stderr (a quirk of the binary) once
 * it's ready to forward traffic — typically within ~1–2 seconds.
 */
async function openCloudflaredTunnel(port: number): Promise<TunnelInstance> {
  const bin = detectCloudflared();
  if (!bin) {
    throw new Error('cloudflared binary not found on PATH');
  }
  const child: ChildProcess = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const listeners: Record<string, Array<(...args: any[]) => void>> = {
    request: [],
    error: [],
    close: [],
  };
  const emit = (evt: string, ...args: any[]) => {
    for (const l of listeners[evt] || []) {
      try { l(...args); } catch { /* ignore */ }
    }
  };

  return await new Promise<TunnelInstance>((resolve, reject) => {
    let resolved = false;
    let stderrBuf = '';
    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

    const onStderr = (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
      const m = stderrBuf.match(urlRegex);
      if (m && !resolved) {
        resolved = true;
        resolve({
          url: m[0],
          close: () =>
            new Promise<void>((res) => {
              try { child.kill('SIGTERM'); } catch { /* ignore */ }
              child.once('exit', () => res());
              // Hard-kill fallback in case it doesn't exit.
              setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 1500);
            }),
          on: (evt, fn) => { (listeners[evt] ||= []).push(fn); },
        });
      }
    };

    child.stderr?.on('data', onStderr);
    child.stdout?.on('data', () => { /* discard */ });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared failed to start: ${err.message}`));
      }
      emit('error', err);
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared exited before publishing a URL (code=${code})`));
      }
      emit('close', code);
    });

    // Hard timeout — cloudflared normally takes 1–3s, give it 20s.
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        reject(new Error('cloudflared handshake timed out after 20s'));
      }
    }, 20_000);
  });
}

export class TunnelManager {
  private tunnel: TunnelInstance | null = null;
  private state: TunnelState = 'idle';
  private currentPort: number | null = null;
  private listeners: Set<TunnelListener> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastError: string | undefined;
  /** Which provider was used for the current tunnel (for UI/diagnostics). */
  public currentProvider: TunnelProvider | null = null;

  /** Subscribe to state changes. Returns an unsubscribe function. */
  on(listener: TunnelListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): TunnelState {
    return this.state;
  }

  getPublicUrl(): string | null {
    return this.tunnel?.url ?? null;
  }

  getInfo(): TunnelInfo | null {
    if (!this.tunnel || this.currentPort == null) return null;
    return {
      publicUrl: this.tunnel.url,
      port: this.currentPort,
      state: this.state,
      startedAt: this.startedAt,
      errorMessage: this.lastError,
    };
  }

  private startedAt = 0;

  /**
   * Open a tunnel to a local port. Resolves with the public URL once the
   * tunnel is accepting connections. Throws on irrecoverable failure.
   *
   * The optional `opts.subdomain` lets the caller pin a particular
   * localtunnel subdomain. This is what makes "rejoin after a
   * code-server refresh" work: when the host's code-server reloads, the
   * Eric Collab extension re-opens the tunnel using the same subdomain
   * it had before, so any guest that already opened the invite link in
   * incognito continues to land on the host's code-server instead of a
   * 502 from loca.lt.
   *
   * The optional `opts.provider` lets the caller force a specific
   * provider ('cloudflared' or 'localtunnel'). Otherwise we auto-detect:
   * cloudflared is preferred when its binary is on PATH; localtunnel
   * is the fallback because it works everywhere with zero install.
   */
  async open(
    port: number,
    opts?: { subdomain?: string; host?: string; provider?: TunnelProvider }
  ): Promise<string> {
    if (this.tunnel) {
      // Already running — make sure it's the same port, otherwise close.
      if (this.currentPort === port) {
        return this.tunnel.url;
      }
      await this.close();
    }

    this.currentPort = port;
    this.setState('starting');
    this.lastError = undefined;

    const cfg = vscode.workspace.getConfiguration('ericCollab');
    const desiredSubdomain =
      (opts?.subdomain && opts.subdomain.trim()) ||
      cfg.get<string>('tunnelSubdomain')?.trim() ||
      undefined;
    const tunnelHost =
      (opts?.host && opts.host.trim()) ||
      cfg.get<string>('tunnelHost')?.trim() ||
      undefined;

    // Pick provider: explicit > cloudflared (if installed) > localtunnel.
    const preferred: TunnelProvider =
      opts?.provider ||
      (cfg.get<string>('tunnelProvider') as TunnelProvider | undefined) ||
      (isCloudflaredAvailable() ? 'cloudflared' : 'localtunnel');

    // Localtunnel needs a subdomain; cloudflared uses an ephemeral
    // `*.trycloudflare.com` URL (subdomain is ignored by it).
    const ltOpts: { subdomain?: string; host?: string } = {};
    if (preferred === 'localtunnel' && desiredSubdomain) ltOpts.subdomain = desiredSubdomain;
    if (preferred === 'localtunnel' && tunnelHost) ltOpts.host = tunnelHost;

    try {
      if (preferred === 'cloudflared') {
        try {
          this.tunnel = await openCloudflaredTunnel(port);
          this.currentProvider = 'cloudflared';
        } catch (cfErr: any) {
          // Cloudflared was preferred but failed (e.g. binary missing
          // at the moment, network blocked, or the user disabled it
          // in config). Fall through to localtunnel.
          this.lastError = `cloudflared unavailable (${cfErr?.message || cfErr}); using localtunnel`;
          this.tunnel = await localtunnel(port, ltOpts);
          this.currentProvider = 'localtunnel';
        }
      } else {
        this.tunnel = await localtunnel(port, ltOpts);
        this.currentProvider = 'localtunnel';
      }
      this.startedAt = Date.now();
      this.setState('live');

      // Friendly hint for loca.lt's interstitial warning screen.
      // The warning says "click to continue" but a tunnel client can
      // pass a password header to bypass it.
      const bypassToken = cfg.get<string>('tunnelBypassToken')?.trim();
      if (bypassToken) {
        this.tunnel.on('request', (info: any) => {
          // localtunnel forwards headers as-is; the warning page reads
          // a query param called "bypass-tunnel-warning" or you can
          // provide a custom request handler. For now we log it.
          // (A full implementation would proxy through with the header.)
          void info;
        });
      }

      this.tunnel.on('error', (err: any) => {
        this.lastError = String(err?.message || err);
        this.setState('error');
        this.scheduleReconnect();
      });

      this.tunnel.on('close', () => {
        this.setState('closed');
        this.scheduleReconnect();
      });

      return this.tunnel.url;
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      this.setState('error');
      throw err;
    }
  }

  /** Close the tunnel if one is open. Idempotent. */
  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const t = this.tunnel;
    this.tunnel = null;
    this.currentPort = null;
    if (t) {
      try {
        await t.close();
      } catch {
        /* ignore */
      }
    }
    this.setState('idle');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.currentPort == null) return;
    const port = this.currentPort;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.setState('reconnecting');
      try {
        await this.open(port);
      } catch {
        // open() already recorded the error and scheduled another attempt
        this.scheduleReconnect();
      }
    }, 3000);
  }

  private setState(s: TunnelState): void {
    this.state = s;
    const info: TunnelInfo | null = this.getInfo() ?? {
      publicUrl: '',
      port: this.currentPort ?? 0,
      state: s,
      startedAt: this.startedAt,
      errorMessage: this.lastError,
    };
    info.state = s;
    for (const l of this.listeners) {
      try {
        l(info);
      } catch {
        /* listener threw — ignore */
      }
    }
  }
}
