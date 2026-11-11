import { readUserScoped, writeUserScoped, removeUserScoped } from '../utils/userStorage';

// geminiAdvisor.js
// ---------------------------------------------------------------------------
// Gemini-powered fix suggestions for the OWASP scanner.
// ---------------------------------------------------------------------------
// What this does
// --------------
// The scanner's own detectors tell the user *that* something is wrong
// (which OWASP category, which CWE, which line). This module asks Gemini
// for the other half: **what to change and what the fixed code looks
// like**.
//
// For every finding it returns a structured object:
//
//   {
//     summary   one-line, action-oriented description of the fix
//     why       why the vulnerability matters in plain English
//     before    the vulnerable snippet, trimmed to the relevant lines
//     after     the hardened replacement for the same snippet
//     steps     ordered list of concrete edits to make
//     checklist items to verify manually once the fix is applied
//   }
//
// Key handling
// -------------
// The scanner uses its **own** Gemini key, stored separately from the
// general AI-provider config:
//
//   localStorage['project-eric_gemini_key']
//
// Keeping it separate means a user can point the scanner at Gemini
// without changing the provider used by the rest of the app (the
// Sandbox, the Analysis page, …). If no dedicated key is set, we fall
// back to the general AI config *when* that config is already Gemini —
// so a user who set Gemini up globally gets sensible behaviour without
// re-entering the key.
//
// Model selection
// ---------------
// The scanner always talks to Gemini, regardless of which provider is
// active globally. `GEMINI_MODELS` lists the model IDs we try, in
// order. If the first one is rejected (404 / model not found — the
// catalogue changes over time and a stored preference can go stale),
// we fall through to the next candidate rather than failing the whole
// request. The first model that answers is remembered for the session.

const STORAGE_KEY = 'project-eric_gemini_key';

/** Endpoint for the Gemini generateContent API. */
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Model IDs to try, in order. The first is the flagship; the rest are
 * progressively smaller/cheaper and act as fallbacks when the preferred
 * one is unavailable to the caller's key.
 *
 * The list is deliberately built from the models Google currently
 * serves on the `v1beta` generateContent endpoint. Older IDs such as
 * `gemini-2.5-pro` were retired for new API keys and answer with
 * "this model is no longer available to new users" — so they are not
 * listed here at all.
 *
 * Order matters: the free tier throttles the larger models hardest
 * (the 3.8-flash regularly answers with 503 "high demand" or stalls
 * for minutes), while the flash-lite models keep answering. The
 * mid-size flashes come first because they give the best fix quality,
 * and the flash-lite models are the safety net that keeps the button
 * working when the bigger ones are saturated.
 */
export const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
];

/** Model used when the caller does not pin one. */
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0];

/**
 * How long a single model gets before we give up on it and try the
 * next one. The Gemini free tier regularly stalls for minutes under
 * load, so this bounds the worst case for one advice request.
 */
const ATTEMPT_TIMEOUT_MS = 45_000;

/** Remember which model actually answered, so we stop retrying others. */
let resolvedModel = null;

// ---------------------------------------------------------------------------
// Key storage
// ---------------------------------------------------------------------------

/**
 * Read the scanner's Gemini key.
 *
 * Falls back to the general AI config when that config is already
 * pointing at Gemini.
 *
 * @returns {string} the key, or '' when none is configured
 */
export function getGeminiKey() {
  try {
    const dedicated = readUserScoped(STORAGE_KEY, null);
    if (typeof dedicated === 'string' && dedicated.trim()) return dedicated.trim();
  } catch {
    /* localStorage unavailable (private mode) — fall through */
  }
  try {
    const cfg = readUserScoped('project-eric_ai_config', null);
    if (cfg?.provider === 'google' && typeof cfg.apiKey === 'string' && cfg.apiKey.trim()) {
      return cfg.apiKey.trim();
    }
  } catch {
    /* malformed config — ignore */
  }
  return '';
}

