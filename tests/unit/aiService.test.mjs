import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_PROVIDERS,
  detectProvider,
  getAIConfig,
  saveAIConfig,
  hasAIKey,
  callAI,
  testAIConnection,
  extractCodeBlock,
} from '../../src/services/aiService.js';
import { mockFetch, jsonResponse, createMemoryStorage } from '../helpers/browser-globals.mjs';

const USER_KEY = 'project-eric_user';

const signIn = (id) => {
  globalThis.localStorage.setItem(USER_KEY, JSON.stringify({ id }));
};

describe('services/aiService — detectProvider', () => {
  it('detects an OpenAI key', () => {
    assert.equal(detectProvider('sk-abc123').provider, 'openai');
  });

  it('detects an Anthropic key', () => {
    assert.equal(detectProvider('sk-ant-abc123').provider, 'anthropic');
  });

  it('detects an OpenRouter key', () => {
    assert.equal(detectProvider('sk-or-abc123').provider, 'openrouter');
  });

  it('detects a Grok key', () => {
    assert.equal(detectProvider('xk-abc123').provider, 'grok');
  });

  it('detects a Google key', () => {
    assert.equal(detectProvider('AIzaSyABC123').provider, 'google');
  });

  it('detects a Cursor key', () => {
    assert.equal(detectProvider('cursor-abc123').provider, 'cursor');
  });

  it('ignores surrounding whitespace', () => {
    assert.equal(detectProvider('  sk-abc123  ').provider, 'openai');
  });

  it('recommends the provider’s default model', () => {
    assert.equal(detectProvider('sk-ant-x').model, AI_PROVIDERS.anthropic.defaultModel);
  });

  it('returns null for an unrecognised key', () => {
    assert.equal(detectProvider('nonsense-key'), null);
  });

  it('returns null for an empty or non-string key', () => {
    assert.equal(detectProvider(''), null);
    assert.equal(detectProvider(null), null);
    assert.equal(detectProvider(undefined), null);
    assert.equal(detectProvider(12345), null);
  });
});

describe('services/aiService — the stored config', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
  });

  it('starts with the first provider and no key', () => {
    const cfg = getAIConfig();
    assert.equal(cfg.provider, 'openai');
    assert.equal(cfg.apiKey, '');
    assert.equal(cfg.model, AI_PROVIDERS.openai.defaultModel);
  });

  it('saves and reads back a config', () => {
    saveAIConfig({ provider: 'anthropic', apiKey: 'sk-ant-xyz', model: 'claude-sonnet-5' });
    const cfg = getAIConfig();
    assert.equal(cfg.provider, 'anthropic');
    assert.equal(cfg.apiKey, 'sk-ant-xyz');
    assert.equal(cfg.model, 'claude-sonnet-5');
  });

  it('keeps the key scoped to the signed-in account', () => {
    saveAIConfig({ provider: 'openai', apiKey: 'sk-secret' });
    signIn(2);
    assert.equal(getAIConfig().apiKey, '');
  });

  it('backfills a missing model with the provider default', () => {
    saveAIConfig({ provider: 'google', apiKey: 'AIzaX' });
    const cfg = getAIConfig();
    assert.equal(cfg.model, AI_PROVIDERS.google.defaultModel);
  });

  it('migrates a deprecated model id to the current default', () => {
    saveAIConfig({ provider: 'openai', apiKey: 'sk-x', model: 'gpt-4o' });
    assert.equal(getAIConfig().model, AI_PROVIDERS.openai.defaultModel);
  });

  it('replaces a model the provider no longer offers', () => {
    saveAIConfig({ provider: 'google', apiKey: 'AIzaX', model: 'some-future-model' });
    assert.equal(getAIConfig().model, AI_PROVIDERS.google.defaultModel);
  });

  it('falls back to the defaults when the storage holds broken JSON', () => {
    globalThis.localStorage.setItem('project-eric_ai_config:1', '{not json');
    assert.equal(getAIConfig().provider, 'openai');
  });

  it('falls back to the defaults when the storage throws', () => {
    globalThis.localStorage = createMemoryStorage({ failOnGet: true });
    assert.equal(getAIConfig().provider, 'openai');
  });

  it('reports whether a usable key is present', () => {
    assert.equal(hasAIKey(), false);
    saveAIConfig({ provider: 'openai', apiKey: 'sk-longenoughkey' });
    assert.equal(hasAIKey(), true);
  });

  it('does not count a very short key as a key', () => {
    saveAIConfig({ provider: 'openai', apiKey: 'short' });
    assert.equal(hasAIKey(), false);
  });
});

