import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiCall,
  authAPI,
  publicAPI,
  dashboardAPI,
  reportAPI,
  API_ENDPOINTS,
  getToken,
  setToken,
  clearToken,
  blobToBase64,
  resolveAssetUrl,
} from '../../src/services/api.js';
import { mockFetch, jsonResponse, createMemoryStorage } from '../helpers/browser-globals.mjs';

// Every test starts with a clean storage. Without this, a test that
// installs a throwing storage leaks into the next describe block and
// makes an unrelated assertion fail.
beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

describe('services/api — token storage', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('stores and reads the token', () => {
    setToken('abc123');
    assert.equal(getToken(), 'abc123');
  });

  it('returns null when no token is stored', () => {
    assert.equal(getToken(), null);
  });

  it('clears the token', () => {
    setToken('abc123');
    clearToken();
    assert.equal(getToken(), null);
  });

  it('setToken(null) removes the token', () => {
    setToken('abc123');
    setToken(null);
    assert.equal(getToken(), null);
  });

  it('survives a storage that throws on read', () => {
    globalThis.localStorage = createMemoryStorage({ failOnGet: true });
    assert.equal(getToken(), null);
  });

  it('survives a storage that throws on write', () => {
    globalThis.localStorage = createMemoryStorage({ failOnSet: true });
    assert.doesNotThrow(() => setToken('abc123'));
  });
});

describe('services/api — apiCall', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('sends the token as a Bearer header', async () => {
    setToken('tok');
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: { ok: 1 } });
    });
    await apiCall('http://x/api');
    assert.equal(seen.headers.Authorization, 'Bearer tok');
  });

  it('omits the Authorization header when there is no token', async () => {
    clearToken();
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await apiCall('http://x/api');
    assert.equal(seen.headers.Authorization, undefined);
  });

  it('unwraps the `data` field of the PHP envelope', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, message: 'ok', data: { id: 7 } }));
    const result = await apiCall('http://x/api');
    assert.deepEqual(result, { id: 7 });
  });

  it('returns the payload itself when there is no `data` field', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ hello: 'world' }));
    const result = await apiCall('http://x/api');
    assert.deepEqual(result, { hello: 'world' });
  });

  it('throws a helpful error when the API cannot be reached', async () => {
    restoreFetch = mockFetch(() => undefined);   // triggers a network failure
    await assert.rejects(() => apiCall('http://x/api'), /Cannot reach the Project Eric API/);
  });

  it('throws when the server answers with an HTML error page', async () => {
    restoreFetch = mockFetch(() => jsonResponse('<html>404</html>', { ok: false, status: 404 }));
    await assert.rejects(() => apiCall('http://x/api'), /HTTP 404/);
  });

  it('throws when a successful response is not JSON', async () => {
    restoreFetch = mockFetch(() => jsonResponse('not json at all'));
    await assert.rejects(() => apiCall('http://x/api'), /unexpected response/);
  });

  it('throws the API error message when the payload reports a failure', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: false, error: 'Wrong password' }, { ok: false, status: 401 }));
    await assert.rejects(() => apiCall('http://x/api'), /Wrong password/);
  });

  it('falls back to `message` when the payload has no `error`', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: false, message: 'Something failed' }, { ok: false, status: 400 }));
    await assert.rejects(() => apiCall('http://x/api'), /Something failed/);
  });

  it('throws when success is false even though the HTTP status is 200', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: false, error: 'Rejected' }));
    await assert.rejects(() => apiCall('http://x/api'), /Rejected/);
  });

  it('handles an empty response body', async () => {
    restoreFetch = mockFetch(() => jsonResponse(''));
    const result = await apiCall('http://x/api');
    assert.equal(result, null);
  });
});

describe('services/api — authAPI', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
    globalThis.localStorage = createMemoryStorage();
  });

  it('login stores the returned token', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: true, data: { token: 'jwt', user: { id: 1 } } }));
    const data = await authAPI.login('a@b.c', 'pw');
    assert.equal(data.user.id, 1);
    assert.equal(getToken(), 'jwt');
  });

  it('login does not store a token when the server returns none', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: { user: { id: 1 } } }));
    await authAPI.login('a@b.c', 'pw');
    assert.equal(getToken(), null);
  });

  it('login propagates a wrong-password error', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: false, error: 'Invalid credentials' }, { ok: false, status: 401 }));
    await assert.rejects(() => authAPI.login('a@b.c', 'bad'), /Invalid credentials/);
  });

  it('loginWithTwoFactor exchanges the challenge for a token', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: { token: 'jwt2' } }));
    const data = await authAPI.loginWithTwoFactor({
      email: 'a@b.c', password: 'pw', challenge: 'ch', code: '123456',
    });
    assert.equal(data.token, 'jwt2');
    assert.equal(getToken(), 'jwt2');
  });

  it('register stores the token', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: { token: 'jwt3' } }));
    await authAPI.register({ email: 'a@b.c', password: 'pw' });
    assert.equal(getToken(), 'jwt3');
  });

  it('oauth stores the token', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: { token: 'jwt4' } }));
    await authAPI.oauth('google', { email: 'a@b.c' });
    assert.equal(getToken(), 'jwt4');
  });

  it('logout clears the token even when the server call fails', async () => {
    setToken('stale');
    restoreFetch = mockFetch(() => undefined);
    await assert.rejects(() => authAPI.logout());
    assert.equal(getToken(), null);
  });

  it('logout clears the token on a successful call', async () => {
    setToken('stale');
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: {} }));
    await authAPI.logout();
    assert.equal(getToken(), null);
  });

  it('forgotPassword posts the email', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await authAPI.forgotPassword('a@b.c');
    assert.equal(seen.method, 'POST');
    assert.ok(seen.body.includes('a@b.c'));
  });

  it('resetPassword posts the token and the new password', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await authAPI.resetPassword('rtoken', 'newpass');
    assert.ok(seen.body.includes('rtoken'));
    assert.ok(seen.body.includes('newpass'));
  });

  it('changePassword sends the current password too', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await authAPI.changePassword('old', 'new');
    assert.ok(seen.body.includes('old'));
    assert.ok(seen.body.includes('new'));
  });
});

