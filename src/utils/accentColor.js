// ---------------------------------------------------------------------------
// Accent colour
// ---------------------------------------------------------------------------
//
// The Settings page offers a palette of accent colours. Choosing one has to
// change the whole application's primary colour — buttons, focus rings, the
// active navigation item — and the choice has to survive a reload and follow
// the account to another machine.
//
// The colour is published to the document as a set of CSS custom properties
// on `<html>`:
//
//   --accent-color         the colour itself
//   --accent-color-strong  a darker shade, used for hover states
//   --accent-color-soft    a faint tint, used for surfaces
//   --accent-color-ring    a translucent ring, used for focus glows
//   --accent-contrast      near-black or white, whichever reads on the colour
//
// The shades are computed here rather than in CSS so the result is the same
// in every browser — `color-mix()` is still not available everywhere.
// ---------------------------------------------------------------------------

/** The palette offered on the Appearance tab. */
export const ACCENT_PRESETS = [
  { id: 'blue',    label: 'Blue',    value: '#3B82F6' },
  { id: 'violet',  label: 'Violet',  value: '#8B5CF6' },
  { id: 'pink',    label: 'Pink',    value: '#EC4899' },
  { id: 'emerald', label: 'Green',   value: '#10B981' },
  { id: 'amber',   label: 'Amber',   value: '#F59E0B' },
  { id: 'red',     label: 'Red',     value: '#EF4444' },
  { id: 'cyan',    label: 'Cyan',    value: '#06B6D4' },
  { id: 'slate',   label: 'Slate',   value: '#475569' },
];

/** The accent a brand-new account starts with. */
export const DEFAULT_ACCENT = '#3B82F6';

/**
 * Turn any accepted colour notation into `#RRGGBB`.
 *
 * The API only stores a six-digit hex, so a short form or a stray
 * whitespace must not reach the server — it is expanded here instead.
 *
 * @param {string} value
 * @returns {string|null} the normalised colour, or null when it is not a colour
 */
export function normalizeAccent(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!/^#?[0-9a-f]{6}$/.test(raw)) {
    if (/^#?[0-9a-f]{3}$/.test(raw)) {
      const [r, g, b] = raw.replace('#', '').split('');
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return null;
  }
  return `#${raw.replace('#', '')}`.toUpperCase();
}

/**
 * Split a hex colour into its channels.
 *
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}|null}
 */
function channels(hex) {
  const normalized = normalizeAccent(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

/**
 * The relative brightness of a colour, used to pick readable text on top
 * of it.
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {number} 0 (black) to 1 (white)
 */
function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Every shade the stylesheet needs, derived from one colour.
 *
 * @param {string} hex
 * @returns {{base: string, strong: string, soft: string, ring: string, contrast: string}}
 */
export function accentShades(hex) {
  const normalized = normalizeAccent(hex) || DEFAULT_ACCENT;
  const rgb = channels(normalized);
  if (!rgb) {
    return {
      base: DEFAULT_ACCENT,
      strong: '#2563EB',
      soft: 'rgba(59, 130, 246, 0.12)',
      ring: 'rgba(59, 130, 246, 0.30)',
      contrast: '#FFFFFF',
    };
  }

  // The hover shade is the colour mixed with black, so a light accent
  // still gets a darker hover state instead of a washed-out one.
  const mix = (amount) => {
    const r = Math.round(rgb.r * (1 - amount));
    const g = Math.round(rgb.g * (1 - amount));
    const b = Math.round(rgb.b * (1 - amount));
    return `rgb(${r}, ${g}, ${b})`;
  };

  return {
    base: normalized,
    strong: mix(0.18),
    soft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
    ring: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`,
    contrast: luminance(rgb) > 0.55 ? '#0F172A' : '#FFFFFF',
  };
}

/**
 * Publish the accent colour to the document.
 *
 * The values land on `<html>` as custom properties, so every rule in
 * `index.css` that reads `--accent-color` follows the choice.
 *
 * @param {string} hex
 * @returns {string|null} the normalised colour that was applied
 */
export function applyAccentColor(hex) {
  const normalized = normalizeAccent(hex);
  if (!normalized) return null;
  if (typeof document === 'undefined') return normalized;

  const shades = accentShades(normalized);
  const root = document.documentElement;
  root.style.setProperty('--accent-color', shades.base);
  root.style.setProperty('--accent-color-strong', shades.strong);
  root.style.setProperty('--accent-color-soft', shades.soft);
  root.style.setProperty('--accent-color-ring', shades.ring);
  root.style.setProperty('--accent-contrast', shades.contrast);
  return normalized;
}

/**
 * The name of a preset, for the confirmation toast.
 *
 * @param {string} hex
 * @returns {string}
 */
export function accentLabel(hex) {
  const normalized = normalizeAccent(hex);
  const preset = ACCENT_PRESETS.find((p) => p.value === normalized);
  if (preset) return preset.label;
  return normalized || 'custom';
}
