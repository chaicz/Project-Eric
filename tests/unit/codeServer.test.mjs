import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_SERVER_URL,
  CODE_SERVER_HEALTHZ,
  CODE_SERVER_EMBED_PATH,
  CODE_SERVER_FALLBACK_WORKSPACE,
  probeCodeServer,
  getCodeServerStatus,
  controlCodeServer,
  startCodeServer,
  stopCodeServer,
  waitForCodeServer,
  buildWorkbenchUrl,
  buildEmbeddedWorkbenchUrl,
  getUserWorkspace,
  launchUserWorkbench,
  getUserWorkbenchStatus,
  _resetWorkspaceCache,
} from '../../src/services/codeServer.js';
import { mockFetch, jsonResponse, createMemoryStorage } from '../helpers/browser-globals.mjs';

describe('services/codeServer — the constants', () => {
  it('points the health check at the workbench', () => {
    assert.equal(CODE_SERVER_HEALTHZ, `${CODE_SERVER_URL}/healthz`);
  });

  it('uses a same-origin embed path', () => {
    assert.equal(CODE_SERVER_EMBED_PATH, '/vscode');
  });

  it('has a fallback workspace', () => {
    assert.ok(CODE_SERVER_FALLBACK_WORKSPACE.length > 0);
  });
});

describe('services/codeServer — probeCodeServer', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('reports running when the health check answers', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ ok: true }));
    assert.equal(await probeCodeServer(), true);
  });

  it('reports not running when the workbench is down', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await probeCodeServer(), false);
  });

  it('reports not running when the health check answers with an error', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 502 }));
    assert.equal(await probeCodeServer(), false);
  });

  it('probes the /healthz path of the given URL', async () => {
    let seen;
    restoreFetch = mockFetch((url) => {
      seen = url;
      return jsonResponse({});
    });
    await probeCodeServer({ url: 'http://127.0.0.1:9999' });
    assert.equal(seen, 'http://127.0.0.1:9999/healthz');
  });
});

describe('services/codeServer — getCodeServerStatus', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    // The module remembers the last known workspace, so it has to be
    // cleared between tests.
    _resetWorkspaceCache();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('reads the managed status from the dev middleware', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ running: true, workspace: 'C:\\work', managed: true, url: 'http://x' }));
    const status = await getCodeServerStatus();
    assert.equal(status.running, true);
    assert.equal(status.managed, true);
    assert.equal(status.workspace, 'C:\\work');
  });

  it('falls back to the probe when the dev middleware is missing', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('/api/code-server/status')) return undefined;
      return jsonResponse({ ok: true });
    });
    const status = await getCodeServerStatus();
    assert.equal(status.managed, false);
    assert.equal(status.running, true);
  });

  it('reports not running when nothing answers', async () => {
    restoreFetch = mockFetch(() => undefined);
    const status = await getCodeServerStatus();
    assert.equal(status.running, false);
    assert.equal(status.managed, false);
  });

  it('falls back to the default workspace when the API does not name one', async () => {
    restoreFetch = mockFetch((url) => {
      if (String(url).includes('/api/code-server/status')) {
        return jsonResponse({ running: false, managed: true });
      }
      return undefined;
    });
    const status = await getCodeServerStatus();
    assert.equal(status.workspace, CODE_SERVER_FALLBACK_WORKSPACE);
  });
});

describe('services/codeServer — controlCodeServer', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('starts the workbench', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ ok: true });
    });
    const result = await startCodeServer();
    assert.equal(result.ok, true);
    assert.equal(seen.method, 'POST');
    assert.ok(seen.body.includes('start'));
  });

  it('stops the workbench', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ ok: true });
    });
    const result = await stopCodeServer();
    assert.equal(result.ok, true);
    assert.ok(seen.body.includes('stop'));
  });

  it('reports the error when the start is refused', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ error: 'already running' }, { ok: false, status: 409 }));
    const result = await startCodeServer();
    assert.equal(result.ok, false);
    assert.equal(result.error, 'already running');
  });

  it('falls back to a generic message when the failure carries none', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 500 }));
    const result = await startCodeServer();
    assert.equal(result.ok, false);
    assert.match(result.error, /Could not start code-server/);
  });

  it('explains that the dev server is missing', async () => {
    restoreFetch = mockFetch(() => undefined);
    const result = await startCodeServer();
    assert.equal(result.ok, false);
    assert.match(result.error, /not running its dev server/);
  });
});

