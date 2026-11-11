import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  BILLD_BEHAVIOR,
  BILLD_MSG,
  BILLD_ICE_SERVERS,
  getLocalDevice,
  saveLocalDevice,
  clearLocalDevice,
  isBilldAvailable,
  ensureLocalDevice,
  verifyDevice,
  isDeviceOnline,
  billdEnvelope,
  billdRequestId,
  buildGuestLink,
  parseGuestLink,
  copyToClipboard,
} from '../../src/services/billdDeskService.js';
import {
  sendBehavior,
  parseBehavior,
  pointerToRemote,
  attachScreenStream,
} from '../../src/services/billdSession.js';
import { mockFetch, jsonResponse, createMemoryStorage } from '../helpers/browser-globals.mjs';

const DEVICE_KEY = 'ericBilldDevice';

describe('services/billdDeskService — the protocol constants', () => {
  it('numbers the behaviour events from zero', () => {
    assert.equal(BILLD_BEHAVIOR.mouseMove, 0);
    assert.equal(BILLD_BEHAVIOR.keyboardType, 14);
  });

  it('names the upstream message types', () => {
    assert.equal(BILLD_MSG.offer, 'nativeWebRtcOffer');
    assert.equal(BILLD_MSG.answer, 'nativeWebRtcAnswer');
    assert.equal(BILLD_MSG.candidate, 'nativeWebRtcCandidate');
  });

  it('configures the STUN servers', () => {
    assert.ok(BILLD_ICE_SERVERS.length > 0);
    assert.ok(BILLD_ICE_SERVERS[0].urls.length > 0);
  });
});

describe('services/billdDeskService — the stored device', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('has no device to start with', () => {
    assert.equal(getLocalDevice(), null);
  });

  it('saves and reads back a device', () => {
    saveLocalDevice({ uuid: 'abc', password: 'pw' });
    assert.deepEqual(getLocalDevice(), { uuid: 'abc', password: 'pw' });
  });

  it('returns null for a device without a password', () => {
    globalThis.localStorage.setItem(DEVICE_KEY, JSON.stringify({ uuid: 'abc' }));
    assert.equal(getLocalDevice(), null);
  });

  it('returns null when the stored device is broken JSON', () => {
    globalThis.localStorage.setItem(DEVICE_KEY, '{not json');
    assert.equal(getLocalDevice(), null);
  });

  it('returns null when the storage throws', () => {
    globalThis.localStorage = createMemoryStorage({ failOnGet: true });
    assert.equal(getLocalDevice(), null);
  });

  it('clears the device', () => {
    saveLocalDevice({ uuid: 'abc', password: 'pw' });
    clearLocalDevice();
    assert.equal(getLocalDevice(), null);
  });

  it('does not throw when the storage refuses the write', () => {
    globalThis.localStorage = createMemoryStorage({ failOnSet: true });
    assert.doesNotThrow(() => saveLocalDevice({ uuid: 'abc', password: 'pw' }));
  });
});

describe('services/billdDeskService — the backend calls', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('reports availability when the health check answers', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ data: { ok: true } }));
    assert.equal(await isBilldAvailable(), true);
  });

  it('reports no availability when the backend is down', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await isBilldAvailable(), false);
  });

  it('reports no availability when the health check fails', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 500 }));
    assert.equal(await isBilldAvailable(), false);
  });

  it('reuses the stored device', async () => {
    saveLocalDevice({ uuid: 'abc', password: 'pw' });
    let called = false;
    restoreFetch = mockFetch(() => { called = true; return jsonResponse({}); });
    const device = await ensureLocalDevice();
    assert.deepEqual(device, { uuid: 'abc', password: 'pw' });
    assert.equal(called, false);
  });

  it('creates and stores a device on first use', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ data: { uuid: 'new1', password: 'pw1' } }));
    const device = await ensureLocalDevice();
    assert.deepEqual(device, { uuid: 'new1', password: 'pw1' });
    assert.deepEqual(getLocalDevice(), { uuid: 'new1', password: 'pw1' });
  });

  it('creates a fresh device when forced', async () => {
    saveLocalDevice({ uuid: 'old', password: 'pw' });
    restoreFetch = mockFetch(() =>
      jsonResponse({ data: { uuid: 'new1', password: 'pw1' } }));
    const device = await ensureLocalDevice({ force: true });
    assert.equal(device.uuid, 'new1');
  });

  it('rejects a device that fails the verification', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ data: { code: 0 } }));
    assert.equal(await verifyDevice('abc', 'bad'), false);
  });

  it('accepts a device that passes the verification', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ data: { code: 1 } }));
    assert.equal(await verifyDevice('abc', 'pw'), true);
  });

  it('reports a failed verification as false instead of throwing', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await verifyDevice('abc', 'pw'), false);
  });

  it('reports an online device', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ data: { receiver: 'socket-1' } }));
    assert.equal(await isDeviceOnline('abc'), true);
  });

  it('reports an offline device', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ data: {} }));
    assert.equal(await isDeviceOnline('abc'), false);
  });

  it('reports an offline device when the backend is down', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await isDeviceOnline('abc'), false);
  });
});

