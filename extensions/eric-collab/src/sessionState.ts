// sessionState.ts
// ---------------------------------------------------------------------------
// Shared on-disk state for the Eric Collab session.
//
// The dashboard (Vite dev server) and the Eric Collab extension run in
// different processes and cannot talk to each other directly without a
// lot of plumbing. Instead they exchange a small JSON file under the
// per-user app-data directory:
//
//   Windows : %LOCALAPPDATA%\project-eric\collab-session.json
//   macOS   : ~/.project-eric/collab-session.json
//   Linux   : ~/.local/state/project-eric/collab-session.json
//
// Shape:
//   {
//     "roomId": "KQ7P-3XRN",
//     "signalingServer": "ws://127.0.0.1:1234/ws",
//     "role": "host",
//     "publicUrl": "https://abc-def.trycloudflare.com",
//     "startedAt": 1730000000000,
//     "startRequested": false
//   }
//
// The extension *writes* the session fields; the dashboard writes
// `publicUrl` (the Cloudflare tunnel origin) and `startRequested`.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SessionState {
  roomId?: string;
  signalingServer?: string;
  role?: 'host' | 'guest';
  publicUrl?: string;
  startedAt?: number;
  startRequested?: boolean;
}

/** Absolute path of the session-state file. */
export function sessionStatePath(): string {
  const override = process.env.PROJECT_ERIC_COLLAB_STATE;
  if (override) return override;

  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'project-eric', 'collab-session.json');
  }
  const base =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'project-eric', 'collab-session.json');
}

/** Read the current state. Never throws. */
export function readSessionState(): SessionState {
  try {
    const file = sessionStatePath();
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Merge `patch` into the state and persist it.
 *
 * The write is atomic (temp file + rename) because the dashboard and the
 * extension may write at the same moment — a truncated file would make
 * both sides believe the session is broken.
 */
export function writeSessionState(patch: SessionState): SessionState {
  const file = sessionStatePath();
  const next = { ...readSessionState(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    /* best-effort — never break the caller */
  }
  return next;
}

/** Clear the whole state file. */
export function clearSessionState(): void {
  try {
    const file = sessionStatePath();
    if (fs.existsSync(file)) fs.writeFileSync(file, '{}', 'utf8');
  } catch {
    /* best-effort */
  }
}

/**
 * Consume the `startRequested` flag.
 *
 * Returns true exactly once per request: the flag is cleared before we
 * return, so a later poll does not start a second session.
 */
export function consumeStartRequest(): boolean {
  const state = readSessionState();
  if (!state.startRequested) return false;
  writeSessionState({ startRequested: false });
  return true;
}