describe('services/aiService — callAI', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('throws when no API key is configured', async () => {
    await assert.rejects(() => callAI([{ role: 'user', content: 'hi' }]), /No AI API key configured/);
  });

  it('throws for an unknown provider', async () => {
    await assert.rejects(
      () => callAI([{ role: 'user', content: 'hi' }], { provider: 'nope', apiKey: 'sk-x' }),
      /Unknown AI provider/,
    );
  });

  it('returns the reply text for an OpenAI-compatible provider', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'pong' } }] }));
    const reply = await callAI([{ role: 'user', content: 'hi' }], { apiKey: 'sk-x' });
    assert.equal(reply, 'pong');
  });

  it('sends the Bearer token in the Authorization header', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    await callAI([{ role: 'user', content: 'hi' }], { apiKey: 'sk-x' });
    assert.equal(seen.headers.Authorization, 'Bearer sk-x');
  });

  it('puts the system prompt first in the message list', async () => {
    let body;
    restoreFetch = mockFetch((url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    await callAI([{ role: 'user', content: 'hi' }], {
      apiKey: 'sk-x',
      systemPrompt: 'be brief',
    });
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, 'be brief');
  });

  it('drops a system role that was passed inside the message list', async () => {
    let body;
    restoreFetch = mockFetch((url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    await callAI([
      { role: 'system', content: 'ignored' },
      { role: 'user', content: 'hi' },
    ], { apiKey: 'sk-x', systemPrompt: 'be brief' });
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages.filter((m) => m.role === 'system').length, 1);
  });

  it('reads the Anthropic reply shape', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ content: [{ text: 'hello from claude' }] }));
    const reply = await callAI([{ role: 'user', content: 'hi' }], {
      provider: 'anthropic', apiKey: 'sk-ant-x',
    });
    assert.equal(reply, 'hello from claude');
  });

  it('sends the Anthropic key in the x-api-key header', async () => {
    let seen;
    restoreFetch = mockFetch((url, options) => {
      seen = options;
      return jsonResponse({ content: [{ text: 'ok' }] });
    });
    await callAI([{ role: 'user', content: 'hi' }], {
      provider: 'anthropic', apiKey: 'sk-ant-x',
    });
    assert.equal(seen.headers['x-api-key'], 'sk-ant-x');
  });

  it('reads the Gemini reply shape', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'gemini says hi' }] } }] }));
    const reply = await callAI([{ role: 'user', content: 'hi' }], {
      provider: 'google', apiKey: 'AIzaX',
    });
    assert.equal(reply, 'gemini says hi');
  });

  it('maps the assistant role onto the Gemini "model" role', async () => {
    let body;
    restoreFetch = mockFetch((url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    });
    await callAI([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ], { provider: 'google', apiKey: 'AIzaX' });
    assert.equal(body.contents[1].role, 'model');
  });

  it('throws the provider status when the request is rejected', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse('rate limited', { ok: false, status: 429 }));
    await assert.rejects(
      () => callAI([{ role: 'user', content: 'hi' }], { apiKey: 'sk-x' }),
      /OpenAI 429/,
    );
  });

  it('returns an empty string when the reply has no content', async () => {
    restoreFetch = mockFetch(() => jsonResponse({ choices: [] }));
    const reply = await callAI([{ role: 'user', content: 'hi' }], { apiKey: 'sk-x' });
    assert.equal(reply, '');
  });

  it('propagates a network failure', async () => {
    restoreFetch = mockFetch(() => undefined);
    await assert.rejects(() => callAI([{ role: 'user', content: 'hi' }], { apiKey: 'sk-x' }));
  });
});

describe('services/aiService — testAIConnection', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
  });

  it('reports success and the reply', async () => {
    restoreFetch = mockFetch(() =>
      jsonResponse({ choices: [{ message: { content: '  pong  ' } }] }));
    const result = await testAIConnection({ apiKey: 'sk-x' });
    assert.equal(result.ok, true);
    assert.equal(result.reply, 'pong');
  });

  it('reports the error instead of throwing', async () => {
    restoreFetch = mockFetch(() => jsonResponse('boom', { ok: false, status: 500 }));
    const result = await testAIConnection({ apiKey: 'sk-x' });
    assert.equal(result.ok, false);
    assert.match(result.error, /OpenAI 500/);
  });

  it('reports the missing key instead of throwing', async () => {
    const result = await testAIConnection();
    assert.equal(result.ok, false);
    assert.match(result.error, /No AI API key configured/);
  });
});

describe('services/aiService — extractCodeBlock', () => {
  it('extracts a fenced block', () => {
    assert.equal(extractCodeBlock('```js\nconst a = 1;\n```'), 'const a = 1;');
  });

  it('extracts a fence without a language tag', () => {
    assert.equal(extractCodeBlock('```\nplain\n```'), 'plain');
  });

  it('returns the whole reply when there is no fence', () => {
    assert.equal(extractCodeBlock('  const a = 1;  '), 'const a = 1;');
  });

  it('returns an empty string for an empty reply', () => {
    assert.equal(extractCodeBlock(''), '');
    assert.equal(extractCodeBlock(null), '');
    assert.equal(extractCodeBlock(undefined), '');
  });
});