describe('services/api — dashboardAPI', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('every read endpoint unwraps the data field', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: { ok: true } }));
    assert.deepEqual(await dashboardAPI.getDashboard(), { ok: true });
    assert.deepEqual(await dashboardAPI.getProjects(), { ok: true });
    assert.deepEqual(await dashboardAPI.getNotifications(), { ok: true });
    assert.deepEqual(await dashboardAPI.getSettings(), { ok: true });
  });

  it('saveSettings uses PUT', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await dashboardAPI.saveSettings({ notifications: { email: false } });
    assert.equal(seen.method, 'PUT');
  });

  it('saveSettings sends an empty object when the patch is missing', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await dashboardAPI.saveSettings();
    assert.equal(seen.body, '{}');
  });

  it('markNotificationRead sends the mark_read action', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await dashboardAPI.markNotificationRead(5);
    assert.ok(seen.body.includes('mark_read'));
    assert.ok(seen.body.includes('5'));
  });

  it('deleteReadNotifications sends the delete_all_read action', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await dashboardAPI.deleteReadNotifications();
    assert.equal(seen.method, 'DELETE');
    assert.ok(seen.body.includes('delete_all_read'));
  });

  it('removeTeamMember defaults the type to "member"', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await dashboardAPI.removeTeamMember(9);
    assert.ok(seen.body.includes('member'));
  });

  it('setupTwoFactor sends the setup action', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: { secret: 'ABC' } });
    });
    const data = await dashboardAPI.setupTwoFactor();
    assert.ok(seen.body.includes('setup'));
    assert.equal(data.secret, 'ABC');
  });

  it('disableTwoFactor sends the password', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await dashboardAPI.disableTwoFactor('secret');
    assert.ok(seen.body.includes('disable'));
    assert.ok(seen.body.includes('secret'));
  });

  it('surfaces an error when the account is not allowed', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ success: false, error: 'Forbidden' }, { ok: false, status: 403 }));
    await assert.rejects(() => dashboardAPI.getTeamMembers(), /Forbidden/);
  });
});

describe('services/api — reportAPI', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('lists the stored reports', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: [{ id: 1 }] }));
    const reports = await reportAPI.listReports();
    assert.equal(reports.length, 1);
  });

  it('builds a download URL with the token encoded', () => {
    const url = reportAPI.downloadUrl('abc/def');
    assert.ok(url.includes('token=abc%2Fdef'));
  });

  it('builds a download URL for an empty token', () => {
    assert.ok(reportAPI.downloadUrl('').includes('token='));
  });

  it('deleteReport sends the id', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ success: true, data: {} });
    });
    await reportAPI.deleteReport(3);
    assert.equal(seen.method, 'DELETE');
    assert.ok(seen.body.includes('3'));
  });
});

describe('services/api — blobToBase64', () => {
  it('strips the data URL prefix', async () => {
    const blob = new Blob(['hello'], { type: 'application/pdf' });
    const base64 = await blobToBase64(blob);
    assert.ok(!base64.startsWith('data:'));
    assert.equal(
      Buffer.from(base64, 'base64').toString('utf8'),
      'hello',
    );
  });

  it('rejects when the file cannot be read', async () => {
    const original = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsDataURL() {
        this.onerror?.(new Error('boom'));
      }
    };
    await assert.rejects(() => blobToBase64(new Blob(['x'])), /Could not read the PDF file/);
    globalThis.FileReader = original;
  });
});

describe('services/api — resolveAssetUrl', () => {
  it('returns null for an empty path', () => {
    assert.equal(resolveAssetUrl(''), null);
    assert.equal(resolveAssetUrl(null), null);
    assert.equal(resolveAssetUrl(undefined), null);
  });

  it('leaves an absolute URL alone', () => {
    assert.equal(resolveAssetUrl('https://cdn.example/a.png'), 'https://cdn.example/a.png');
    assert.equal(resolveAssetUrl('//cdn.example/a.png'), '//cdn.example/a.png');
  });

  it('leaves a data URL alone', () => {
    assert.equal(resolveAssetUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
  });

  it('prefixes a relative path with the API root', () => {
    const url = resolveAssetUrl('/uploads/avatars/a.png');
    assert.ok(url.endsWith('/uploads/avatars/a.png'));
    assert.ok(url.startsWith('http'));
  });

  it('adds the missing slash for a path without one', () => {
    const url = resolveAssetUrl('uploads/a.png');
    assert.ok(url.endsWith('/uploads/a.png'));
  });
});

describe('services/api — endpoints', () => {
  it('exposes the auth endpoints', () => {
    assert.ok(API_ENDPOINTS.AUTH.LOGIN.includes('/auth/login'));
    assert.ok(API_ENDPOINTS.AUTH.REGISTER.includes('/auth/register'));
    assert.ok(API_ENDPOINTS.AUTH.LOGOUT.includes('/auth/logout'));
  });

  it('the public API exposes the public reads', async () => {
    let restoreFetch = mockFetch(() => jsonResponse({ success: true, data: [] }));
    await publicAPI.getFeatures();
    await publicAPI.getTeam();
    await publicAPI.getInfo();
    restoreFetch();
  });
});
