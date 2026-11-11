// collab-session.js
// ---------------------------------------------------------------------------
// Shared, on-disk state for the Eric Collab session.
//
// Two very different processes need to agree on "which room is live":
//
//   • The Eric Collab extension, which runs inside code-server and owns
//     the real editing session.
//   • The dashboard (Vite dev server), which shows the share link to the
//     user and lets them open the tunnel.
//
// They can't talk to each other directly over a socket without a lot of
// plumbing, so they exchange a small JSON file on disk instead. The file
// lives under the per-user app-data directory, which both processes can
// locate independently:
//
//   Windows : %LOCALAPPDATA%\project-eric\collab-session.json
//   macOS   : ~/.project-eric/collab-session.json
//   Linux   : $XDG_STATE_HOME/project-eric/collab-session.json  (or ~/.local/state/…)
//
// Shape:
//   {
//     "roomId": "KQ7P-3XRN",
//     "signalingServer": "ws://127.0.0.1:1234/ws",
//     "role": "host",
//     "startedAt": 1730000000000,
//     "startRequested": false
//   }
//
// `startRequested` is the one-way handshake that lets the dashboard ask
// the extension to begin a session ("Start sharing" button) without the
// dashboard having to know anything about VS Code's command system. The
// extension clears the flag once it has acted on it.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** Absolute path of the session-state file. */
export function sessionStatePath() {
  if (process.env.PROJECT_ERIC_COLLAB_STATE) {
    return process.env.PROJECT_ERIC_COLLAB_STATE;
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
    return path.join(base, 'project-eric', 'collab-session.json');
  }
  const base =
    process.env.XDG_STATE_HOME || path.join(homedir(), '.local', 'state');
  return path.join(base, 'project-eric', 'collab-session.json');
}

/**
 * Read the current session state.
 * @returns {object} always an object; missing/invalid files yield `{}`.
 */
export function readSessionState() {
  const file = sessionStatePath();
  try {
    if (!existsSync(file)) return {};
    const raw = readFileSync(file, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Merge `patch` into the session state and persist it.
 *
 * The write is atomic (write to a temp file, then rename) because the
 * extension and the dev server may write at the same moment — a
 * half-written file would make both sides think the session is broken.
 *
 * @param {object} patch
 * @returns {object} the new state
 */
export function writeSessionState(patch = {}) {
  const file = sessionStatePath();
  const next = { ...readSessionState(), ...patch };
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    renameSync(tmp, file);
  } catch {
    /* state is best-effort — never break the caller over it */
  }
  return next;
}

/** Clear the session state file. */
export function clearSessionState() {
  try {
    const file = sessionStatePath();
    if (existsSync(file)) writeFileSync(file, '{}', 'utf8');
  } catch {
    /* best-effort */
  }
}

export default {
  sessionStatePath,
  readSessionState,
  writeSessionState,
  clearSessionState,
};