/** Persist the scanner's Gemini key. */
export function saveGeminiKey(key) {
  const value = String(key || '').trim();
  try {
    if (value) writeUserScoped(STORAGE_KEY, value);
    else removeUserScoped(STORAGE_KEY);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
  return value;
}

/** True when a Gemini key is available. */
export function hasGeminiKey() {
  return getGeminiKey().length > 0;
}

/**
 * Clear the remembered model so the next call re-probes the catalogue.
 * Called when the user changes their key.
 */
export function resetGeminiModel() {
  resolvedModel = null;
}

// ---------------------------------------------------------------------------
// Low-level API call
// ---------------------------------------------------------------------------

/**
 * Call Gemini's generateContent endpoint and return the raw text.
 *
 * @param {object} opts
 * @param {string} opts.prompt        The user-facing prompt.
 * @param {string} [opts.system]      System-style instruction.
 * @param {object} [opts.schema]      JSON schema for structured output.
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.model]       Pin a specific model.
 * @returns {Promise<string>}
 */
async function callGemini({
  prompt,
  system,
  schema,
  temperature = 0.2,
  maxTokens = 4096,
  signal,
  model,
}) {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error('No Gemini API key configured for the OWASP scanner.');
  }

  // Build the candidate list: the pinned model first, then the ones we
  // know about. `resolvedModel` short-circuits the probe once we know
  // which model the key can use.
  const candidates = [];
  if (model) candidates.push(model);
  if (resolvedModel && !candidates.includes(resolvedModel)) candidates.push(resolvedModel);
  for (const m of GEMINI_MODELS) if (!candidates.includes(m)) candidates.push(m);

  let lastError = null;

  for (const candidate of candidates) {
    const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    // Gemini wants [{ role: 'user' | 'model', parts: [{ text }] }].
    const contents = [];
    if (system) contents.push({ role: 'user', parts: [{ text: `[SYSTEM]\n${system}` }] });
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens,
    };
    // Structured output keeps the parser trivial and stops the model
    // from wrapping the JSON in prose. Not every model supports it,
    // so if the API rejects the schema we retry without it and parse
    // the JSON out of the text ourselves.
    if (schema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = schema;
    }

    // Per-attempt timeout. The Gemini free tier is erratic: a request
    // can sit for five minutes or fail with "high demand" before it
    // ever produces a token. Without a deadline the browser tab would
    // hang on the first candidate instead of falling through to a
    // model that can actually answer. 45 s is generous for a JSON
    // reply and still leaves the user waiting less than a minute.
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig }),
        signal: controller.signal,
      });
    } catch (e) {
      // The caller aborted → stop trying entirely.
      if (signal?.aborted) {
        throw new Error('The request was cancelled.');
      }
      // Our own deadline fired → this candidate is too slow, try the
      // next one rather than failing the whole request.
      if (controller.signal.aborted) {
        lastError = new Error(
          `Gemini model "${candidate}" did not answer within ${Math.round(ATTEMPT_TIMEOUT_MS / 1000)}s.`,
        );
        continue;
      }
      // A network-level failure is not a model problem — bail out.
      throw new Error(`Could not reach Gemini: ${e?.message || e}`);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener?.('abort', onOuterAbort);
    }

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text.trim()) {
        lastError = new Error('Gemini returned an empty response.');
        continue;
      }
      resolvedModel = candidate;
      return text;
    }

    const body = await res.text().catch(() => '');
    const lower = body.toLowerCase();

    // "Model not found" / "not supported" → try the next candidate.
    const modelMissing =
      res.status === 404 ||
      lower.includes('not found') ||
      lower.includes('not supported') ||
      lower.includes('is not supported for api version');

    if (modelMissing) {
      lastError = new Error(`Gemini model "${candidate}" is unavailable (${res.status}).`);
      continue;
    }

    // Quota exhausted or the model is momentarily overloaded. That is a
    // property of *this* model on *this* key, not of the request, so we
    // fall through to the next candidate instead of failing outright —
    // the flash models usually still have headroom.
    const transient =
      res.status === 429 || res.status === 503 ||
      lower.includes('quota') ||
      lower.includes('high demand');

    if (transient) {
      lastError = new Error(
        `Gemini model "${candidate}" is temporarily unavailable (${res.status}).`,
      );
      continue;
    }

    // The schema was rejected → retry once without it.
    if (res.status === 400 && schema && lower.includes('response_schema')) {
      const retryController = new AbortController();
      const retryTimer = setTimeout(() => retryController.abort(), ATTEMPT_TIMEOUT_MS);
      try {
        const retry = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature, maxOutputTokens: maxTokens },
          }),
          signal: retryController.signal,
        });
        if (retry.ok) {
          const data = await retry.json().catch(() => ({}));
          const text =
            data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
          if (text.trim()) {
            resolvedModel = candidate;
            return text;
          }
        }
      } catch {
        /* the retry failed — fall through to the next candidate */
      } finally {
        clearTimeout(retryTimer);
      }
      lastError = new Error('Gemini rejected the structured-output request.');
      continue;
    }

    // Anything else is a real failure (bad key, quota, blocked region).
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  throw lastError || new Error('No Gemini model could be used for this request.');
}