describe('services/billdDeskService — the envelope', () => {
  it('wraps the payload in the upstream shape', () => {
    const envelope = billdEnvelope({ id: 'socket-1' }, { hello: 'world' }, 'req-1');
    assert.equal(envelope.request_id, 'req-1');
    assert.equal(envelope.socket_id, 'socket-1');
    assert.deepEqual(envelope.data, { hello: 'world' });
    assert.ok(envelope.time > 0);
  });

  it('copes with a missing socket', () => {
    assert.equal(billdEnvelope(null, {}, 'r').socket_id, '');
  });

  it('generates an eight character request id', () => {
    assert.match(billdRequestId(), /^[a-z0-9]{8}$/);
  });

  it('does not always generate the same request id', () => {
    const ids = new Set(Array.from({ length: 20 }, () => billdRequestId()));
    assert.ok(ids.size > 1);
  });
});

describe('services/billdDeskService — the guest link', () => {
  it('builds a link with the device code', () => {
    const link = buildGuestLink({ publicUrl: 'https://x.trycloudflare.com', uuid: 'abc' });
    assert.ok(link.startsWith('https://x.trycloudflare.com/remote?'));
    assert.ok(link.includes('code=abc'));
  });

  it('embeds the password when it is given', () => {
    const link = buildGuestLink({ publicUrl: 'https://x', uuid: 'abc', password: 'pw' });
    assert.ok(link.includes('password=pw'));
  });

  it('returns an empty string without a URL or a code', () => {
    assert.equal(buildGuestLink({ uuid: 'abc' }), '');
    assert.equal(buildGuestLink({ publicUrl: 'https://x' }), '');
  });

  it('strips trailing slashes from the public URL', () => {
    const link = buildGuestLink({ publicUrl: 'https://x//', uuid: 'abc' });
    assert.ok(link.startsWith('https://x/remote?'));
  });

  it('parses a guest link back into its parts', () => {
    const parsed = parseGuestLink('https://x.trycloudflare.com/remote?code=ABC123&password=pw');
    assert.equal(parsed.uuid, 'abc123');
    assert.equal(parsed.password, 'pw');
  });

  it('parses a bare device code', () => {
    assert.deepEqual(parseGuestLink('ABC123'), { uuid: 'abc123', password: '' });
  });

  it('returns null for an empty input', () => {
    assert.equal(parseGuestLink(''), null);
    assert.equal(parseGuestLink(null), null);
  });

  it('returns null for text that is neither a link nor a code', () => {
    assert.equal(parseGuestLink('!!!'), null);
  });

  it('returns null for a link without a device code', () => {
    assert.equal(parseGuestLink('https://x/remote?password=pw'), null);
  });
});

describe('services/billdDeskService — copyToClipboard', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('returns false for an empty value', async () => {
    assert.equal(await copyToClipboard(''), false);
  });

  it('uses the clipboard API when it is available', async () => {
    let written = null;
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: async (t) => { written = t; } },
      writable: true,
      configurable: true,
    });
    assert.equal(await copyToClipboard('hello'), true);
    assert.equal(written, 'hello');
  });

  it('returns false when both paths fail', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: async () => { throw new Error('denied'); } },
      writable: true,
      configurable: true,
    });
    globalThis.document.execCommand = () => { throw new Error('not allowed'); };
    assert.equal(await copyToClipboard('hello'), false);
  });
});

