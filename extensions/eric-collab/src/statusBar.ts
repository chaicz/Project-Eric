// statusBar.ts
// Status bar item that shows connection state, user count, and a quick-share
// button. Click cycles the menu of session actions.

import * as vscode from 'vscode';
import type { CollabState, UserPresence } from './types';
import type { TunnelState } from './tunnelManager';

export class CollabStatusBar {
  private item: vscode.StatusBarItem;
  private currentState: CollabState = 'idle';
  private currentRoom: string = '';
  private userCount: number = 0;
  private tunnelState: TunnelState = 'idle';
  private tunnelUrl: string | null = null;

  constructor(private readonly onClick: () => void) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'ericCollab.openPanel';
    this.item.tooltip = 'Click to manage Eric Collab session';
    this.item.text = '$(broadcast) Eric Collab: off';
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  setState(state: CollabState, roomId?: string): void {
    this.currentState = state;
    if (roomId) this.currentRoom = roomId;
    this.render();
  }

  setUserCount(count: number): void {
    this.userCount = count;
    this.render();
  }

  setTunnel(state: TunnelState, url?: string | null): void {
    this.tunnelState = state;
    if (url !== undefined) this.tunnelUrl = url;
    this.render();
  }

  private render(): void {
    const roomTag = this.currentRoom ? ` ${this.currentRoom}` : '';
    const tunnelTag = this.tunnelIcon();

    switch (this.currentState) {
      case 'idle':
        this.item.text = `${tunnelTag} $(broadcast) Eric Collab`;
        this.item.backgroundColor = undefined;
        break;
      case 'connecting':
        this.item.text = `${tunnelTag} $(loading~spin) Eric Collab: connecting${roomTag}`;
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        break;
      case 'connected':
        this.item.text = `${tunnelTag} $(broadcast) Eric Collab: live${roomTag} · ${this.userCount} user${this.userCount === 1 ? '' : 's'}`;
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.prominentBackground'
        );
        break;
      case 'reconnecting':
        this.item.text = `${tunnelTag} $(loading~spin) Eric Collab: reconnecting${roomTag}`;
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        break;
      case 'error':
        this.item.text = `${tunnelTag} $(error) Eric Collab: error${roomTag}`;
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground'
        );
        break;
    }
  }

  private tunnelIcon(): string {
    switch (this.tunnelState) {
      case 'live':
        return '$(globe)';
      case 'starting':
      case 'reconnecting':
        return '$(loading~spin)';
      case 'error':
        return '$(warning)';
      default:
        return '';
    }
  }
}