/**
 * Parse a model reply as JSON, tolerating markdown fences and
 * leading/trailing prose.
 */
export function parseJsonReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const candidates = [];
  // Fenced block first.
  const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(raw);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next candidate */
    }
  }

  // Last resort: slice out the outermost JSON object/array.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One sentence describing the fix.' },
    why: { type: 'string', description: 'Why the vulnerability matters, in plain English.' },
    before: { type: 'string', description: 'The vulnerable snippet, trimmed to the relevant lines.' },
    after: { type: 'string', description: 'The fixed replacement for the same snippet, same language.' },
    steps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ordered list of concrete edits to make.',
    },
    checklist: {
      type: 'array',
      items: { type: 'string' },
      description: 'Manual verification steps after the fix is applied.',
    },
  },
  required: ['summary', 'why', 'before', 'after', 'steps'],
};

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One-sentence overall assessment.' },
    priorities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The OWASP category id, e.g. A03.' },
          title: { type: 'string' },
          severity: { type: 'string', description: 'critical | high | medium | low' },
          effort: { type: 'string', description: 'quick win | moderate | larger refactor' },
          action: { type: 'string', description: 'What to change, concretely.' },
          codeExample: { type: 'string', description: 'A short fixed-code example.' },
        },
        required: ['id', 'title', 'severity', 'action'],
      },
    },
  },
  required: ['summary', 'priorities'],
};

/** Human-readable label for a language/dialect pair. */
function languageLabel(language, mode, dialect) {
  if (mode === 'sql') return `SQL (${dialect || 'generic'})`;
  return language || 'javascript';
}

/**
 * Ask Gemini for a concrete fix for one finding.
 *
 * @param {object} opts
 * @param {string} opts.code        The full scanned snippet.
 * @param {object} opts.finding     The finding object from the scanner.
 * @param {string} [opts.language]
 * @param {string} [opts.mode]      'code' | 'sql'
 * @param {string} [opts.dialect]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{summary: string, why: string, before: string, after: string, steps: string[], checklist: string[]}>}
 */
