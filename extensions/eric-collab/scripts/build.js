// scripts/build.js
// Build the extension:
//   1. Compile TypeScript with `tsc` (preserves source maps for debugging)
//   2. Bundle src/extension.ts → out/extension.js with esbuild, inlining
//      the `localtunnel` dependency so the .vsix doesn't need a separate
//      node_modules step.
//
// Run:  node scripts/build.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'out');

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

function ensure(p) {
  fs.mkdirSync(p, { recursive: true });
}

(async function main() {
  ensure(out);

  // 1. Type-check + emit plain JS (used as a sanity check + source maps).
  run('npx tsc -p ./');

  // 2. Locate esbuild.
  const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild.cmd');
  if (!fs.existsSync(esbuild)) {
    console.error('esbuild not found. Run `npm install --save-dev esbuild`.');
    process.exit(1);
  }

  // 3. Bundle the entry point. esbuild resolves `require('localtunnel')` and
  //    inlines the dependency + its transitive deps into one file. The
  //    other out/*.js files (collabClient, statusBar, etc.) become unused
  //    for the actual extension run, but are kept for debugging.
  const args = [
    'src/extension.ts',
    '--bundle',
    '--platform=node',
    '--target=node18',
    '--format=cjs',
    '--external:vscode',          // vscode is provided by the host
    '--sourcemap',
    '--outfile=out/extension.js',
    '--log-level=info',
  ];
  run(`"${esbuild}" ${args.join(' ')}`);

  // 4. Print a summary.
  const stat = fs.statSync(path.join(out, 'extension.js'));
  console.log(`\n✓ out/extension.js  (${(stat.size / 1024).toFixed(1)} KB)`);
})();
