#!/usr/bin/env node
/**
 * Summarises the dark-mode audit report into a compact, grouped list
 * so the fixes can be applied per source file.
 */
const fs = require('fs');
const path = require('path');

const REPORT = path.resolve(__dirname, '..', 'logs', 'dark-mode-audit', 'dark-mode-report.json');
const raw = fs.readFileSync(REPORT, 'utf8');
const data = JSON.parse(raw);

const findings = data.findings || [];

// Map a finding back to the source file that owns the class string.
const SRC = path.resolve(__dirname, '..', 'src');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.(jsx|js)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

const sourceFiles = walk(SRC);

/** Counts how many times a class fragment appears in each source file. */
function locate(className) {
  const tokens = className
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !t.startsWith('text-[') && t !== 'truncate');
  if (!tokens.length) return [];

  const hits = [];
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let score = 0;
    for (const t of tokens) {
      if (content.includes(t)) score += 1;
    }
    if (score === tokens.length) {
      hits.push({ file: path.relative(SRC, file), score });
    } else if (score >= Math.ceil(tokens.length * 0.6) && score >= 2) {
      hits.push({ file: path.relative(SRC, file), score, partial: true });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 3);
}

// Group by (color, bg, className)
const groups = new Map();
for (const f of findings) {
  const key = `${f.color}|${f.bg}|${f.className}|${f.tag}`;
  if (!groups.has(key)) {
    groups.set(key, { ...f, routes: new Set(), count: 0, texts: new Set() });
  }
  const g = groups.get(key);
  g.routes.add(f.route);
  g.count += 1;
  g.texts.add(f.text);
}

const list = [...groups.values()].sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));

console.log('='.repeat(100));
console.log(`DARK MODE VISIBILITY — ${findings.length} findings across ${list.length} distinct style rules`);
console.log('='.repeat(100));

for (const g of list) {
  const where = locate(g.className);
  const files = where.map((w) => w.file + (w.partial ? '?' : '')).join(', ') || '(not located)';
  console.log('');
  console.log(
    `[${g.problem}] ratio=${g.ratio} (need ${g.required})  size=${g.fontSize}px w=${g.weight}  hits=${g.count}`
  );
  console.log(`  color=${g.color}  bg=${g.bg}`);
  console.log(`  class="${g.className}"`);
  console.log(`  files: ${files}`);
  console.log(`  routes: ${[...g.routes].join(', ')}`);
  console.log(`  texts: ${[...g.texts].slice(0, 5).map((t) => JSON.stringify(t)).join(', ')}`);
}
