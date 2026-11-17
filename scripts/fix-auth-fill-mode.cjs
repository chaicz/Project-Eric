#!/usr/bin/env node
/**
 * Replaces the `both` fill mode with `forwards` on the auth entrance
 * animations.
 *
 * `animation-fill-mode: both` applies the animation's backwards fill —
 * the `from` keyframe — for the whole delay before the animation
 * starts. That keyframe is `opacity: 0`, so during the delay the
 * element is fully transparent.
 *
 * The brand panel is an isolated stacking context that contains a
 * grain overlay painted with `mix-blend-mode: overlay`. A fully
 * transparent element inside such a context is composited into the
 * blend group, and Chrome then dropped the whole element: the hero
 * headline, the description and the feature list on the sign-in and
 * sign-up pages were never painted at all. The panel rendered as an
 * empty gradient with only the logo showing.
 *
 * `forwards` keeps the end state after the animation completes and
 * has no backwards fill, so the element is never composited while
 * invisible.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'src');

const TARGETS = [
  'components/auth/BrandPanel.jsx',
  'components/auth/FormShell.jsx',
  'components/auth/AuthInput.jsx',
  'components/auth/FadeIn.jsx',
];

let total = 0;
for (const rel of TARGETS) {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) {
    console.log(`skip ${rel} (not found)`);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  // `auth-fade-up 0.6s ease-out 100ms both` -> `... forwards`
  content = content.replace(/(auth-fade-up\s+[^'"]*?)\bboth\b/g, '$1forwards');
  // `auth-event-in 0.6s ease-out 0ms both` -> `... forwards`
  content = content.replace(/(auth-event-in\s+[^'"]*?)\bboth\b/g, '$1forwards');

  if (content !== before) {
    fs.writeFileSync(file, content);
    const count = (before.match(/\bboth\b/g) || []).length - (content.match(/\bboth\b/g) || []).length;
    total += count;
    console.log(`${rel}: ${count} fill mode(s) changed to forwards`);
  } else {
    console.log(`${rel}: no changes`);
  }
}
console.log(`\nTotal: ${total}`);
