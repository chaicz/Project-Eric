#!/usr/bin/env node
/**
 * Compares the routes declared in src/App.jsx with the routes the
 * end-to-end walkthrough actually visits, so a route added to the app
 * cannot silently escape the test.
 *
 * Usage: node scripts/check-route-coverage.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
const walkSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'e2e-walkthrough.cjs'), 'utf8');

// Every `path="..."` in the Routes tree, plus the root redirect.
const declared = [...appSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
const unique = [...new Set(declared)];

// The catch-all is not a real page.
const isCatchAll = (p) => p === '*';

// Some routes are redirects rather than pages. The old Analysis, Threats
// and Reports paths now point at the Security page with the matching
// tab, so they have no page of their own to visit.
const REDIRECTS = new Set(['/analysis', '/threats', '/reports']);

// The walkthrough's ROUTES array: `path: '/something'`.
const tested = [...walkSrc.matchAll(/\{\s*path:\s*'([^']+)'/g)].map((m) => m[1]);

// Some routes need their own setup and so cannot be reached through the
// shared ROUTES array — the onboarding tour needs an account that has not
// been onboarded yet, for instance. Those are covered by dedicated test
// functions, which are listed here so the coverage check stays honest.
const DEDICATED = {
  '/onboarding': 'testOnboarding',
};

const testedSet = new Set([...tested, ...Object.keys(DEDICATED)]);

const missing = unique.filter((p) => !isCatchAll(p) && !REDIRECTS.has(p) && !testedSet.has(p));
const extra = tested.filter((p) => !unique.includes(p) && !isCatchAll(p) && !REDIRECTS.has(p));

console.log('\nRoute coverage — src/App.jsx vs scripts/e2e-walkthrough.cjs\n');
console.log(`  declared in App.jsx : ${unique.filter((p) => !isCatchAll(p) && !REDIRECTS.has(p)).length}`);
console.log(`  visited by the test : ${testedSet.size}`);
console.log('');

if (missing.length) {
  console.log('  NOT visited by the walkthrough:');
  for (const p of missing) console.log(`    ${p}`);
} else {
  console.log('  every declared route is visited by the walkthrough');
}

const dedicated = Object.entries(DEDICATED);
if (dedicated.length) {
  console.log('\n  covered by a dedicated test function:');
  for (const [route, fn] of dedicated) {
    // The function has to actually exist in the walkthrough file, or the
    // route is only nominally covered.
    const exists = walkSrc.includes(`function ${fn}`);
    console.log(`    ${route.padEnd(16)} ${fn}${exists ? '' : '  (MISSING — function not found!)'}`);
    if (!exists) missing.push(route);
  }
}

if (extra.length) {
  console.log('\n  visited but not declared (walkthrough entries with no route):');
  for (const p of extra) console.log(`    ${p}`);
}

process.exitCode = missing.length ? 1 : 0;
