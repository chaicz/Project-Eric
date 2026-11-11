/**
 * Per-account browser storage.
 *
 * The dashboard keeps the last figures the API reported, and the scanner
 * keeps the findings of runs the backend refused to store. Both live in
 * `localStorage`, which is shared by every account that uses the same
 * browser.
 *
 * That is a leak: sign in as account A, then as account B on the same
 * machine, and B would see A's cached figures until the API answered.
 * Every one of those keys is therefore scoped to the account that owns
 * it.
 *
 * The account id comes from `project-eric_user`, which the app context
 * writes on every render.
 */

const USER_KEY = 'project-eric_user';

/**
 * The id of the account this browser is currently signed in as.
 *
 * @returns {string} the user id, or 'guest' when nobody is signed in
 */
export function currentUserId() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return 'guest';
    const parsed = JSON.parse(raw);
    const id = parsed?.id;
    return id === undefined || id === null ? 'guest' : String(id);
  } catch {
    return 'guest';
  }
}

/**
 * A storage key that belongs to the signed-in account.
 *
 * @param {string} base the shared part of the key
 * @returns {string}
 */
export function userScopedKey(base) {
  return `${base}:${currentUserId()}`;
}

/**
 * Read a value that belongs to the signed-in account.
 *
 * @param {string} base the shared part of the key
 * @param {*} fallback returned when nothing is stored (or the value is broken)
 */
export function readUserScoped(base, fallback = null) {
  try {
    const raw = localStorage.getItem(userScopedKey(base));
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Store a value for the signed-in account.
 *
 * @param {string} base the shared part of the key
 * @param {*} value the value to store (falsy values are ignored)
 */
export function writeUserScoped(base, value) {
  try {
    if (!value) return;
    localStorage.setItem(userScopedKey(base), JSON.stringify(value));
  } catch {
    /* quota or privacy mode — ignore */
  }
}

/**
 * Remove a value that belongs to the signed-in account.
 *
 * @param {string} base the shared part of the key
 */
export function removeUserScoped(base) {
  try {
    localStorage.removeItem(userScopedKey(base));
  } catch {
    /* ignore */
  }
}

/**
 * Remove every stored value of an account, whatever its base key is.
 *
 * @param {string[]} bases the shared parts of the keys to clear
 */
export function removeUserScopedAll(bases = []) {
  bases.forEach(removeUserScoped);
}
