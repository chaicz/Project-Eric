/**
 * AI Service
 * -----------------------------------------------------------------------------
 * Unified client for the latest OpenAI, Anthropic, Google Gemini, and
 * OpenRouter models. API keys + provider + model are stored in localStorage
 * under `project-eric_ai_config` so they survive reloads.
 *
 * Latest models (Sep 2026):
 *   - openai    : gpt-4o (default), gpt-4.1, gpt-4.1-mini, o3, o4-mini
 *   - anthropic : claude-sonnet-4-5 (default), claude-opus-4-1
 *   - google    : gemini-2.5-pro (default), gemini-2.5-flash
 *   - openrouter: auto (default), lets users pick any model
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
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4.1',         label: 'GPT-4.1 (latest flagship)' },
      { id: 'gpt-4o',          label: 'GPT-4o (recommended)' },
      { id: 'gpt-4.1-mini',    label: 'GPT-4.1 mini (fast, cheap)' },
      { id: 'o3',              label: 'o3 (reasoning)' },
      { id: 'o4-mini',         label: 'o4-mini (reasoning, fast)' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    placeholder: 'sk-ant-...',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-5',
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (recommended)' },
      { id: 'claude-opus-4-1',   label: 'Claude Opus 4.1 (most capable)' },
      { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 (fastest)' },
    ],
  },
  google: {
    name: 'Google Gemini',
    placeholder: 'AIza...',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-pro',
    models: [
      { id: 'gemini-2.5-pro',    label: 'Gemini 2.5 Pro (recommended)' },
      { id: 'gemini-2.5-flash',  label: 'Gemini 2.5 Flash (fast)' },
      { id: 'gemini-2.0-pro',    label: 'Gemini 2.0 Pro' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    placeholder: 'sk-or-...',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o',
    models: [
      { id: 'openai/gpt-4o',                          label: 'OpenAI GPT-4o' },
      { id: 'anthropic/claude-sonnet-4-5',            label: 'Anthropic Claude Sonnet 4.5' },
      { id: 'google/gemini-2.5-pro',                 label: 'Google Gemini 2.5 Pro' },
      { id: 'meta-llama/llama-3.3-70b-instruct',     label: 'Meta Llama 3.3 70B' },
      { id: 'deepseek/deepseek-chat-v3',             label: 'DeepSeek V3' },
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

export const getAIConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw);
    // Backfill missing fields if a new provider was added since the last save.
    const base = defaultConfig();
    return { ...base, ...parsed };
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
