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
    assert.equal(accentShades('#3B82F6').contrast, '#FFFFFF');
  });

  it('falls back to the default accent for an invalid colour', () => {
    const s = accentShades('not-a-colour');
    assert.equal(s.base, DEFAULT_ACCENT);
    assert.equal(s.contrast, '#FFFFFF');
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