describe('services/billdSession — the behaviour messages', () => {
  it('sends a behaviour message over an open channel', () => {
    const sent = [];
    const channel = { readyState: 'open', send: (data) => sent.push(data) };
    const ok = sendBehavior(channel, {
      roomId: 'r1', sender: 's1', receiver: 'r2', type: BILLD_BEHAVIOR.mouseMove, key: [10, 20],
    });
    assert.equal(ok, true);
    const parsed = JSON.parse(sent[0]);
    assert.equal(parsed.msgType, BILLD_MSG.behavior);
    assert.equal(parsed.data.type, BILLD_BEHAVIOR.mouseMove);
    assert.deepEqual(parsed.data.key, [10, 20]);
  });

  it('refuses to send on a channel that is not open', () => {
    const channel = { readyState: 'connecting', send: () => { throw new Error('sent'); } };
    assert.equal(sendBehavior(channel, { roomId: 'r', sender: 's', receiver: 'x', type: 0 }), false);
  });

  it('refuses to send without a channel', () => {
    assert.equal(sendBehavior(null, { roomId: 'r', sender: 's', receiver: 'x', type: 0 }), false);
  });

  it('parses a behaviour message', () => {
    const raw = JSON.stringify({
      msgType: BILLD_MSG.behavior,
      data: { roomId: 'r1', type: 2, key: [1, 2] },
    });
    const parsed = parseBehavior(raw);
    assert.equal(parsed.type, 2);
    assert.deepEqual(parsed.key, [1, 2]);
    assert.equal(parsed.roomId, 'r1');
  });

  it('parses a behaviour message from a buffer', () => {
    const raw = JSON.stringify({
      msgType: BILLD_MSG.behavior,
      data: { roomId: 'r1', type: 2, key: [1, 2] },
    });
    const parsed = parseBehavior(new TextEncoder().encode(raw));
    assert.equal(parsed.type, 2);
  });

  it('returns null for a message of another type', () => {
    assert.equal(parseBehavior(JSON.stringify({ msgType: 'other', data: {} })), null);
  });

  it('returns null for a broken message', () => {
    assert.equal(parseBehavior('{not json'), null);
  });

  it('returns null for an empty message', () => {
    assert.equal(parseBehavior(''), null);
    assert.equal(parseBehavior(null), null);
  });

  it('defaults the key to [0] when it is missing', () => {
    const raw = JSON.stringify({ msgType: BILLD_MSG.behavior, data: { type: 1 } });
    assert.deepEqual(parseBehavior(raw).key, [0]);
  });
});

describe('services/billdSession — pointerToRemote', () => {
  const video = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };

  it('maps a click to the remote coordinates', () => {
    assert.deepEqual(
      pointerToRemote({ clientX: 50, clientY: 25 }, video, { width: 200, height: 200 }),
      [100, 50],
    );
  });

  it('accounts for the video offset', () => {
    const offset = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100 }) };
    assert.deepEqual(
      pointerToRemote({ clientX: 60, clientY: 70 }, offset, { width: 100, height: 100 }),
      [50, 50],
    );
  });

  it('falls back to the video size when the screen size is unknown', () => {
    assert.deepEqual(
      pointerToRemote({ clientX: 50, clientY: 50 }, video, {}),
      [50, 50],
    );
  });

  it('does not divide by zero for a collapsed video', () => {
    const collapsed = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) };
    const [x, y] = pointerToRemote({ clientX: 5, clientY: 5 }, collapsed, { width: 10, height: 10 });
    assert.ok(Number.isFinite(x));
    assert.ok(Number.isFinite(y));
  });
});

describe('services/billdSession — attachScreenStream', () => {
  it('adds every track of the stream', () => {
    const added = [];
    const pc = { addTrack: (track) => added.push(track) };
    const stream = { getTracks: () => ['t1', 't2'] };
    attachScreenStream(pc, stream);
    assert.deepEqual(added, ['t1', 't2']);
  });
});
