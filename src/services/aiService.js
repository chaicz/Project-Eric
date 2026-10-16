/**
 * AI Service
 * -----------------------------------------------------------------------------
 * Unified client for the latest OpenAI, Anthropic, Google Gemini, and
 * OpenRouter models. API keys + provider + model are stored in localStorage
 * under `project-eric_ai_config` so they survive reloads.
 *
 * Latest models (Oct 2026, sourced from benchlm.ai / artificialanalysis.ai
 * and the provider docs on 2026-10-15):
 *   - openai    : gpt-6-astra (default), gpt-5.6-sol, gpt-5.5, gpt-5.4,
 *                 gpt-5.1, gpt-5, o3, o1
 *   - anthropic : claude-opus-5-5 (default), claude-fable-5-1, claude-sonnet-5,
 *                 claude-haiku-4-5
 *   - google    : gemini-4-argon (default), gemini-3.8-flash, gemini-3.5-flash,
 *                 gemini-3.1-pro, gemini-3-pro, gemini-3.5-flash-lite,
 *                 gemini-3.1-flash-lite
 *   - openrouter: openai/gpt-6-astra (default), anthropic/claude-opus-5-5,
 *                 google/gemini-4-argon, google/gemini-3.8-flash,
 *                 meta-llama/llama-3.3-70b-instruct,
 *                 deepseek/deepseek-chat-v3.1
 *
 * The module also exposes `generateFix` and `explainIssue` helpers that wrap
 * `callAI` with the security-aware system prompts used by the OWASP page and
 * the Sandbox's auto-fix feature.
 */

const STORAGE_KEY = 'project-eric_ai_config';

// --- Provider metadata --------------------------------------------------------

export const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    placeholder: 'sk-...',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-6-astra',
    models: [
      { id: 'gpt-6-astra',    label: 'GPT-6 Astra (latest flagship)' },
      { id: 'gpt-5.6-sol',    label: 'GPT-5.6 Sol (recommended)' },
      { id: 'gpt-5.5',        label: 'GPT-5.5 (fast, balanced)' },
      { id: 'gpt-5.4',        label: 'GPT-5.4 (mid-tier)' },
      { id: 'gpt-5.1',        label: 'GPT-5.1 (previous generation)' },
      { id: 'gpt-5',          label: 'GPT-5 (legacy)' },
      { id: 'o3',             label: 'o3 (reasoning)' },
      { id: 'o1',             label: 'o1 (reasoning, slower)' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    placeholder: 'sk-ant-...',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-opus-5-5',
    models: [
      { id: 'claude-opus-5-5',  label: 'Claude Opus 5.5 (recommended)' },
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (most capable)' },
      { id: 'claude-sonnet-5',  label: 'Claude Sonnet 5 (balanced)' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest)' },
    ],
  },
  google: {
    name: 'Google Gemini',
    placeholder: 'AIza...',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-4-argon',
    models: [
      { id: 'gemini-4-argon',        label: 'Gemini 4 Argon (recommended)' },
      { id: 'gemini-3.8-flash',      label: 'Gemini 3.8 Flash (fast)' },
      { id: 'gemini-3.5-flash',      label: 'Gemini 3.5 Flash' },
      { id: 'gemini-3.1-pro',        label: 'Gemini 3.1 Pro (deep reasoning)' },
      { id: 'gemini-3-pro',          label: 'Gemini 3 Pro' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (cheapest)' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    placeholder: 'sk-or-...',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-6-astra',
    models: [
      { id: 'openai/gpt-6-astra',                      label: 'OpenAI GPT-6 Astra' },
      { id: 'openai/gpt-5.6-sol',                      label: 'OpenAI GPT-5.6 Sol' },
      { id: 'anthropic/claude-opus-5-5',               label: 'Anthropic Claude Opus 5.5' },
      { id: 'anthropic/claude-fable-5-1',              label: 'Anthropic Claude Fable 5.1' },
      { id: 'anthropic/claude-sonnet-5',               label: 'Anthropic Claude Sonnet 5' },
      { id: 'google/gemini-4-argon',                   label: 'Google Gemini 4 Argon' },
      { id: 'google/gemini-3.8-flash',                 label: 'Google Gemini 3.8 Flash' },
      { id: 'meta-llama/llama-3.3-70b-instruct',       label: 'Meta Llama 3.3 70B' },
      { id: 'deepseek/deepseek-chat-v3.1',             label: 'DeepSeek V3.1' },
    ],
  },
};

// --- Config persistence -------------------------------------------------------

const defaultConfig = () => {
  const first = Object.keys(AI_PROVIDERS)[0];
  return {
    provider: first,
    apiKey: '',
    model: AI_PROVIDERS[first].defaultModel,
  };
};

// --- Provider detection from API key string ------------------------------

/**
 * Inspect an API key string and return the provider ID it most likely belongs to,
 * along with the recommended default model for that provider.
 *
 * Detection rules (checked in order):
 *   Anthropic : key starts with 'sk-ant-'
 *   OpenRouter: key starts with 'sk-or-'
 *   Google    : key starts with 'AIza'
 *   OpenAI    : key starts with 'sk-' (catch-all; safe because the others are
 *               checked first and are mutually exclusive)
 *   null      : unrecognised — let the user pick manually
 */
export const detectProvider = (key) => {
  if (!key || typeof key !== 'string') return null;
  const k = key.trim();
  if (k.startsWith('sk-ant-'))     return { provider: 'anthropic', model: AI_PROVIDERS.anthropic.defaultModel };
  if (k.startsWith('sk-or-'))      return { provider: 'openrouter', model: AI_PROVIDERS.openrouter.defaultModel };
  if (k.startsWith('AIza'))        return { provider: 'google',     model: AI_PROVIDERS.google.defaultModel };
  if (k.startsWith('sk-'))         return { provider: 'openai',    model: AI_PROVIDERS.openai.defaultModel };
  return null; // unknown — user must select manually
};

// Models we previously shipped that have since been superseded. If the user
// still has one of these in localStorage, migrate to the current default for
// the matching provider so the dropdown always shows the latest flagship.
const DEPRECATED_MODEL_IDS = new Set([
  // OpenAI
  'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o',
  'o4-mini', 'o4-mini-high',
  // Anthropic
  'claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-opus-4-5',
  'claude-opus-4-8', 'claude-opus-4-1',
  // Google Gemini
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
  'gemini-2.0-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash',
  // OpenRouter prefixed
  'openai/gpt-5', 'openai/gpt-4o', 'openai/gpt-4.1',
  'anthropic/claude-sonnet-4-5', 'anthropic/claude-opus-4-5',
  'google/gemini-2.5-pro', 'google/gemini-2.5-flash',
  // DeepSeek
  'deepseek/deepseek-chat-v3',
]);

export const getAIConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw);
    // Backfill missing fields if a new provider was added since the last save.
    const base = defaultConfig();
    const merged = { ...base, ...parsed };

    // Migrate deprecated model IDs to the new flagship for the active provider.
    if (merged.model && DEPRECATED_MODEL_IDS.has(merged.model)) {
      const fallback = AI_PROVIDERS[merged.provider]?.defaultModel;
      if (fallback) merged.model = fallback;
    }

    // Also migrate if the stored model is no longer in the provider's list.
    const providerModels = AI_PROVIDERS[merged.provider]?.models || [];
    const stillValid = providerModels.some((m) => m.id === merged.model);
    if (!stillValid) {
      merged.model = AI_PROVIDERS[merged.provider]?.defaultModel || merged.model;
    }

    return merged;
  } catch {
    return defaultConfig();
  }
};

