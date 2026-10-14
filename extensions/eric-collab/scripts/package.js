// scripts/package.js
// Build the extension and create a .vsix file using @vscode/vsce.
// Run with:  node scripts/package.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'out');
const vsixDir = path.join(root, 'dist');

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

function ensure(p) {
  fs.mkdirSync(p, { recursive: true });
}

(function main() {
  // 1. Compile TypeScript AND bundle deps (esbuild → out/extension.js).
  run('node scripts/build.js');

  // 2. Verify output
  if (!fs.existsSync(path.join(out, 'extension.js'))) {
    console.error('Build failed: out/extension.js missing');
    process.exit(1);
  }

  // 3. Locate vsce (prefer local install)
  let vsce = path.join(root, 'node_modules', '.bin', 'vsce.cmd');
  if (!fs.existsSync(vsce)) {
    run('npm install --no-save @vscode/vsce');
    vsce = path.join(root, 'node_modules', '.bin', 'vsce.cmd');
  }

  // 4. Package
  ensure(vsixDir);
  // The path can contain spaces (e.g. "D:\webpage design\...") — quote it.
  const vsceArgs = ['package', '--no-dependencies', '--out', `"${vsixDir}"`];
  run(`"${vsce}" ${vsceArgs.join(' ')}`);

  const vsix = fs
    .readdirSync(vsixDir)
    .filter((f) => f.endsWith('.vsix'))
    .map((f) => path.join(vsixDir, f));
  if (vsix.length === 0) {
    console.error('No .vsix produced');
    process.exit(1);
  }
  console.log('\n✓ Built:', vsix[0]);
})();
