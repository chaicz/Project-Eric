#!/usr/bin/env node
/**
 * Checks every gradient-filled surface that carries white text.
 *
 * A gradient has no single background colour, so the audit measures the
 * *average* of the two stops. A gradient whose lightest end is bright
 * enough (cyan, emerald, amber) drags that average up until white text
 * falls under the 4.5:1 AA floor — the label reads as washed out.
 *
 * This script reports the worst-case ratio for each gradient the
 * codebase actually uses, so the failing ones can be darkened.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'src');

// The Tailwind default palette, limited to the shades the app uses.
const PALETTE = {
  blue: { 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
  cyan: { 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
  emerald: { 500: '#10b981', 600: '#059669', 700: '#047857' },
  teal: { 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
  indigo: { 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
  violet: { 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
  fuchsia: { 600: '#c026d3', 700: '#a21caf' },
  amber: { 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
  orange: { 500: '#f97316', 600: '#ea580c', 700: '#c2410c' },
  slate: { 700: '#334155', 800: '#1e293b' },
  purple: { 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce' },
  rose: { 500: '#f43f5e', 600: '#e11d48' },
  red: { 500: '#ef4444', 600: '#dc2626' },
  green: { 500: '#22c55e', 600: '#16a34a' },
  yellow: { 500: '#eab308', 600: '#ca8a04' },
  pink: { 500: '#ec4899', 600: '#db2777' },
};

const lookup = (name, shade) => {
  const family = PALETTE[name];
  if (!family) return null;
  return family[String(shade)] || null;
};

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const luminance = ([r, g, b]) => {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

const ratio = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const WHITE = [255, 255, 255];
const NEAR_BLACK = [15, 23, 42];

// Walk the source tree.
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.(jsx|js)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

const files = walk(SRC);
const rows = [];

// `bg-gradient-to-r from-blue-600 to-cyan-500 text-white`
const GRADIENT_RE = /from-([a-z]+)-(\d{3})\s+to-([a-z]+)-(\d{3})/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    if (!/text-white/.test(line)) return;
    GRADIENT_RE.lastIndex = 0;
    let m;
    while ((m = GRADIENT_RE.exec(line)) !== null) {
      const from = lookup(m[1], m[2]);
      const to = lookup(m[3], m[4]);
      if (!from || !to) continue;

      const fromRgb = hexToRgb(from);
      const toRgbValue = hexToRgb(to);
      const avg = [0, 1, 2].map((c) => (fromRgb[c] + toRgbValue[c]) / 2);

      const whiteOnAvg = ratio(WHITE, avg);
      const whiteOnLightest = ratio(WHITE, fromRgb);
      const whiteOnDarkest = ratio(WHITE, toRgbValue);
      const blackOnAvg = ratio(NEAR_BLACK, avg);

      rows.push({
        file: path.relative(path.resolve(__dirname, '..'), file),
        line: i + 1,
        gradient: `from-${m[1]}-${m[2]} to-${m[3]}-${m[4]}`,
        from,
        to,
        whiteOnAvg: Math.round(whiteOnAvg * 100) / 100,
        worstWhite: Math.round(Math.min(whiteOnLightest, whiteOnDarkest) * 100) / 100,
        blackOnAvg: Math.round(blackOnAvg * 100) / 100,
        passesAvg: whiteOnAvg >= 4.5,
        passesWorst: Math.min(whiteOnLightest, whiteOnDarkest) >= 4.5,
        text: line.trim().slice(0, 90),
      });
    }
  });
}

// Group by gradient so the same one is only reported once.
const byGradient = new Map();
for (const r of rows) {
  const key = r.gradient;
  if (!byGradient.has(key)) byGradient.set(key, { ...r, hits: [], files: new Set() });
  const g = byGradient.get(key);
  g.hits.push(`${r.file}:${r.line}`);
  g.files.add(r.file);
}

const list = [...byGradient.values()].sort((a, b) => a.whiteOnAvg - b.whiteOnAvg);

console.log('='.repeat(110));
console.log('GRADIENT + WHITE TEXT — contrast of the averaged gradient, and of its lightest end');
console.log('='.repeat(110));
console.log('');

let failing = 0;
for (const g of list) {
  const status = g.passesWorst ? 'PASS' : g.passesAvg ? 'EDGE' : 'FAIL';
  if (status !== 'PASS') failing += 1;
  console.log(
    `[${status}] ${g.gradient.padEnd(32)} white/avg=${String(g.whiteOnAvg).padStart(5)} ` +
      `white/worst=${String(g.worstWhite).padStart(5)} black/avg=${String(g.blackOnAvg).padStart(5)} ` +
      `uses=${g.hits.length}`
  );
  console.log(`         ${g.from} -> ${g.to}`);
  console.log(`         ${[...g.files].join(', ')}`);
}

console.log('');
console.log(`${list.length} distinct gradients, ${failing} below the 4.5:1 AA floor at their lightest end.`);
console.log('');
console.log('How to read this:');
console.log('  white/avg  — the ratio of white text against the average of the two stops.');
console.log('               This is what the dark-mode audit measures.');
console.log('  white/worst— white text against the lightest single stop of the gradient.');
console.log('               This is the honest worst case for text sitting on the ramp.');
console.log('  black/avg  — near-black text against the average, for comparison.');