export const saveAIConfig = (config) => {
  const merged = { ...defaultConfig(), ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
};

export const hasAIKey = () => {
  const c = getAIConfig();
  return Boolean(c.apiKey && c.apiKey.trim().length > 10);
};

// --- HTTP shims per provider --------------------------------------------------

const postOpenAI = async ({ apiKey, model, messages, temperature, maxTokens, signal }) => {
  const res = await fetch(AI_PROVIDERS.openai.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.3,
      max_tokens: maxTokens ?? 2048,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
};

const postAnthropic = async ({ apiKey, model, system, messages, temperature, maxTokens, signal }) => {
  const res = await fetch(AI_PROVIDERS.anthropic.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      system: system || 'You are a helpful assistant.',
      messages,
      temperature: temperature ?? 0.3,
      max_tokens: maxTokens ?? 2048,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
};

const postGoogle = async ({ apiKey, model, system, messages, temperature, maxTokens, signal }) => {
  const url = `${AI_PROVIDERS.google.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  // Gemini wants [{role: 'user'|'model', parts: [{text}]}]
  const contents = [];
  if (system) contents.push({ role: 'user', parts: [{ text: `[SYSTEM]\n${system}` }] });
  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: temperature ?? 0.3,
        maxOutputTokens: maxTokens ?? 2048,
      },
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
};

const postOpenRouter = async ({ apiKey, model, messages, temperature, maxTokens, signal }) => {
  const res = await fetch(AI_PROVIDERS.openrouter.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
      'X-Title': 'Project Eric',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.3,
      max_tokens: maxTokens ?? 2048,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
};

// --- Public API ---------------------------------------------------------------

/**
 * Send a chat conversation to the configured model.
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt]  Convenience for system messages.
 * @param {string} [opts.provider]       Override the configured provider.
 * @param {string} [opts.model]          Override the configured model.
 * @param {string} [opts.apiKey]         Override the configured key.
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} the assistant's text reply
 */
export const callAI = async (messages, opts = {}) => {
  const cfg = getAIConfig();
  const provider = opts.provider || cfg.provider;
  const apiKey   = opts.apiKey   || cfg.apiKey;
  const model    = opts.model    || cfg.model;
  const temperature = opts.temperature ?? 0.3;
  const maxTokens   = opts.maxTokens   ?? 2048;
  const signal      = opts.signal;

  if (!apiKey) {
    throw new Error('No AI API key configured. Add one in AI API Keys.');
  }

  // Make sure the system prompt is the first message in the right format
  // for each provider.
  const sysMsg = opts.systemPrompt
    ? { role: 'system', content: opts.systemPrompt }
    : null;
  const fullMessages = sysMsg
    ? [sysMsg, ...messages.filter((m) => m.role !== 'system')]
    : messages;

  switch (provider) {
    case 'openai':
    case 'openrouter':
      return provider === 'openai'
        ? postOpenAI({ apiKey, model, messages: fullMessages, temperature, maxTokens, signal })
        : postOpenRouter({ apiKey, model, messages: fullMessages, temperature, maxTokens, signal });
    case 'anthropic':
      return postAnthropic({
        apiKey,
        model,
        system: sysMsg?.content,
        messages: fullMessages.filter((m) => m.role !== 'system'),
        temperature,
        maxTokens,
        signal,
      });
    case 'google':
      return postGoogle({
        apiKey,
        model,
        system: sysMsg?.content,
        messages: fullMessages.filter((m) => m.role !== 'system'),
        temperature,
        maxTokens,
        signal,
      });
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
};

/**
 * Test the configured (or supplied) AI key with a tiny prompt.
 * Returns `{ ok: true, model, reply }` or `{ ok: false, error }`.
 */
export const testAIConnection = async (overrides = {}) => {
  try {
    const reply = await callAI(
      [{ role: 'user', content: 'Reply with the single word: pong' }],
      { ...overrides, maxTokens: 16, temperature: 0 },
    );
    return { ok: true, reply: reply.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

/**
 * Ask the model to produce a security-aware improved version of the
 * supplied code. Returns the raw reply text.
 */
export const generateFix = async ({ code, language, findings, signal }) => {
  const sys = [
    'You are Project Eric, a senior application-security engineer.',
    'You are reviewing user-submitted code for OWASP Top 10 issues.',
    'When asked for a fix, return ONLY the corrected full file wrapped in a single ``` fenced code block. The first line of the fence must include the language tag.',
    'Do not include commentary outside the code block.',
  ].join('\n');

  const findingsBlock = (findings || [])
    .map((f) => `- [${f.severity || 'info'}] ${f.id || ''} ${f.name || ''}: ${f.description || ''}`)
    .join('\n');

  const userPrompt = [
    `Language: ${language || 'auto-detect'}`,
    findingsBlock ? `\nFindings to fix:\n${findingsBlock}` : '',
    '\nSource code to fix:',
    '```',
    code,
    '```',
    '\nReturn the full corrected file in a single fenced code block.',
  ].filter(Boolean).join('\n');

  return callAI(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt: sys, maxTokens: 4096, temperature: 0.1, signal },
  );
};

/**
 * Ask the model to explain a single vulnerability in plain English
 * with a step-by-step remediation.
 */
export const explainIssue = async ({ code, finding, signal }) => {
  const sys = [
    'You are a security mentor.',
    'Explain the issue, why it is dangerous, and give a concrete code-level fix.',
    'Reply in well-structured Markdown with sections: Why it matters, How to fix, Fixed snippet.',
  ].join('\n');

  const userPrompt = [
    `Finding: ${finding.id || ''} ${finding.name || ''} (${finding.severity || 'info'})`,
    finding.description ? `Description: ${finding.description}` : '',
    finding.cwe ? `CWE: ${finding.cwe}` : '',
    '\nRelevant code:',
    '```',
    code || '',
    '```',
  ].filter(Boolean).join('\n');

  return callAI(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt: sys, maxTokens: 1500, temperature: 0.2, signal },
  );
};

