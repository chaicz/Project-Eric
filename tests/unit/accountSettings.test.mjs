import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  withDefaults,
  readCachedSettings,
  cacheSettings,
  loadSettings,
  saveSettings,
} from '../../src/utils/accountSettings.js';
import { mockFetch, jsonResponse, createMemoryStorage } from '../helpers/browser-globals.mjs';

const USER_KEY = 'project-eric_user';

const signIn = (id) => {
  globalThis.localStorage.setItem(USER_KEY, JSON.stringify({ id }));
};

describe('utils/accountSettings — withDefaults', () => {
  it('returns the defaults for an empty object', () => {
    assert.deepEqual(withDefaults({}), DEFAULT_SETTINGS);
  });

  it('returns the defaults for null', () => {
    assert.deepEqual(withDefaults(null), DEFAULT_SETTINGS);
  });

  it('returns the defaults for a non-object', () => {
    assert.deepEqual(withDefaults('nonsense'), DEFAULT_SETTINGS);
    assert.deepEqual(withDefaults(42), DEFAULT_SETTINGS);
  });

  it('fills in the missing notification preferences', () => {
    const merged = withDefaults({ notifications: { email: false } });
    assert.equal(merged.notifications.email, false);
    assert.equal(merged.notifications.push, DEFAULT_SETTINGS.notifications.push);
  });

  it('fills in the missing appearance preferences', () => {
    const merged = withDefaults({ appearance: { theme: 'dark' } });
    assert.equal(merged.appearance.theme, 'dark');
    assert.equal(merged.appearance.accent, DEFAULT_SETTINGS.appearance.accent);
  });

  it('ignores a group that is not an object', () => {
    const merged = withDefaults({ notifications: 'broken' });
    assert.deepEqual(merged.notifications, DEFAULT_SETTINGS.notifications);
  });
});

describe('utils/accountSettings — the browser cache', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
  });

  it('reads the defaults when nothing is cached', () => {
    assert.deepEqual(readCachedSettings(), DEFAULT_SETTINGS);
  });

  it('caches and reads back a settings object', () => {
    cacheSettings({ notifications: { email: false } });
    assert.equal(readCachedSettings().notifications.email, false);
  });

  it('keeps the cache scoped to the account', () => {
    cacheSettings({ notifications: { email: false } });
    signIn(2);
    assert.equal(readCachedSettings().notifications.email, true);
  });
});

describe('utils/accountSettings — loadSettings', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('returns the settings from the API', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: true, data: { settings: { notifications: { email: false } } } }));
    const result = await loadSettings();
    assert.equal(result.fromCache, false);
    assert.equal(result.settings.notifications.email, false);
  });

  it('caches what the API returned', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: true, data: { settings: { appearance: { theme: 'dark' } } } }));
    await loadSettings();
    assert.equal(readCachedSettings().appearance.theme, 'dark');
  });

  it('falls back to the cache when the API cannot be reached', async () => {
    cacheSettings({ notifications: { email: false } });
    restoreFetch = mockFetch(() => undefined);
    const result = await loadSettings();
    assert.equal(result.fromCache, true);
    assert.equal(result.settings.notifications.email, false);
  });

  it('falls back to the defaults when the API fails and nothing is cached', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: false, error: 'Forbidden' }, { ok: false, status: 403 }));
    const result = await loadSettings();
    assert.equal(result.fromCache, true);
    assert.deepEqual(result.settings, DEFAULT_SETTINGS);
  });
});

describe('utils/accountSettings — saveSettings', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('saves the patch and reports success', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: {} }));
    const result = await saveSettings({ notifications: { email: false } });
    assert.equal(result.ok, true);
    assert.equal(result.settings.notifications.email, false);
  });

  it('applies the change to the cache immediately', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: {} }));
    await saveSettings({ notifications: { email: false } });
    assert.equal(readCachedSettings().notifications.email, false);
  });

  it('rolls the cache back when the server refuses the change', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: false, error: 'Rejected' }, { ok: false, status: 400 }));
    cacheSettings({ notifications: { email: true } });
    const result = await saveSettings({ notifications: { email: false } });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Rejected');
    assert.equal(readCachedSettings().notifications.email, true);
  });

  it('reports a generic message when the failure carries none', async () => {
    restoreFetch = mockFetch(() => undefined);
    const result = await saveSettings({ notifications: { email: false } });
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  });

  it('merges a partial patch into the cached settings', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: {} }));
    cacheSettings({ notifications: { weeklyReport: true } });
    await saveSettings({ notifications: { email: false } });
    const cached = readCachedSettings();
    assert.equal(cached.notifications.email, false);
    assert.equal(cached.notifications.weeklyReport, true);
  });
});
