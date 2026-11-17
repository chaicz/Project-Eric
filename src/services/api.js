/**
 * API Service Configuration
 *
 * Configure your XAMPP backend connection here.
 *
 * For Development (XAMPP):
 *   VITE_API_URL = http://localhost/project-eric-api/api
 *
 * For Production:
 *   Set your production API URL
 */

// The fixed identity behind the "Continue with Google" button. It lives
// in the browser and is never sent to, or fetched from, the API.
import { PRESET_GOOGLE_USER } from './previewSession';

// API Base URL - Change this to your XAMPP backend URL
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost/project-eric-api/api';

// The root the API is served from, one level above `API_BASE_URL`.
// Uploaded files (avatars) live there, so their paths are resolved
// against it.
const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, '');

// Endpoints
export const API_ENDPOINTS = {
  // Public endpoints
  LANDING: `${API_BASE_URL}/landing`,
  FEATURES: `${API_BASE_URL}/features`,
  TEAM: `${API_BASE_URL}/team`,
  INFO: `${API_BASE_URL}/info`,

  // Auth endpoints
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
    VALIDATE: `${API_BASE_URL}/auth/validate`,
    FORGOT_PASSWORD: `${API_BASE_URL}/auth/forgot-password`,
    RESET_PASSWORD: `${API_BASE_URL}/auth/reset-password`,
    CHANGE_PASSWORD: `${API_BASE_URL}/auth/change-password`,
    LOGOUT: `${API_BASE_URL}/auth/logout`,
    // Social sign-in. `PROVIDERS` lists which providers this server has
    // credentials for, `EXCHANGE` turns the one-time handoff code into
    // the session.
    OAUTH_PROVIDERS: `${API_BASE_URL}/auth/oauth/providers`,
    OAUTH_EXCHANGE: `${API_BASE_URL}/auth/oauth/exchange`,
  },
};

// ---------------------------------------------------------------------------
// Token storage
//
// The JWT issued by the PHP API lives in `localStorage.token`. Every
// request picks it up automatically; `clearToken()` is called on logout so
// a stale token can never outlive the session.
// ---------------------------------------------------------------------------

export const TOKEN_KEY = 'token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / quota — the session just won't survive a reload */
  }
};

export const clearToken = () => setToken(null);

// Helper function for API calls
export async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Add auth token if available
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  let response;
  try {
    response = await fetch(endpoint, config);
  } catch {
    // Network-level failure: Apache/MySQL is down, or the host is wrong.
    throw new Error(
      `Cannot reach the Project Eric API at ${API_BASE_URL}. ` +
        'Is XAMPP running (Apache + MySQL)?'
    );
  }

  const text = await response.text();
  const trimmed = text.trim();

  // An empty body is not a parse failure — it is "no content", which a
  // DELETE or a 204 answer legitimately has. It is only an error when
  // the status code says so.
  if (!trimmed) {
    if (!response.ok) {
      throw new Error(`API request failed (HTTP ${response.status}).`);
    }
    return null;
  }

  let payload = null;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    payload = null;
  }

  // Apache returns an HTML error page for a bad path, which is not JSON.
  if (!payload) {
    throw new Error(
      response.ok
        ? 'The API returned an unexpected response.'
        : `API request failed (HTTP ${response.status}).`
    );
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || payload.message || 'API request failed');
  }

  // The PHP API wraps every payload as { success, message, data }.
  // Hand back just `data` so callers get what they actually asked for.
  return payload.data ?? payload;
}