export async function askGeminiForFix({
  code,
  finding,
  language,
  mode = 'code',
  dialect,
  signal,
}) {
  if (!hasGeminiKey()) {
    throw new Error('Add your Gemini API key to get AI fix suggestions.');
  }

  const lang = languageLabel(language, mode, dialect);
  const evidence = Array.isArray(finding?.evidence) ? finding.evidence : [];

  const prompt = [
    `You are a senior application-security engineer fixing one specific finding.`,
    ``,
    `Language: ${lang}`,
    `OWASP category: ${finding?.id || ''} — ${finding?.name || ''}`,
    `Severity: ${finding?.severity || 'unknown'}`,
    `CWE: ${finding?.cwe || 'n/a'}`,
    finding?.description ? `Detector description: ${finding.description}` : '',
    finding?.remediation ? `Detector remediation hint: ${finding.remediation}` : '',
    ``,
    evidence.length
      ? `Offending lines reported by the scanner:\n${evidence
          .map((e) => `  line ${e.line}: ${e.snippet}`)
          .join('\n')}`
      : '',
    ``,
    `Full snippet under review:`,
    '```',
    String(code || '').slice(0, 12000),
    '```',
    ``,
    `Give the fix for THIS finding only. Requirements:`,
    `• "before" must be the actual vulnerable code from the snippet above (trimmed to the relevant lines), not a generic example.`,
    `• "after" must be the fixed version of that SAME code, in the same language. It must compile/be runnable as written.`,
    `• "steps" must be ordered, concrete edits the developer performs in their own file.`,
    `• Keep "before" and "after" focused — no unrelated boilerplate.`,
  ]
    .filter(Boolean)
    .join('\n');

  const text = await callGemini({
    prompt,
    system:
      'You are a precise application-security engineer. You return only the requested JSON. Never invent APIs that do not exist, and never return placeholder code.',
    schema: FIX_SCHEMA,
    temperature: 0.15,
    maxTokens: 4096,
    signal,
  });

  const parsed = parseJsonReply(text);
  if (!parsed) {
    throw new Error('Gemini returned a reply we could not parse as a fix.');
  }

  return {
    summary: String(parsed.summary || '').trim(),
    why: String(parsed.why || '').trim(),
    before: String(parsed.before || '').trim(),
    after: String(parsed.after || '').trim(),
    steps: Array.isArray(parsed.steps) ? parsed.steps.map((s) => String(s)) : [],
    checklist: Array.isArray(parsed.checklist) ? parsed.checklist.map((s) => String(s)) : [],
  };
}

/**
 * Ask Gemini for an overall remediation plan across all findings.
 *
 * @param {object} opts
 * @param {string} opts.code
 * @param {Array<object>} opts.findings
 * @param {string} [opts.language]
 * @param {string} [opts.mode]
 * @param {string} [opts.dialect]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{summary: string, priorities: Array<object>}>}
 */
export async function askGeminiForPlan({
  code,
  findings = [],
  language,
  mode = 'code',
  dialect,
  signal,
}) {
  if (!hasGeminiKey()) {
    throw new Error('Add your Gemini API key to get an AI fix plan.');
  }

  const lang = languageLabel(language, mode, dialect);
  const actionable = findings.filter((f) => f && f.status !== 'pass');

  const prompt = [
    `You are a senior application-security engineer triaging an OWASP scan.`,
    ``,
    `Language: ${lang}`,
    `Findings that need attention (${actionable.length}):`,
    ...actionable.map(
      (f) =>
        `- [${f.severity || 'info'}] ${f.id} ${f.name || ''} (${f.count || 1} issue(s)) — ${f.description || ''}`
    ),
    ``,
    `Full snippet under review:`,
    '```',
    String(code || '').slice(0, 12000),
    '```',
    ``,
    `Produce a prioritised remediation plan. Order by real risk: fix the one that an attacker would exploit first, not the one that is easiest.`,
    `For each item give a concrete "action" and a short fixed-code "codeExample".`,
  ]
    .filter(Boolean)
    .join('\n');

  const text = await callGemini({
    prompt,
    system:
      'You are a pragmatic security lead. You return only the requested JSON and always prioritise by exploitability.',
    schema: PLAN_SCHEMA,
    temperature: 0.2,
    maxTokens: 4096,
    signal,
  });

  const parsed = parseJsonReply(text);
  if (!parsed) {
    throw new Error('Gemini returned a reply we could not parse as a plan.');
  }

  return {
    summary: String(parsed.summary || '').trim(),
    priorities: Array.isArray(parsed.priorities) ? parsed.priorities : [],
  };
}

export default {
  GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  getGeminiKey,
  saveGeminiKey,
  hasGeminiKey,
  resetGeminiModel,
  parseJsonReply,
  askGeminiForFix,
  askGeminiForPlan,
};
