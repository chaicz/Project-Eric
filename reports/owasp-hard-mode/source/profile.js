// ---------------------------------------------------------------------------
// OWASP Hard Mode — profile definition
//
// "Hard mode" is a stricter analysis profile for the Project Eric OWASP
// scanner. The default profile is tuned for teaching: it fires on the
// textbook examples of each OWASP category and stays quiet enough that a
// beginner is not buried in noise.
//
// Hard mode tightens every threshold and adds a second tier of rules
// that catch the "almost correct" code the default profile deliberately
// ignores:
//
//   1. Tighter score thresholds. A category fails at a lower weight, so
//      two low-confidence hits are enough to fail instead of one.
//   2. Severity floors. A category's severity is raised to a minimum,
//      so a weak-but-real match cannot be downgraded to `info`.
//   3. The `hard` rule tier. Patterns the default profile never runs —
//      defence-in-depth checks, missing-control checks, and taint-style
//      flows that need more than one pattern to confirm.
//   4. Stricter pass criteria. A file only passes a category when the
//      corresponding mitigation hint is present in the source.
//
// The profile is data, not code. `buildHardPack()` in `hardPack.js`
// merges it into a copy of the shipped OWASP pack, so the default
// profile is never mutated.
// ---------------------------------------------------------------------------

/**
 * The severity ladder, ordered from most to least severe.
 * Used to raise a category's severity to the profile floor.
 */
export const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'];

/**
 * Analysis profiles.
 *
 * - `standard` mirrors the shipped pack exactly (thresholds and severities
 *   are read from the pack itself, so this profile has no overrides).
 * - `hard` is the stricter profile described above.
 */
export const PROFILES = {
  standard: {
    id: 'standard',
    label: 'Standard',
    description:
      'Balanced analysis tuned for teaching. Fires on clear textbook violations and stays quiet on incidental matches.',
    /** Weight at which a category flips to `fail`. */
    failThreshold: null,
    /** Weight at which a category flips to `warning`. */
    warnThreshold: null,
    /** Minimum severity each category is allowed to report. */
    severityFloor: {},
    /** Extra rule tiers to merge in. */
    tiers: [],
    /** Mitigation hints that must appear for a category to pass. */
    requiredMitigations: {},
    /** Weight multiplier applied to every rule before scoring. */
    weightMultiplier: 1,
    /** When true, evidence snippets are longer so more context is shown. */
    extendedEvidence: false,
    /** Maximum evidence entries kept per category. */
    maxEvidence: 8,
  },

  hard: {
    id: 'hard',
    label: 'Hard Mode',
    description:
      'Strict analysis for security reviews and release gates. Lower thresholds, severity floors, defence-in-depth checks, and mandatory mitigation controls.',
    /**
     * A category fails at a total weight of 3 instead of the default 4,
     * and warns at 1. The default pack fails at 4 / warns at 1, so hard
     * mode only moves the fail line down.
     */
    failThreshold: 3,
    warnThreshold: 1,
    /**
     * Every category reports at least `medium`. In the default profile a
     * single weak match in A09 (Logging Failures) lands on `low`/`info`,
     * which reads as "not worth fixing".
     */
    severityFloor: {
      A01: 'high',
      A02: 'critical',
      A03: 'critical',
      A04: 'medium',
      A05: 'medium',
      A06: 'high',
      A07: 'high',
      A08: 'high',
      A09: 'medium',
      A10: 'high',
    },
    /** Rule tiers merged into the pack for this profile. */
    tiers: ['hard'],
    /**
     * Mitigation hints. A category only reports `pass` when the file
     * contains at least one of these markers. This turns "we found no
     * pattern" into "we found no pattern *and* we saw the control".
     *
     * The list is per-category; an empty list means the category has no
     * mandatory-control requirement.
     */
    requiredMitigations: {
      A01: ['authorize', 'abort_unless', 'abort_if', '@PreAuthorize', 'Gate::', '->can(', 'policy(', 'isOwner', 'current_user', 'req.user', 'ctx.user', 'permission', 'rbac', 'acl'],
      A02: ['bcrypt', 'argon2', 'scrypt', 'password_hash', 'password_verify', 'openssl_encrypt', 'fernet', 'secrets.token', 'crypto.randomBytes', 'secrets.token_hex', 'SecureRandom', 'crypto.randomUUID'],
      A03: ['prepare(', 'prepareStatement', 'bindParam', 'bindValue', 'parameterized', 'sanitize', 'escape(', 'prepared_statement', 'sqlx', 'placeholder', '?'],
      A04: ['rateLimit', 'rate_limit', 'throttl', 'csrf', 'xss', 'validation', 'schema.', 'zod', 'joi', 'yup', 'abort_unless', 'policy('],
      A05: ['cors', 'helmet', 'csp', 'Content-Security-Policy', 'X-Frame-Options', 'NODE_ENV', 'APP_ENV', 'production', 'Strict-Transport-Security'],
      A07: ['bcrypt', 'argon2', 'scrypt', 'password_hash', 'password_verify', 'totp', 'mfa', '2fa', 'timestep', 'rateLimit', 'rate_limit', 'throttl'],
      A08: ['verify_signature', 'signature', 'sha256', 'sha512', 'hmac', 'safe_load', 'json.loads', 'schema', 'zod', 'joi'],
      A09: ['logger', 'winston', 'pino', 'bunyan', 'morgan', 'slf4j', 'log4j', 'logging.getLogger', 'Rails.logger', 'log/slog', 'tracing::', 'audit'],
      A10: ['allowlist', 'allowList', 'allowed_hosts', 'allowedHosts', 'isValidUrl', 'validateUrl', 'isUrlSafe', 'URLValidator', 'deny_list', 'blocklist', 'ipaddress', 'is_private', 'isPrivate'],
    },
    /** Every rule's weight is multiplied by 1.35 before scoring. */
    weightMultiplier: 1.35,
    /** Show more of the matched line so reviewers see the surrounding call. */
    extendedEvidence: true,
    /** Keep up to 20 evidence entries per category instead of 8. */
    maxEvidence: 20,
  },
};

/** The profile used when the caller does not name one. */
export const DEFAULT_PROFILE_ID = 'standard';

/**
 * Resolve a profile by id, falling back to the standard profile.
 *
 * @param {string|object|null} profile
 * @returns {object}
 */
export const resolveProfile = (profile) => {
  if (!profile) return PROFILES[DEFAULT_PROFILE_ID];
  if (typeof profile === 'string') {
    return PROFILES[profile] || PROFILES[DEFAULT_PROFILE_ID];
  }
  return { ...PROFILES[DEFAULT_PROFILE_ID], ...profile };
};

/**
 * Raise a severity to the profile floor without ever lowering it.
 *
 * @param {string} severity
 * @param {string} floor
 * @returns {string}
 */
export const applySeverityFloor = (severity, floor) => {
  if (!floor) return severity;
  const current = SEVERITY_ORDER.indexOf(String(severity || 'info').toLowerCase());
  const wanted = SEVERITY_ORDER.indexOf(String(floor).toLowerCase());
  if (wanted < 0) return severity;
  if (current < 0) return floor;
  return SEVERITY_ORDER[Math.max(current, wanted)];
};

/**
 * The list of profile ids, for callers that render a picker.
 *
 * @returns {Array<{id: string, label: string, description: string}>}
 */
export const listProfiles = () =>
  Object.values(PROFILES).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
  }));
