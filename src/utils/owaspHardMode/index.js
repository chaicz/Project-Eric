// ---------------------------------------------------------------------------
// OWASP Hard Mode — public entry point
//
// One call loads everything and runs the scan:
//
//   import { runHardScan } from '../utils/owaspHardMode/index.js';
//   const result = await runHardScan(code, 'php');
//
// The loader mirrors `src/utils/owaspPackLoader.js` but keeps a second
// cache for the hard pack so switching profiles back and forth does not
// re-fetch anything.
// ---------------------------------------------------------------------------

import { loadOwaspPack, loadLanguage } from '../owaspPackLoader.js';
import { buildHardPack } from './hardPack.js';
import { analyseWithProfile, summarise } from './hardAnalyser.js';
import { resolveProfile } from './profile.js';

const hardPackCache = { value: null, inflight: null };

/**
 * Load the base pack and build the hard variant from it.
 *
 * @returns {Promise<object>}
 */
export const loadHardPack = async () => {
  if (hardPackCache.value) return hardPackCache.value;
  if (!hardPackCache.inflight) {
    hardPackCache.inflight = (async () => {
      const base = await loadOwaspPack();
      if (!base) return null;
      return buildHardPack(base, 'hard');
    })();
  }
  hardPackCache.value = (await hardPackCache.inflight) || null;
  return hardPackCache.value;
};

/**
 * Clear the hard-pack cache. Used by tests.
 */
export const resetHardPackCache = () => {
  hardPackCache.value = null;
  hardPackCache.inflight = null;
};

/**
 * Run a scan under a profile.
 *
 * @param {string} code             the source to analyse
 * @param {string} languageId       e.g. "php"
 * @param {object} [options]
 * @param {string} [options.profile] profile id, defaults to "hard"
 * @param {(p: object) => void} [options.onProgress]
 * @returns {Promise<{findings: object[], score: number, summary: string, profile: object, pack: object}>}
 */
export const runProfileScan = async (code, languageId, options = {}) => {
  const profileId = options.profile || 'hard';
  const active = resolveProfile(profileId);

  const pack = profileId === 'standard' ? await loadOwaspPack() : await loadHardPack();
  const langPack = await loadLanguage(languageId || 'javascript');

  const findings = await analyseWithProfile(
    code,
    pack,
    langPack,
    active,
    options.onProgress,
  );

  const stats = summarise(findings);

  return {
    findings,
    ...stats,
    profile: active,
    pack,
  };
};

/**
 * Run a scan in hard mode.
 *
 * @param {string} code
 * @param {string} languageId
 * @param {(p: object) => void} [onProgress]
 * @returns {Promise<object>}
 */
export const runHardScan = (code, languageId, onProgress) =>
  runProfileScan(code, languageId, { profile: 'hard', onProgress });

/**
 * Run a scan in the standard profile.
 *
 * @param {string} code
 * @param {string} languageId
 * @param {(p: object) => void} [onProgress]
 * @returns {Promise<object>}
 */
export const runStandardScan = (code, languageId, onProgress) =>
  runProfileScan(code, languageId, { profile: 'standard', onProgress });
