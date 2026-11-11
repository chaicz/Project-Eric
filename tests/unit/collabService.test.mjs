import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateRoomCode,
  isCollabAvailable,
  getTunnelStatus,
  startTunnel,
  stopTunnel,
  getSession,
  requestSession,
  pickGuestServer,
  buildGuestLink,
  buildHostPreviewLink,
  parseShareLink,
  copyToClipboard,
} from '../../src/services/collabService.js';
import { mockFetch, jsonResponse, createMemoryStorage } from '../helpers/browser-globals.mjs';

describe('services/collabService — generateRoomCode', () => {
  it('returns a code in the XXXX-XXXX shape', () => {
    assert.match(generateRoomCode(), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('never uses the characters that are easy to misread', () => {
    for (let i = 0; i < 50; i++) {
      assert.ok(!/[01OI]/.test(generateRoomCode()));
    }
  });

  it('does not always return the same code', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    assert.ok(codes.size > 1);
  });
});

describe('services/collabService — the tunnel endpoints', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('reports availability when the middleware answers', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ ok: true }));
    assert.equal(await isCollabAvailable(), true);
  });

  it('reports no availability when the middleware is missing', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await isCollabAvailable(), false);
  });

  it('reports no availability when the status is an error', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 500 }));
    assert.equal(await isCollabAvailable(), false);
  });

  it('reads the tunnel status', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ publicUrl: 'https://x.trycloudflare.com' }));
    const status = await getTunnelStatus();
    assert.equal(status.publicUrl, 'https://x.trycloudflare.com');
  });

  it('throws when the tunnel status cannot be read', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 503 }));
    await assert.rejects(() => getTunnelStatus(), /Tunnel status failed \(503\)/);
  });

  it('starts the tunnel', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ publicUrl: 'https://x.trycloudflare.com' }));
    const result = await startTunnel();
    assert.equal(result.ok, true);
    assert.equal(result.publicUrl, 'https://x.trycloudflare.com');
  });

  it('reports the error when the tunnel cannot be started', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ error: 'cloudflared missing' }, { ok: false, status: 500 }));
    const result = await startTunnel();
    assert.equal(result.ok, false);
    assert.equal(result.error, 'cloudflared missing');
  });

  it('falls back to a generic message when the failure carries none', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 500 }));
    const result = await startTunnel();
    assert.match(result.error, /Could not start the tunnel \(500\)/);
  });

  it('reports no availability when the dev server is not running', async () => {
    restoreFetch = mockFetch(() => undefined);
    const result = await startTunnel();
    assert.equal(result.ok, false);
    assert.match(result.error, /collaboration service is not running/);
  });

  it('stops the tunnel', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}));
    assert.equal(await stopTunnel(), true);
  });

  it('reports a failed stop as false', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 500 }));
    assert.equal(await stopTunnel(), false);
  });

  it('reports a failed stop as false when the server is gone', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await stopTunnel(), false);
  });
});

describe('services/collabService — the session endpoints', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('reads the session', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ room: 'ABCD-1234', role: 'host' }));
    const session = await getSession();
    assert.equal(session.room, 'ABCD-1234');
  });

  it('throws when the session cannot be read', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 404 }));
    await assert.rejects(() => getSession(), /Session status failed \(404\)/);
  });

  it('requests a session start', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ ok: true });
    });
    const result = await requestSession('start');
    assert.equal(result.ok, true);
    assert.ok(seen.body.includes('start'));
  });

  it('reports a rejected session request', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ error: 'no room' }, { ok: false, status: 409 }));
    const result = await requestSession();
    assert.equal(result.ok, false);
    assert.equal(result.error, 'no room');
  });

  it('reports the missing service instead of throwing', async () => {
    restoreFetch = mockFetch(() => undefined);
    const result = await requestSession();
    assert.equal(result.ok, false);
    assert.match(result.error, /collaboration service is not running/);
  });
});