/**
 * Ask the model to suggest concrete improvements to build / harden
 * a project. Used by the Sandbox's "Improve project" button.
 */
export const suggestBuildImprovements = async ({ files, signal }) => {
  const sys = [
    'You are a principal engineer reviewing a small project for build-quality, security, and developer-experience improvements.',
    'Reply in Markdown with three sections: Quick wins (5-10 bullets), Refactor suggestions, Security hardening.',
  ].join('\n');

  const fileBlock = files
    .slice(0, 8) // keep the prompt small
    .map((f) => `=== ${f.name} (${f.language || 'text'}) ===\n${f.content.slice(0, 4000)}`)
    .join('\n\n');

  return callAI(
    [{
      role: 'user',
      content: `Here is the current project. Suggest concrete improvements.\n\n${fileBlock}`,
    }],
    { systemPrompt: sys, maxTokens: 1800, temperature: 0.4, signal },
  );
};

/**
 * Extract a fenced code block from the model's reply. Falls back to the
 * raw reply if no fence is found.
 */
export const extractCodeBlock = (reply) => {
  if (!reply) return '';
  const m = reply.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
  if (m) return m[1].replace(/\n$/, '');
  // No fence: assume the whole reply is code.
  return reply.trim();
};

export default {
  AI_PROVIDERS,
  getAIConfig,
  saveAIConfig,
  hasAIKey,
  callAI,
  testAIConnection,
  generateFix,
  explainIssue,
  suggestBuildImprovements,
  extractCodeBlock,
};