describe('services/codeServer — waitForCodeServer', () => {
  let restoreFetch;

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('returns true as soon as the workbench answers', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ ok: true }));
    assert.equal(await waitForCodeServer({ intervalMs: 1 }), true);
  });

  it('returns false when the deadline passes', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await waitForCodeServer({ timeoutMs: 20, intervalMs: 5 }), false);
  });

  it('reports each tick', async () => {
    restoreFetch = mockFetch(() => undefined);
    let ticks = 0;
    await waitForCodeServer({
      timeoutMs: 20, intervalMs: 5, onTick: () => { ticks++; },
    });
    assert.ok(ticks > 0);
  });
});

describe('services/codeServer — the workbench URLs', () => {
  beforeEach(() => {
    _resetWorkspaceCache();
  });

  it('builds a URL with the folder as an absolute POSIX path', () => {
    const url = buildWorkbenchUrl({ folder: 'C:\\Users\\Public\\ide' });
    assert.ok(url.includes('folder=%2FC%3A%2FUsers%2FPublic%2Fide'));
  });

  it('falls back to the default workspace', () => {
    const url = buildWorkbenchUrl();
    assert.ok(url.includes('folder='));
    assert.ok(url.includes(encodeURIComponent(CODE_SERVER_FALLBACK_WORKSPACE.replace(/\\/g, '/'))));
  });

  it('builds a same-origin embedded URL', () => {
    const url = buildEmbeddedWorkbenchUrl({ folder: 'C:\\work' });
    assert.ok(url.startsWith(CODE_SERVER_EMBED_PATH));
    assert.ok(url.includes('folder=%2FC%3A%2Fwork'));
  });
});

describe('services/codeServer — the per-account workbench', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    _resetWorkspaceCache();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('reads the account workspace', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({
        success: true,
        data: {
          user: { id: 1, email: 'a@b.c' },
          workspace: { name: 'eric-1', path: 'C:\\ws\\eric-1', codeServerUrl: 'http://x:8080' },
        },
      }));
    const result = await getUserWorkspace();
    assert.equal(result.user.email, 'a@b.c');
    assert.equal(result.workspace.name, 'eric-1');
    assert.equal(result.workspace.codeServerUrl, 'http://x:8080');
  });

  it('returns null when the account has no workspace', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ success: true, data: { user: { id: 1 } } }));
    assert.equal(await getUserWorkspace(), null);
  });

  it('returns null when the API cannot be reached', async () => {
    restoreFetch = mockFetch(() => undefined);
    assert.equal(await getUserWorkspace(), null);
  });

  it('refuses to launch without a workspace name', async () => {
    const result = await launchUserWorkbench({});
    assert.equal(result.ok, false);
    assert.match(result.error, /no workspace yet/);
  });

  it('launches the workbench', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ ok: true, url: 'http://x:8080', path: 'C:\\ws', port: 8080 });
    });
    const result = await launchUserWorkbench({ workspaceName: 'eric-1' });
    assert.equal(result.ok, true);
    assert.equal(result.url, 'http://x:8080');
    assert.ok(seen.body.includes('eric-1'));
  });

  it('reports the error when the launch is refused', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ error: 'no folder' }, { ok: false, status: 400 }));
    const result = await launchUserWorkbench({ workspaceName: 'eric-1' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'no folder');
  });

  it('reports the missing dev server instead of throwing', async () => {
    restoreFetch = mockFetch(() => undefined);
    const result = await launchUserWorkbench({ workspaceName: 'eric-1' });
    assert.equal(result.ok, false);
    assert.match(result.error, /not running its dev server/);
  });

  it('reports the workbench status', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ running: true, url: 'http://x:8080' }));
    const status = await getUserWorkbenchStatus({ workspaceName: 'eric-1' });
    assert.equal(status.running, true);
    assert.equal(status.url, 'http://x:8080');
  });

  it('reports not running without a workspace name', async () => {
    const status = await getUserWorkbenchStatus({});
    assert.equal(status.running, false);
    assert.equal(status.url, null);
  });

  it('reports not running when the status call fails', async () => {
    restoreFetch = mockFetch(() => jsonResponse({}, { ok: false, status: 500 }));
    const status = await getUserWorkbenchStatus({ workspaceName: 'eric-1' });
    assert.equal(status.running, false);
  });

  it('reports not running when the status call cannot be made', async () => {
    restoreFetch = mockFetch(() => undefined);
    const status = await getUserWorkbenchStatus({ workspaceName: 'eric-1' });
    assert.equal(status.running, false);
  });
});