describe('services/collabService — pickGuestServer', () => {
  it('routes through the tunnel for a local relay', () => {
    const server = pickGuestServer({
      publicUrl: 'https://x.trycloudflare.com',
      signalingServer: 'ws://127.0.0.1:1234/ws',
    });
    assert.equal(server, 'wss://x.trycloudflare.com/collab-ws');
  });

  it('uses a public relay directly', () => {
    const server = pickGuestServer({
      publicUrl: 'https://x.trycloudflare.com',
      signalingServer: 'wss://demos.yjs.dev/ws',
    });
    assert.equal(server, 'wss://demos.yjs.dev/ws');
  });

  it('routes through the tunnel when no relay is known', () => {
    assert.equal(
      pickGuestServer({ publicUrl: 'https://x.trycloudflare.com' }),
      'wss://x.trycloudflare.com/collab-ws',
    );
  });

  it('returns an empty string without a public URL', () => {
    assert.equal(pickGuestServer({}), '');
    assert.equal(pickGuestServer({ publicUrl: '' }), '');
  });

  it('strips trailing slashes from the public URL', () => {
    assert.equal(
      pickGuestServer({ publicUrl: 'https://x.trycloudflare.com//' }),
      'wss://x.trycloudflare.com/collab-ws',
    );
  });
});

describe('services/collabService — buildGuestLink', () => {
  it('builds a viewer link with the room and the server', () => {
    const link = buildGuestLink({
      publicUrl: 'https://x.trycloudflare.com',
      room: 'ABCD-1234',
    });
    assert.ok(link.startsWith('https://x.trycloudflare.com/viewer?'));
    assert.ok(link.includes('room=ABCD-1234'));
    assert.ok(link.includes('server='));
  });

  it('honours an explicit server override', () => {
    const link = buildGuestLink({
      publicUrl: 'https://x.trycloudflare.com',
      room: 'ABCD-1234',
      server: 'wss://relay.example/ws',
    });
    assert.ok(link.includes('server=wss%3A%2F%2Frelay.example%2Fws'));
  });

  it('returns an empty string without a URL or a room', () => {
    assert.equal(buildGuestLink({ room: 'ABCD-1234' }), '');
    assert.equal(buildGuestLink({ publicUrl: 'https://x' }), '');
  });

  it('builds the same link for the host preview', () => {
    const opts = { publicUrl: 'https://x.trycloudflare.com', room: 'ABCD-1234' };
    assert.equal(buildHostPreviewLink(opts), buildGuestLink(opts));
  });
});

describe('services/collabService — parseShareLink', () => {
  it('parses a bare room code', () => {
    const parsed = parseShareLink('abcd-1234');
    assert.equal(parsed.room, 'ABCD-1234');
    assert.equal(parsed.server, '');
  });

  it('parses a full share link', () => {
    const parsed = parseShareLink('https://x.trycloudflare.com/viewer?room=ABCD-1234&server=wss%3A%2F%2Fx');
    assert.equal(parsed.room, 'ABCD-1234');
    assert.equal(parsed.server, 'wss://x');
  });

  it('parses the legacy query parameter names', () => {
    const parsed = parseShareLink('https://x/viewer?ericCollabRoom=ABCD-1234&ericCollabServer=wss%3A%2F%2Fx');
    assert.equal(parsed.room, 'ABCD-1234');
    assert.equal(parsed.server, 'wss://x');
  });

  it('returns null for an empty input', () => {
    assert.equal(parseShareLink(''), null);
    assert.equal(parseShareLink(null), null);
    assert.equal(parseShareLink('   '), null);
  });

  it('returns null for a link without a room', () => {
    assert.equal(parseShareLink('https://x/viewer?server=wss://x'), null);
  });

  it('returns null for text that is neither a code nor a link', () => {
    assert.equal(parseShareLink('not a room code'), null);
  });
});

describe('services/collabService — copyToClipboard', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('returns false for an empty value', async () => {
    assert.equal(await copyToClipboard(''), false);
    assert.equal(await copyToClipboard(null), false);
  });

  it('uses the async clipboard API when it is available', async () => {
    let written = null;
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: async (t) => { written = t; } },
      writable: true,
      configurable: true,
    });
    assert.equal(await copyToClipboard('hello'), true);
    assert.equal(written, 'hello');
  });

  it('falls back to execCommand when the clipboard API throws', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: async () => { throw new Error('denied'); } },
      writable: true,
      configurable: true,
    });
    globalThis.document.execCommand = () => true;
    assert.equal(await copyToClipboard('hello'), true);
  });

  it('returns false when the fallback also fails', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: async () => { throw new Error('denied'); } },
      writable: true,
      configurable: true,
    });
    globalThis.document.execCommand = () => { throw new Error('not allowed'); };
    assert.equal(await copyToClipboard('hello'), false);
  });
});
