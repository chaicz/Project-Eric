// build-vsix.js — bypass vsce CLI, call createVSIX directly
const { createVSIX } = require('@vscode/vsce');
const path = require('path');
const fs = require('fs');

(async () => {
  const cwd = path.resolve(__dirname, '..');
  const out = path.join(cwd, 'dist');
  fs.mkdirSync(out, { recursive: true });
  try {
    const vsixPath = await createVSIX({
      cwd,
      useYarn: false,
      packageContents: undefined,
      dependencies: false,
    });
    console.log('Created VSIX at:', vsixPath);
    const target = path.join(out, path.basename(vsixPath));
    fs.copyFileSync(vsixPath, target);
    fs.unlinkSync(vsixPath);
    console.log('Moved to:', target, 'size:', fs.statSync(target).size, 'bytes');
  } catch (e) {
    console.error('FAILED:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
