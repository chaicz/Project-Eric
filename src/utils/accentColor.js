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
 * The WCAG contrast ratio between two colours.
 *
 * @param {{r: number, g: number, b: number}} a
 * @param {{r: number, g: number, b: number}} b
 * @returns {number} 1 (identical) to 21 (black on white)
 */
function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-black used for text on a light accent. */
const DARK_CONTRAST = { r: 15, g: 23, b: 42 }; // #0F172A
/** White used for text on a dark accent. */
const LIGHT_CONTRAST = { r: 255, g: 255, b: 255 };

/**
 * Picks the text colour that reads best on top of the accent.
 *
 * The choice is made by comparing the actual contrast ratios of white
 * and near-black against the accent, rather than by a luminance
 * threshold. A threshold gets the answer wrong for the mid-tone
 * colours: on the default blue (#3B82F6) white scores 3.68:1 while
 * near-black scores 4.85:1, so the threshold picked the less readable
 * option and the active navigation pill fell under the 4.5:1 AA floor.
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {string} the hex colour to paint on top of the accent
 */
function contrastOn(rgb) {
  const onLight = contrastRatio(rgb, DARK_CONTRAST);
  const onDark = contrastRatio(rgb, LIGHT_CONTRAST);
  return onLight > onDark ? '#0F172A' : '#FFFFFF';
}

/**
 * Mixes a colour towards black.
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @param {number} amount 0 (unchanged) to 1 (black)
 * @returns {string} an `rgb()` string
 */
function mixFrom(rgb, amount) {
  const r = Math.round(rgb.r * (1 - amount));
  const g = Math.round(rgb.g * (1 - amount));
  const b = Math.round(rgb.b * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The surface the accent text sits on in dark mode: the sidebar's
 * `bg-slate-900/40` panel over the page background.
 */
const DARK_ACCENT_SURFACE = { r: 23, g: 32, b: 50 };

/**
 * A lighter version of the accent, for text on a dark surface.
 *
 * The accent colour itself is tuned to be a FILL — a button background
 * with a label on top of it. Used as the label colour on a dark panel
 * it lands just under the AA floor: the default blue scores 4.43:1 on
 * the sidebar panel, violet 3.85:1 and slate 2.15:1.
 *
 * Mixing towards white lifts the colour until it clears 4.5:1, so the
 * accent still reads as the accent but the label is legible.
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {string} the hex colour to paint accent text with
 */
function accentTextColor(rgb) {
  const MIN_CONTRAST = 4.5;
  for (let step = 0.15; step <= 0.85; step += 0.05) {
    const candidate = {
      r: Math.round(rgb.r + (255 - rgb.r) * step),
      g: Math.round(rgb.g + (255 - rgb.g) * step),
      b: Math.round(rgb.b + (255 - rgb.b) * step),
    };
    if (contrastRatio(candidate, DARK_ACCENT_SURFACE) >= MIN_CONTRAST) {
      return `#${[candidate.r, candidate.g, candidate.b]
        .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()}`;
    }
  }
  // Nothing in the mix reached the threshold — fall back to the lightest
  // step, which comes closest.
  const lightest = {
    r: Math.round(rgb.r + (255 - rgb.r) * 0.85),
    g: Math.round(rgb.g + (255 - rgb.g) * 0.85),
    b: Math.round(rgb.b + (255 - rgb.b) * 0.85),
  };
  return `#${[lightest.r, lightest.g, lightest.b]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
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
      contrast: '#0F172A',
      contrastStrong: '#0F172A',
      text: '#5895F7',
    };
  }

  // Some mid-tones sit in a dead zone where neither white nor near-black
  // reaches the 4.5:1 AA threshold — violet (#8B5CF6) scores 4.23:1 with
  // white and 4.22:1 with near-black. For those the fill itself is
  // darkened until the label on top of it clears the threshold.
  //
  // Only the *base* fill is checked. The darker `strong` shade is used
  // for hover states and for the gradient navigation pill, and a darker
  // fill is always easier to read with a near-black label — but it can
  // be easier with a white one. Forcing one label colour to work for
  // both shades is what produced the unreadable pill, so the label
  // colour is chosen for the base fill and the pill paints that same
  // fill rather than a gradient that ends on the opposite side of the
  // threshold.
  const MIN_CONTRAST = 4.5;
  const readable = (candidate) =>
    contrastRatio(candidate, DARK_CONTRAST) >= MIN_CONTRAST ||
    contrastRatio(candidate, LIGHT_CONTRAST) >= MIN_CONTRAST;

  let base = normalized;
  let fill = rgb;
  let contrast = contrastOn(rgb);

  if (!readable(fill)) {
    for (let step = 0.02; step <= 0.6; step += 0.02) {
      fill = {
        r: Math.round(rgb.r * (1 - step)),
        g: Math.round(rgb.g * (1 - step)),
        b: Math.round(rgb.b * (1 - step)),
      };
      contrast = contrastOn(fill);
      if (readable(fill)) {
        base = `#${[fill.r, fill.g, fill.b]
          .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()}`;
        break;
      }
    }
  }

  const strong = mixFrom(fill, 0.18);
  const strongRgb = {
    r: Math.round(fill.r * 0.82),
    g: Math.round(fill.g * 0.82),
    b: Math.round(fill.b * 0.82),
  };

  return {
    base,
    // The hover shade is derived from the *adjusted* fill, so it stays
    // in the same colour family as the base colour.
    strong,
    soft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
    ring: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`,
    contrast,
    // A label colour for the hover shade, which is darker than the base
    // and can fall on the other side of the contrast threshold.
    contrastStrong: contrastOn(strongRgb),
    // The accent used as TEXT on a dark surface. The base shade is
    // tuned to be a fill, and as a label on the dark sidebar panel it
    // sits just under the AA floor.
    text: accentTextColor(rgb),
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
  root.style.setProperty('--accent-contrast-strong', shades.contrastStrong);
  root.style.setProperty('--accent-text', shades.text);
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
