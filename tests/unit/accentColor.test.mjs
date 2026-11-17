import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  normalizeAccent,
  accentShades,
  applyAccentColor,
  accentLabel,
} from '../../src/utils/accentColor.js';

/**
 * The WCAG contrast ratio between two colours.
 *
 * Accepts `#RRGGBB` and `rgb(r, g, b)` so it can be used on the accent
 * shades, which are published in the `rgb()` notation.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 1 (identical) to 21 (black on white)
 */
function contrastRatio(a, b) {
  const toChannels = (color) => {
    const text = String(color).trim();
    if (text.startsWith('#')) {
      const value = parseInt(text.slice(1), 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }
    const match = text.match(/(\d+)\D+(\d+)\D+(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
  };

  const luminance = (color) => {
    const channels = toChannels(color).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('utils/accentColor — normalizeAccent', () => {
  it('normalises a six digit hex to upper case', () => {
    assert.equal(normalizeAccent('#3b82f6'), '#3B82F6');
    assert.equal(normalizeAccent('3b82f6'), '#3B82F6');
  });

  it('expands the three digit shorthand', () => {
    assert.equal(normalizeAccent('#abc'), '#AABBCC');
    assert.equal(normalizeAccent('abc'), '#AABBCC');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(normalizeAccent('  #3B82F6  '), '#3B82F6');
  });

  it('returns null for a value that is not a colour', () => {
    assert.equal(normalizeAccent('red'), null);
    assert.equal(normalizeAccent('#12345'), null);
    assert.equal(normalizeAccent('#1234567'), null);
    assert.equal(normalizeAccent('rgb(1,2,3)'), null);
  });

  it('returns null for a non-string input', () => {
    assert.equal(normalizeAccent(null), null);
    assert.equal(normalizeAccent(undefined), null);
    assert.equal(normalizeAccent(123), null);
    assert.equal(normalizeAccent({}), null);
  });

  it('returns null for an empty string', () => {
    assert.equal(normalizeAccent(''), null);
    assert.equal(normalizeAccent('   '), null);
  });
});

describe('utils/accentColor — accentShades', () => {
  it('derives every shade from the base colour', () => {
    const s = accentShades('#3B82F6');
    assert.equal(s.base, '#3B82F6');
    assert.match(s.strong, /^rgb\(\d+, \d+, \d+\)$/);
    assert.match(s.soft, /^rgba\(\d+, \d+, \d+, 0\.12\)$/);
    assert.match(s.ring, /^rgba\(\d+, \d+, \d+, 0\.30\)$/);
  });

  it('picks a dark contrast on a light colour', () => {
    assert.equal(accentShades('#FFFFFF').contrast, '#0F172A');
  });

  it('picks a light contrast on a dark colour', () => {
    assert.equal(accentShades('#000000').contrast, '#FFFFFF');
  });

  it('picks whichever of white / near-black actually reads better', () => {
    // The default blue is a mid-tone: white on it scores 3.68:1 while
    // near-black scores 4.85:1, so near-black is the readable choice.
    assert.equal(accentShades('#3B82F6').contrast, '#0F172A');
    assert.equal(accentShades('#10B981').contrast, '#0F172A');
    assert.equal(accentShades('#F59E0B').contrast, '#0F172A');
    assert.equal(accentShades('#06B6D4').contrast, '#0F172A');
    assert.equal(accentShades('#475569').contrast, '#FFFFFF');
    assert.equal(accentShades('#1E293B').contrast, '#FFFFFF');
  });

  it('keeps the label on the accent above the 4.5:1 AA threshold', () => {
    for (const preset of ACCENT_PRESETS) {
      const shades = accentShades(preset.value);
      // The fill that is actually painted is `shades.base` — a mid-tone
      // with no readable label colour is darkened until it works.
      const ratio = contrastRatio(shades.base, shades.contrast);
      assert.ok(
        ratio >= 4.5,
        `${preset.label} (${preset.value} -> ${shades.base}) label contrast is ${ratio.toFixed(2)}:1, needs 4.5:1`
      );
    }
  });

  it('keeps the label on the hover shade above the 4.5:1 AA threshold', () => {
    for (const preset of ACCENT_PRESETS) {
      const shades = accentShades(preset.value);
      // The hover shade is an `rgb()` string, so it is compared against
      // the same colour in the same notation.
      const ratio = contrastRatio(shades.strong, shades.contrastStrong);
      assert.ok(
        ratio >= 4.5,
        `${preset.label} hover label contrast is ${ratio.toFixed(2)}:1, needs 4.5:1`
      );
    }
  });

  it('keeps accent TEXT readable on the dark sidebar panel', () => {
    // The sidebar panel in dark mode: `bg-slate-900/40` over the page.
    const DARK_PANEL = '#172032';
    for (const preset of ACCENT_PRESETS) {
      const shades = accentShades(preset.value);
      const ratio = contrastRatio(shades.text, DARK_PANEL);
      assert.ok(
        ratio >= 4.5,
        `${preset.label} accent text contrast on the dark panel is ${ratio.toFixed(2)}:1, needs 4.5:1`
      );
    }
  });

  it('falls back to the default accent for an invalid colour', () => {
    const s = accentShades('not-a-colour');
    assert.equal(s.base, DEFAULT_ACCENT);
    assert.equal(s.contrast, '#0F172A');
  });

  it('falls back to the default accent for null', () => {
    assert.equal(accentShades(null).base, DEFAULT_ACCENT);
    assert.equal(accentShades(undefined).base, DEFAULT_ACCENT);
  });

  it('darkens the hover shade relative to the base colour', () => {
    const s = accentShades('#FFFFFF');
    const [, r, g, b] = s.strong.match(/rgb\((\d+), (\d+), (\d+)\)/).map(Number);
    assert.ok(r < 255 && g < 255 && b < 255);
  });
});

describe('utils/accentColor — applyAccentColor', () => {
  it('publishes the CSS custom properties on the root element', () => {
    const applied = applyAccentColor('#3B82F6');
    assert.equal(applied, '#3B82F6');
    const style = document.documentElement.style;
    assert.equal(style.getPropertyValue('--accent-color'), '#3B82F6');
    assert.ok(style.getPropertyValue('--accent-color-strong').length > 0);
    assert.ok(style.getPropertyValue('--accent-color-soft').length > 0);
    assert.ok(style.getPropertyValue('--accent-color-ring').length > 0);
    assert.ok(style.getPropertyValue('--accent-contrast').length > 0);
    assert.ok(style.getPropertyValue('--accent-text').length > 0);
  });

  it('returns null and changes nothing for an invalid colour', () => {
    const before = document.documentElement.style.getPropertyValue('--accent-color');
    assert.equal(applyAccentColor('nope'), null);
    assert.equal(document.documentElement.style.getPropertyValue('--accent-color'), before);
  });

  it('returns null for a null input', () => {
    assert.equal(applyAccentColor(null), null);
  });
});

describe('utils/accentColor — accentLabel', () => {
  it('names a preset', () => {
    assert.equal(accentLabel('#3B82F6'), 'Blue');
    assert.equal(accentLabel('#10B981'), 'Green');
  });

  it('returns the normalised colour for a custom value', () => {
    assert.equal(accentLabel('#123456'), '#123456');
  });

  it('returns "custom" for an invalid value', () => {
    assert.equal(accentLabel('nonsense'), 'custom');
    assert.equal(accentLabel(''), 'custom');
  });
});

describe('utils/accentColor — presets', () => {
  it('every preset normalises to its own value', () => {
    for (const preset of ACCENT_PRESETS) {
      assert.equal(normalizeAccent(preset.value), preset.value.toUpperCase());
    }
  });

  it('the default accent is one of the presets', () => {
    assert.ok(ACCENT_PRESETS.some((p) => p.value === DEFAULT_ACCENT));
  });
});
