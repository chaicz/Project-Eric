import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  getGeminiKey,
  saveGeminiKey,
  hasGeminiKey,
  resetGeminiModel,
  parseJsonReply,
  askGeminiForFix,
  askGeminiForPlan,
} from '../../src/services/geminiAdvisor.js';
import { mockFetch, jsonResponse, createMemoryStorage } from '../helpers/browser-globals.mjs';

const USER_KEY = 'project-eric_user';
const KEY = 'project-eric_gemini_key';
const AI_CONFIG = 'project-eric_ai_config';

const signIn = (id) => {
  globalThis.localStorage.setItem(USER_KEY, JSON.stringify({ id }));
};

/** A Gemini reply in the shape the API returns. */
const geminiReply = (text) =>
  jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });

describe('services/geminiAdvisor — the model list', () => {
  it('has at least one model to try', () => {
    assert.ok(GEMINI_MODELS.length > 0);
  });

  it('uses the first model as the default', () => {
    assert.equal(DEFAULT_GEMINI_MODEL, GEMINI_MODELS[0]);
  });

  it('has no duplicate models', () => {
    assert.equal(new Set(GEMINI_MODELS).size, GEMINI_MODELS.length);
  });
});

describe('services/geminiAdvisor — the stored key', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
  });

  it('has no key to start with', () => {
    assert.equal(getGeminiKey(), '');
    assert.equal(hasGeminiKey(), false);
  });

  it('saves and reads back the dedicated key', () => {
    saveGeminiKey('AIzaSyABC');
    assert.equal(getGeminiKey(), 'AIzaSyABC');
    assert.equal(hasGeminiKey(), true);
  });

  it('trims the key', () => {
    saveGeminiKey('  AIzaSyABC  ');
    assert.equal(getGeminiKey(), 'AIzaSyABC');
  });

  it('removes the key when it is saved empty', () => {
    saveGeminiKey('AIzaSyABC');
    saveGeminiKey('');
    assert.equal(getGeminiKey(), '');
    assert.equal(globalThis.localStorage.getItem(`${KEY}:1`), null);
  });

  it('falls back to the general AI config when it points at Gemini', () => {
    globalThis.localStorage.setItem(
      `${AI_CONFIG}:1`,
      JSON.stringify({ provider: 'google', apiKey: 'AIzaGeneral' }),
    );
    assert.equal(getGeminiKey(), 'AIzaGeneral');
  });

  it('ignores the general AI config when it points at another provider', () => {
    globalThis.localStorage.setItem(
      `${AI_CONFIG}:1`,
      JSON.stringify({ provider: 'openai', apiKey: 'sk-x' }),
    );
    assert.equal(getGeminiKey(), '');
  });

  it('prefers the dedicated key over the general config', () => {
    globalThis.localStorage.setItem(
      `${AI_CONFIG}:1`,
      JSON.stringify({ provider: 'google', apiKey: 'AIzaGeneral' }),
    );
    saveGeminiKey('AIzaDedicated');
    assert.equal(getGeminiKey(), 'AIzaDedicated');
  });

  it('returns no key when the storage throws', () => {
    globalThis.localStorage = createMemoryStorage({ failOnGet: true });
    assert.equal(getGeminiKey(), '');
  });

  it('does not throw when the storage refuses the write', () => {
    globalThis.localStorage = createMemoryStorage({ failOnSet: true });
    assert.doesNotThrow(() => saveGeminiKey('AIzaX'));
  });
});

describe('services/geminiAdvisor — parseJsonReply', () => {
  it('parses plain JSON', () => {
    assert.deepEqual(parseJsonReply('{"a":1}'), { a: 1 });
  });

  it('parses a fenced JSON block', () => {
    assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
  });

  it('parses a fenced block without the json tag', () => {
    assert.deepEqual(parseJsonReply('```\n{"a":1}\n```'), { a: 1 });
  });

  it('extracts a JSON object surrounded by prose', () => {
    assert.deepEqual(parseJsonReply('Here you go: {"a":1} — hope that helps'), { a: 1 });
  });

  it('returns null for an empty reply', () => {
    assert.equal(parseJsonReply(''), null);
    assert.equal(parseJsonReply('   '), null);
    assert.equal(parseJsonReply(null), null);
    assert.equal(parseJsonReply(undefined), null);
  });

  it('returns null for a reply that holds no JSON', () => {
    assert.equal(parseJsonReply('I could not do that'), null);
  });

  it('returns null for malformed JSON', () => {
    assert.equal(parseJsonReply('{a: 1,}'), null);
  });
});

