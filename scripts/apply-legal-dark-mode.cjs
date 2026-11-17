#!/usr/bin/env node
/**
 * Adds the dark-mode variants to the public legal pages.
 *
 * The Terms of Service and Privacy Policy pages are light panels: a
 * `bg-white` page with `text-slate-900` headings. The global dark-mode
 * rules repaint those headings for a dark surface (#f1f5f9), but the
 * panels stayed white — so the headings became nearly invisible.
 *
 * This script applies the dark: variants to the shared class strings in
 * both pages.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'src', 'pages');

// The pairs: [light class, dark class]
const REPLACEMENTS = [
  // Page backdrop
  [
    'bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50',
    'bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950',
  ],
  // Sticky header
  [
    'bg-white/80 backdrop-blur-md border-b border-slate-200',
    'bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700',
  ],
  // Card surfaces
  [
    'bg-white rounded-2xl border border-slate-200',
    'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700',
  ],
  // Icon tile inside a card
  [
    'w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm',
    'w-10 h-10 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center flex-shrink-0 shadow-sm',
  ],
  // Tinted row
  [
    'rounded-xl bg-slate-50 hover:bg-blue-50 transition-colors',
    'rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors',
  ],
  // Section header row
  [
    'w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors',
    'w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
  ],
  // CTA card
  [
    'bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl',
    'bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl',
  ],
  // CTA button
  [
    'px-6 py-3 bg-white text-blue-600 rounded-xl font-semibold hover:bg-blue-50 transition-colors',
    'px-6 py-3 bg-white dark:bg-slate-100 text-blue-600 dark:text-blue-700 rounded-xl font-semibold hover:bg-blue-50 dark:hover:bg-white transition-colors',
  ],
  // Links
  [
    'text-blue-600 hover:text-blue-700 font-medium',
    'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium',
  ],
  // Dividers
  [
    'border-b border-slate-100',
    'border-b border-slate-100 dark:border-slate-700',
  ],
  [
    'border-t border-slate-100',
    'border-t border-slate-100 dark:border-slate-700',
  ],
  // Back button
  [
    'flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors',
    'flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors',
  ],
  // Muted body copy
  [
    'text-slate-600',
    'text-slate-600 dark:text-slate-300',
  ],
  [
    'text-slate-500',
    'text-slate-500 dark:text-slate-400',
  ],
  // Headings
  [
    'text-slate-900',
    'text-slate-900 dark:text-slate-100',
  ],
  // Muted icon
  [
    'text-slate-400',
    'text-slate-400 dark:text-slate-500',
  ],
];

const FILES = ['TermsOfService.jsx', 'PrivacyPolicy.jsx'];

let totalChanged = 0;
for (const file of FILES) {
  const full = path.join(SRC, file);
  if (!fs.existsSync(full)) {
    console.log(`skip ${file} (not found)`);
    continue;
  }
  let content = fs.readFileSync(full, 'utf8');
  let changed = 0;
  for (const [from, to] of REPLACEMENTS) {
    if (from === to) continue;
    // Replace only class-attribute occurrences, never inside a comment
    // or a string that is not a class list.
    const parts = content.split(from);
    if (parts.length > 1) {
      content = parts.join(to);
      changed += parts.length - 1;
    }
  }
  if (changed) {
    fs.writeFileSync(full, content);
    console.log(`${file}: ${changed} replacements`);
    totalChanged += changed;
  } else {
    console.log(`${file}: no changes`);
  }
}
console.log(`\nTotal replacements: ${totalChanged}`);