// Auth API functions
export const authAPI = {
  login: async (email, password) => {
    const data = await apiCall(API_ENDPOINTS.AUTH.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data?.token) setToken(data.token);
    return data;
  },

  /**
   * Finish a sign-in that needs a second factor.
   *
   * The first `login` call answered with a challenge instead of a token
   * when the account has a second factor. This call exchanges that
   * challenge and the six digit code for the real token.
   *
   * @param {{email: string, password: string, challenge: string, code: string}} credentials
   */
  loginWithTwoFactor: async ({ email, password, challenge, code }) => {
    const data = await apiCall(API_ENDPOINTS.AUTH.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ email, password, challenge, code }),
    });
    if (data?.token) setToken(data.token);
    return data;
  },

  register: async (userData) => {
    const data = await apiCall(API_ENDPOINTS.AUTH.REGISTER, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    if (data?.token) setToken(data.token);
    return data;
  },

  validate: async () => {
    return apiCall(API_ENDPOINTS.AUTH.VALIDATE);
  },

  forgotPassword: async (email) => {
    return apiCall(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (token, newPassword) => {
    return apiCall(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  /**
   * Change the password of the signed-in account. The current password
   * has to be sent along, so a stolen token alone cannot take the
   * account over.
   */
  changePassword: async (currentPassword, newPassword) => {
    return apiCall(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  logout: async () => {
    try {
      return await apiCall(API_ENDPOINTS.AUTH.LOGOUT, { method: 'POST' });
    } finally {
      // Always drop the local token, even if the server call failed.
      clearToken();
    }
  },

  /**
   * Which social sign-in providers this server has credentials for.
   *
   * The buttons use this list so a deployment without credentials does
   * not offer a provider that cannot work.
   */
  oauthProviders: async () => {
    const data = await apiCall(API_ENDPOINTS.AUTH.OAUTH_PROVIDERS);
    const list = data?.providers;
    return Array.isArray(list) ? list : [];
  },

  /**
   * Finish a social sign-in.
   *
   * The API put the session token in a short-lived, HttpOnly cookie and
   * handed the browser a one-time code. This call sends that code back
   * and receives the session in the body. The cookie is sent along with
   * the request, which is why the credentials flag is required.
   *
   * A preview sign-in has no token and no database row. The API returns
   * the verified identity with `isPreview` set, and no token is stored
   * locally for it.
   *
   * @param {string} code The one-time handoff code from the redirect.
   */
  oauthExchange: async (code) => {
    const data = await apiCall(API_ENDPOINTS.AUTH.OAUTH_EXCHANGE, {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ code }),
    });
    if (data?.token) setToken(data.token);
    return data;
  },

  /**
   * Sign in as the preset Google identity.
   *
   * This is a local action. It does not call the API, so no account is
   * created and nothing is written to the database. The identity comes
   * from `PRESET_GOOGLE_USER` and is returned in the same shape a
   * password sign-in returns, so the caller does not have to care
   * which path produced it.
   *
   * There is no JWT: a local session has no server-side account to
   * sign for. The app context keeps the identity in local storage and
   * skips token validation for it.
   */
  oauthPreviewLogin: async () => {
    clearToken();
    return { user: { ...PRESET_GOOGLE_USER }, isPreview: true };
  },

  /**
   * The URL that starts a provider sign-in.
   *
   * With `preview` set, the server runs the real provider handshake but
   * stops before it writes anything to the database. The flag is only
   * accepted on the login page.
   *
   * @param {string} provider
   * @param {{preview?: boolean}} [opts]
   */
  oauthStartUrl: (provider, opts = {}) => {
    const base = `${API_BASE_URL}/auth/oauth/${provider}/start`;
    return opts.preview ? `${base}?preview=1` : base;
  },
};

// Public API functions
export const publicAPI = {
  getLandingData: async () => {
    return apiCall(API_ENDPOINTS.LANDING);
  },

  getFeatures: async () => {
    return apiCall(API_ENDPOINTS.FEATURES);
  },

  getTeam: async () => {
    return apiCall(API_ENDPOINTS.TEAM);
  },

  getInfo: async () => {
    return apiCall(API_ENDPOINTS.INFO);
  },
};

// Authenticated data endpoints (require a Bearer token).
export const dashboardAPI = {
  getDashboard: async () => {
    return apiCall(`${API_BASE_URL}/dashboard`);
  },

  getProjects: async () => {
    return apiCall(`${API_BASE_URL}/projects`);
  },

  getVulnerabilities: async () => {
    return apiCall(`${API_BASE_URL}/vulnerabilities`);
  },

  getThreats: async () => {
    return apiCall(`${API_BASE_URL}/threats`);
  },

  /**
   * The stored scan history of the projects the user can see. The
   * dashboard's activity feed and trend chart are built from it.
   */
  getScans: async () => {
    return apiCall(`${API_BASE_URL}/scans`);
  },

  /**
   * The signed-in account's profile together with the code-server
   * workspace that belongs to it. The API owns the mapping (it is stored
   * in MySQL), so the dashboard and the IDE always agree on which folder
   * belongs to whom.
   */
  getWorkspace: async () => {
    return apiCall(`${API_BASE_URL}/workspace`);
  },

  /**
   * Persist a scan and its findings to the XAMPP/MySQL backend so the
   * dashboard, analysis and reports pages read the same stored state.
   */
  saveScan: async (scan) => {
    return apiCall(`${API_BASE_URL}/scans`, {
      method: 'POST',
      body: JSON.stringify(scan),
    });
  },

  // -------------------------------------------------------------------------
  // Account data
  //
  // Everything below is stored per account. The pages that show it used to
  // render a fixed demo roster, which meant a brand-new account saw other
  // people's projects, alerts and keys. The API owns the truth now.
  // -------------------------------------------------------------------------

  /**
   * The signed-in account's alerts. The header bell and the Notifications
   * page both read this list.
   */
  getNotifications: async () => {
    return apiCall(`${API_BASE_URL}/notifications`);
  },

  markNotificationRead: async (id) => {
    return apiCall(`${API_BASE_URL}/notifications`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'mark_read', id }),
    });
  },

  markAllNotificationsRead: async () => {
    return apiCall(`${API_BASE_URL}/notifications`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
  },

  deleteNotification: async (id) => {
    return apiCall(`${API_BASE_URL}/notifications`, {
      method: 'DELETE',
      body: JSON.stringify({ action: 'delete', id }),
    });
  },

  deleteReadNotifications: async () => {
    return apiCall(`${API_BASE_URL}/notifications`, {
      method: 'DELETE',
      body: JSON.stringify({ action: 'delete_all_read' }),
    });
  },

  /**
   * The account's own team: its members and its pending invitations.
   */
  getTeamMembers: async () => {
    return apiCall(`${API_BASE_URL}/team/members`);
  },

  inviteTeamMember: async (email, role) => {
    return apiCall(`${API_BASE_URL}/team/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  updateTeamMember: async (id, role) => {
    return apiCall(`${API_BASE_URL}/team/members`, {
      method: 'PATCH',
      body: JSON.stringify({ id, role }),
    });
  },

  removeTeamMember: async (id, type = 'member') => {
    return apiCall(`${API_BASE_URL}/team/members`, {
      method: 'DELETE',
      body: JSON.stringify({ id, type }),
    });
  },

  /**
   * The account's own API keys. The key material is returned once, when
   * the key is created.
   */
  getApiKeys: async () => {
    return apiCall(`${API_BASE_URL}/api-keys`);
  },

  createApiKey: async (name) => {
    return apiCall(`${API_BASE_URL}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  deleteApiKey: async (id) => {
    return apiCall(`${API_BASE_URL}/api-keys`, {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  },

  /**
   * The account's own activity trail.
   */
  getAuditLogs: async () => {
    return apiCall(`${API_BASE_URL}/audit-logs`);
  },

  /**
   * The account's own connected tools.
   */
  getIntegrations: async () => {
    return apiCall(`${API_BASE_URL}/integrations`);
  },

  /**
   * The account's own preferences.
   *
   * These belong to the account, not to the browser: the Settings page
   * and the Notifications page both read them from here, so the two
   * screens cannot disagree about the same preference.
   */
  getSettings: async () => {
    return apiCall(`${API_BASE_URL}/settings`);
  },
  /**
   * Save part of the account's preferences.
   *
   * Only the groups that are passed are changed; everything else keeps
   * its stored value.
   *
   * @param {{notifications?: object, appearance?: object}} patch
   */
  saveSettings: async (patch) => {
    return apiCall(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      body: JSON.stringify(patch || {}),
    });
  },

  /**
   * Whether the account has a second factor turned on.
   */
  getTwoFactor: async () => {
    return apiCall(`${API_BASE_URL}/two-factor`);
  },

  /**
   * Start setting the second factor up.
   *
   * The returned secret is not active yet — it becomes active once the
   * account proves it can produce a code from it.
   */
  setupTwoFactor: async () => {
    return apiCall(`${API_BASE_URL}/two-factor`, {
      method: 'POST',
      body: JSON.stringify({ action: 'setup' }),
    });
  },

  /**
   * Turn the second factor on, using a code from the authenticator app.
   */
  enableTwoFactor: async (code) => {
    return apiCall(`${API_BASE_URL}/two-factor`, {
      method: 'POST',
      body: JSON.stringify({ action: 'enable', code }),
    });
  },

  /**
   * Turn the second factor off. The password has to be confirmed.
   */
  disableTwoFactor: async (password) => {
    return apiCall(`${API_BASE_URL}/two-factor`, {
      method: 'POST',
      body: JSON.stringify({ action: 'disable', password }),
    });
  },

  connectIntegration: async (provider, settings = {}) => {
    return apiCall(`${API_BASE_URL}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider, settings }),
    });
  },

  disconnectIntegration: async (provider) => {
    return apiCall(`${API_BASE_URL}/integrations`, {
      method: 'DELETE',
      body: JSON.stringify({ provider }),
    });
  },

  /**
   * The account's profile and the statistics counted from its own rows.
   */
  getProfile: async () => {
    return apiCall(`${API_BASE_URL}/profile`);
  },

  saveProfile: async (profile) => {
    return apiCall(`${API_BASE_URL}/profile`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  },

  /**
   * Store the account's profile picture. The image is sent as a base64
   * data URL; the API validates it and writes it to disk.
   */
  uploadAvatar: async (dataUrl) => {
    return apiCall(`${API_BASE_URL}/profile/avatar`, {
      method: 'POST',
      body: JSON.stringify({ avatar: dataUrl }),
    });
  },

  /**
   * Record that the account finished the onboarding tour, so the flag
   * survives a page refresh instead of being lost with the cached user.
   */
  saveOnboarding: async (data = {}) => {
    return apiCall(`${API_BASE_URL}/auth/onboarding`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ---------------------------------------------------------------------------
// Report exports — temporary PDF security reports.
//
// The PDF report is generated in the browser. The client can keep it
// purely local (a straight file download) or store one copy on the
// server through this endpoint and share it with a download link.
//
// The stored copy is short-lived on purpose: the PDF embeds the user's
// own source code, so the API deletes the row and the file 24 hours
// after it was created.
// ---------------------------------------------------------------------------

/**
 * Convert a Blob (the generated PDF) into the base64 string the
 * reports endpoint expects.
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma === -1 ? dataUrl : dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the PDF file.'));
    reader.readAsDataURL(blob);
  });

export const reportAPI = {
  /**
   * The account's own report exports, newest first. Each entry carries
   * its download URL and the remaining hours before it is deleted.
   */
  listReports: async () => {
    return apiCall(`${API_BASE_URL}/reports`);
  },

  /**
   * Store a freshly generated report and get back its download link.
   *
   * @param {{ filename: string, title?: string, language?: string,
   *            score?: number, totalIssues?: number, contentBase64: string }} payload
   */
  createReport: async (payload) => {
    return apiCall(`${API_BASE_URL}/reports`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  /**
   * Delete a stored report right now instead of waiting for the expiry.
   */
  deleteReport: async (id) => {
    return apiCall(`${API_BASE_URL}/reports`, {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  },

  /**
   * The URL a single report can be downloaded from. The token — not the
   * JWT — unlocks it, so the link can be opened in a plain browser tab
   * or PDF viewer.
   */
  downloadUrl: (token) => `${API_BASE_URL}/reports/download?token=${encodeURIComponent(token || '')}`,
};

export default {
  apiCall,
  authAPI,
  publicAPI,
  dashboardAPI,
  API_ENDPOINTS,
  API_BASE_URL,
  API_ROOT_URL,
  getToken,
  setToken,
  clearToken,
};

/**
 * Turn a path the API stored (for example `/uploads/avatars/user_1.png`)
 * into a URL the browser can load.
 *
 * Absolute URLs and data URLs are handed back untouched, so a value that
 * was already a full link keeps working.
 */
export const resolveAssetUrl = (path) => {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${API_ROOT_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};