describe('services/geminiAdvisor — askGeminiForFix', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
    resetGeminiModel();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
    resetGeminiModel();
  });

  it('throws when no key is configured', async () => {
    await assert.rejects(
      () => askGeminiForFix({ code: 'x', finding: { id: 'A03' } }),
      /Add your Gemini API key/,
    );
  });

  it('returns the parsed fix', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() => geminiReply(JSON.stringify({
      summary: 'Use a parameterised query',
      why: 'It stops injection',
      before: 'q = "SELECT " + a',
      after: 'q = "SELECT ?"',
      steps: ['Bind the parameter'],
      checklist: ['Try an apostrophe'],
    })));
    const fix = await askGeminiForFix({
      code: 'q = "SELECT " + a',
      finding: { id: 'A03', name: 'Injection', severity: 'high' },
    });
    assert.equal(fix.summary, 'Use a parameterised query');
    assert.deepEqual(fix.steps, ['Bind the parameter']);
    assert.deepEqual(fix.checklist, ['Try an apostrophe']);
  });

  it('throws when the reply cannot be parsed', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() => geminiReply('sorry, I cannot help with that'));
    await assert.rejects(
      () => askGeminiForFix({ code: 'x', finding: { id: 'A03' } }),
      /could not parse as a fix/,
    );
  });

  it('throws when every model is unavailable', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() =>
      jsonResponse({ error: 'model not found' }, { ok: false, status: 404 }));
    await assert.rejects(
      () => askGeminiForFix({ code: 'x', finding: { id: 'A03' } }),
      /unavailable/,
    );
  });

  it('throws when the key is rejected', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() =>
      jsonResponse({ error: 'API key not valid' }, { ok: false, status: 400 }));
    await assert.rejects(
      () => askGeminiForFix({ code: 'x', finding: { id: 'A03' } }),
      /Gemini 400/,
    );
  });

  it('falls through to the next model when one is saturated', async () => {
    saveGeminiKey('AIzaX');
    let calls = 0;
    restoreFetch = mockFetch(() => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: 'quota' }, { ok: false, status: 429 });
      return geminiReply(JSON.stringify({ summary: 'ok', why: 'w', before: 'b', after: 'a', steps: [] }));
    });
    const fix = await askGeminiForFix({ code: 'x', finding: { id: 'A03' } });
    assert.equal(fix.summary, 'ok');
    assert.equal(calls, 2);
  });

  it('throws when the model answers with nothing', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() => geminiReply('   '));
    await assert.rejects(
      () => askGeminiForFix({ code: 'x', finding: { id: 'A03' } }),
      /unavailable|empty response/,
    );
  });

  it('reports an unreachable Gemini', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() => undefined);
    await assert.rejects(
      () => askGeminiForFix({ code: 'x', finding: { id: 'A03' } }),
      /Could not reach Gemini/,
    );
  });
});

describe('services/geminiAdvisor — askGeminiForPlan', () => {
  let restoreFetch;

  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
    signIn(1);
    resetGeminiModel();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
    restoreFetch = undefined;
    resetGeminiModel();
  });

  it('throws when no key is configured', async () => {
    await assert.rejects(
      () => askGeminiForPlan({ code: 'x', findings: [] }),
      /Add your Gemini API key/,
    );
  });

  it('returns the parsed plan', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() => geminiReply(JSON.stringify({
      summary: 'Fix the injection first',
      priorities: [
        { id: 'A03', title: 'SQL injection', severity: 'high', action: 'Bind parameters' },
      ],
    })));
    const plan = await askGeminiForPlan({
      code: 'x',
      findings: [{ id: 'A03', name: 'Injection', status: 'fail', count: 2 }],
    });
    assert.equal(plan.summary, 'Fix the injection first');
    assert.equal(plan.priorities.length, 1);
    assert.equal(plan.priorities[0].id, 'A03');
  });

  it('leaves out the findings that already pass', async () => {
    saveGeminiKey('AIzaX');
    let body;
    restoreFetch = mockFetch((url, options) => {
      body = JSON.parse(options.body);
      return geminiReply(JSON.stringify({ summary: 'ok', priorities: [] }));
    });
    await askGeminiForPlan({
      code: 'x',
      findings: [
        { id: 'A01', name: 'Access Control', status: 'pass' },
        { id: 'A03', name: 'Injection', status: 'fail' },
      ],
    });
    const prompt = body.contents.map((c) => c.parts[0].text).join('\n');
    assert.ok(prompt.includes('A03'));
    assert.ok(!prompt.includes('A01'));
  });

  it('throws when the reply cannot be parsed', async () => {
    saveGeminiKey('AIzaX');
    restoreFetch = mockFetch(() => geminiReply('no idea'));
    await assert.rejects(
      () => askGeminiForPlan({ code: 'x', findings: [] }),
      /could not parse/,
    );
  });
});
