/**
 * Account preferences.
 *
 * The Settings page and the Notifications page both show notification
 * preferences. They used to read two different `localStorage` keys, so
 * toggling "Security Alerts" on one screen left the other screen
 * showing the old value — and neither was stored on the account, so
 * both were lost on another machine.
 *
 * This module is the single place that knows how a preference is
 * stored and saved:
 *
 *   - the server copy is the one that wins (it belongs to the account)
 *   - a per-account browser cache makes the first paint instant and
 *     keeps the page usable when the API is unreachable
 *
 * The cache key is scoped to the account id, so two accounts on one
 * machine never see each other's preferences.
 */

import { dashboardAPI } from '../services/api';
import { readUserScoped, writeUserScoped } from './userStorage';

/** The browser cache key. The account id is appended by `userStorage`. */
const CACHE_KEY = 'project-eric_account_settings';

/**
 * The preferences a brand-new account starts with.
 *
 * The API owns the real defaults (see `api/settings.php`); these mirror
 * them so the first paint before the API answers is not wrong.
 */
export const DEFAULT_SETTINGS = {
  notifications: {
    email: true,
    push: true,
    vulnerabilityAlerts: true,
    weeklyReport: false,
    scanCompletion: true,
  },
  appearance: {
    theme: 'light',
    accent: '#3B82F6',
  },
};

/**
 * Fill in anything the stored document does not carry.
 *
 * A group that is not a plain object is ignored rather than merged —
 * spreading a string would turn it into one key per character.
 *
 * @param {object} stored
 * @returns {object} a complete settings object
 */
export function withDefaults(stored) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const group = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    notifications: { ...DEFAULT_SETTINGS.notifications, ...group(source.notifications) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...group(source.appearance) },
  };
}

/**
 * The cached settings for the signed-in account.
 *
 * @returns {object}
 */
export function readCachedSettings() {
  return withDefaults(readUserScoped(CACHE_KEY, null));
}

/**
 * Cache the settings for the signed-in account.
 *
 * @param {object} settings
 */
export function cacheSettings(settings) {
  writeUserScoped(CACHE_KEY, withDefaults(settings));
}

/**
 * Read the account's settings from the API.
 *
 * The cached copy is returned when the API cannot be reached, so the
 * Settings page still shows the user's own choices offline.
 *
 * @returns {Promise<{settings: object, fromCache: boolean}>}
 */
export async function loadSettings() {
  try {
    const data = await dashboardAPI.getSettings();
    const settings = withDefaults(data?.settings);
    cacheSettings(settings);
    return { settings, fromCache: false };
  } catch {
    return { settings: readCachedSettings(), fromCache: true };
  }
}

/**
 * Save part of the account's settings.
 *
 * The local cache is updated first so the switch reflects the change
 * immediately; if the server rejects it, the change is rolled back so
 * the screen does not claim something the account does not have.
 *
 * @param {{notifications?: object, appearance?: object}} patch
 * @returns {Promise<{ok: boolean, settings?: object, error?: string}>}
 */
export async function saveSettings(patch) {
  const previous = readCachedSettings();
  const group = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const next = withDefaults({
    ...previous,
    ...group(patch),
    notifications: { ...previous.notifications, ...group(patch?.notifications) },
    appearance: { ...previous.appearance, ...group(patch?.appearance) },
  });

  cacheSettings(next);

  try {
    const data = await dashboardAPI.saveSettings(group(patch));
    const settings = withDefaults(data?.settings || next);
    cacheSettings(settings);
    return { ok: true, settings };
  } catch (err) {
    // Put the old values back: the server refused, so the account still
    // has the old ones.
    cacheSettings(previous);
    return { ok: false, error: err?.message || 'Could not save the settings.' };
  }
}
