#!/usr/bin/env node
/**
 * Finds the darkest shade of each Tailwind colour family that keeps
 * white text at or above a given contrast ratio.
 *
 * The gradient buttons in the app use white labels on a coloured ramp.
 * Several of those ramps are bright enough (cyan, emerald, amber) that
 * the white label falls well under the 4.5:1 AA floor. This script
 * finds, for every family, the shade that does work — so the fix is a
 * data table rather than guesswork.
 */
const MIN = Number(process.argv[2] || 4.5);

// The full Tailwind default ramp for the families the app uses.
const TAILWIND = {
  slate: ['#f8fafc','#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a'],
  blue: ['#eff6ff','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e40af','#1e3a8a'],
  cyan: ['#ecfeff','#cffafe','#a5f3fc','#67e8f9','#22d3ee','#06b6d4','#0891b2','#0e7490','#155e75','#164e63'],
  emerald: ['#ecfdf5','#d1fae5','#a7f3d0','#6ee7b7','#34d399','#10b981','#059669','#047857','#065f46','#064e3b'],
  teal: ['#f0fdfa','#ccfbf1','#99f6e4','#5eead4','#2dd4bf','#14b8a6','#0d9488','#0f766e','#115e59','#134e4a'],
  indigo: ['#eef2ff','#e0e7ff','#c7d2fe','#a5b4fc','#818cf8','#6366f1','#4f46e5','#4338ca','#3730a3','#312e81'],
  violet: ['#f5f3ff','#ede9fe','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95'],
  fuchsia: ['#fdf4ff','#fae8ff','#f5d0fe','#f0abfc','#e879f9','#d946ef','#c026d3','#a21caf','#86198f','#701a75'],
  amber: ['#fffbeb','#fef3c7','#fde68a','#fcd34d','#fbbf24','#f59e0b','#d97706','#b45309','#92400e','#78350f'],
  orange: ['#fff7ed','#ffedd5','#fed7aa','#fdba74','#fb923c','#f97316','#ea580c','#c2410c','#9a3412','#7c2d12'],
  pink: ['#fdf2f8','#fce7f3','#fbcfe8','#f9a8d4','#f472b6','#ec4899','#db2777','#be185d','#9d174d','#831843'],
  purple: ['#faf5ff','#f3e8ff','#e9d5ff','#d8b4fe','#c084fc','#a855f7','#9333ea','#7e22ce','#6b21a8','#581c87'],
  rose: ['#fff1f2','#ffe4e6','#fecdd3','#fda4af','#fb7185','#f43f5e','#e11d48','#be123c','#9f1239','#881337'],
  green: ['#f0fdf4','#dcfce7','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a','#15803d','#166534','#14532d'],
  red: ['#fef2f2','#fee2e2','#fecaca','#fca5a5','#f87171','#ef4444','#dc2626','#b91c1c','#991b1b','#7f1d1d'],
  yellow: ['#fefce8','#fef9c3','#fef08a','#fde047','#facc15','#eab308','#ca8a04','#a16207','#854d0e','#713f12'],
};

const SHADE_NAMES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
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

console.log(`Shades whose white text reaches ${MIN}:1\n`);
console.log('family   ' + SHADE_NAMES.slice(4).map((s) => String(s).padStart(6)).join(''));
console.log('-'.repeat(100));

const table = {};
for (const [family, ramp] of Object.entries(TAILWIND)) {
  const cells = [];
  table[family] = {};
  for (let i = 4; i < ramp.length; i += 1) {
    const r = ratio(WHITE, hexToRgb(ramp[i]));
    table[family][SHADE_NAMES[i]] = Math.round(r * 100) / 100;
    cells.push(String(Math.round(r * 100) / 100).padStart(6));
  }
  console.log(family.padEnd(9) + cells.join(''));
}

console.log('\n\nFor each failing gradient, the pair of shades that works:');
console.log('-'.repeat(100));

const FAILING = [
  ['amber', 500, 'orange', 500],
  ['emerald', 500, 'cyan', 500],
  ['emerald', 500, 'teal', 500],
  ['amber', 500, 'orange', 600],
  ['cyan', 500, 'blue', 500],
  ['emerald', 600, 'teal', 500],
  ['emerald', 500, 'blue', 500],
  ['blue', 600, 'cyan', 500],
  ['emerald', 600, 'teal', 600],
  ['violet', 500, 'blue', 500],
  ['violet', 500, 'indigo', 500],
  ['emerald', 600, 'blue', 600],
];

for (const [fa, sa, fb, sb] of FAILING) {
  const candidates = [];
  for (let ia = 4; ia < TAILWIND[fa].length; ia += 1) {
    for (let ib = 4; ib < TAILWIND[fb].length; ib += 1) {
      const a = hexToRgb(TAILWIND[fa][ia]);
      const b = hexToRgb(TAILWIND[fb][ib]);
      const avg = [0, 1, 2].map((c) => (a[c] + b[c]) / 2);
      const avgR = ratio(WHITE, avg);
      const worst = Math.min(ratio(WHITE, a), ratio(WHITE, b));
      if (worst >= MIN) {
        candidates.push({
          a: SHADE_NAMES[ia],
          b: SHADE_NAMES[ib],
          avg: avgR,
          worst,
        });
      }
    }
  }
  // Prefer the pair closest to the original shades (least visual change).
  candidates.sort((x, y) => {
    const dx = Math.abs(x.a - sa) + Math.abs(x.b - sb);
    const dy = Math.abs(y.a - sa) + Math.abs(y.b - sb);
    return dx - dy;
  });
  const best = candidates[0];
  const original = `from-${fa}-${sa} to-${fb}-${sb}`;
  if (best) {
    console.log(
      `${original.padEnd(34)} -> from-${fa}-${best.a} to-${fb}-${best.b}   ` +
        `white/avg=${best.avg.toFixed(2)} white/worst=${best.worst.toFixed(2)}`
    );
  } else {
    console.log(`${original.padEnd(34)} -> NO PAIR REACHES ${MIN}:1 WITH WHITE TEXT`);
  }
}
