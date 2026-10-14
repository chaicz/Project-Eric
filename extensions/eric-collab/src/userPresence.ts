// userPresence.ts
// Manages local user identity (name, color) and awareness state for the
// y-websocket awareness protocol.

import * as vscode from 'vscode';
import type { CollabPermission, UserPresence } from './types';

const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
];

function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export interface LocalUserContext {
  userId: string;
  name: string;
  color: string;
  setName(name: string): Promise<void>;
}

export async function ensureLocalUser(
  memento: vscode.Memento
): Promise<LocalUserContext> {
  let userId = memento.get<string>('ericCollab.userId');
  let name = memento.get<string>('ericCollab.userName');
  if (!userId) {
    userId = `u-${Math.random().toString(36).slice(2, 10)}`;
    await memento.update('ericCollab.userId', userId);
  }
  if (!name) {
    // Try the OS username, fall back to "Anonymous"
    const osUser =
      process.env.USERNAME ||
      process.env.USER ||
      'Anonymous';
    name = osUser;
    await memento.update('ericCollab.userName', name);
  }
  return {
    userId: userId!,
    name: name!,
    color: pickColor(userId!),
    async setName(newName: string) {
      const trimmed = newName.trim();
      if (!trimmed) return;
      name = trimmed;
      await memento.update('ericCollab.userName', trimmed);
    },
  };
}

export function presenceToUser(p: any): UserPresence | null {
  if (!p || !p.user) return null;
  return {
    userId: p.user.userId,
    name: p.user.name,
    color: p.user.color,
    permission: (p.permission as CollabPermission) || 'viewer',
    cursorLine: p.cursor?.anchor?.line,
    cursorChar: p.cursor?.head?.char,
    filePath: p.filePath,
    joinedAt: p.joinedAt ?? Date.now(),
    synced: true,
  };
}
