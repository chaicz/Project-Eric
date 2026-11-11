// Copies the freshly-built Eric Collab extension into the code-server
// extension folder so the running workbench picks up the change.
// Mirrors scripts/deploy-owasp-extension.cjs for the collab extension.
const fs = require('fs');
const path = require('path');

const SRC = 'D:/webpage design/extensions/eric-collab';
const DST = path.join(
  process.env.LOCALAPPDATA,
  'code-server',
  'Data',
  'extensions',
  'project-eric.eric-collab-0.2.0'
);

// The extension entry point (`out/extension.js`) is a single esbuild
// bundle, so that one file is what actually runs. The sibling `out/*.js`
// files are the plain `tsc` output kept for debugging — we copy them
// too so the deployed folder matches a local build, but the bundle is
// what matters.
const items = [
  'out/extension.js',
  'out/extension.js.map',
  'out/collabClient.js',
  'out/collabClient.js.map',
  'out/roomManager.js',
  'out/roomManager.js.map',
  'out/sessionState.js',
  'out/sessionState.js.map',
  'out/textSync.js',
  'out/textSync.js.map',
  'out/sidebarView.js',
  'out/sidebarView.js.map',
  'out/statusBar.js',
  'out/statusBar.js.map',
  'out/tunnelManager.js',
  'out/tunnelManager.js.map',
  'out/types.js',
  'out/types.js.map',
  'out/userPresence.js',
  'out/userPresence.js.map',
  'package.json',
];

let copied = 0;
for (const rel of items) {
  const from = path.join(SRC, rel);
  if (!fs.existsSync(from)) {
    console.log('  skip (missing):', rel);
    continue;
  }
  const to = path.join(DST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}
console.log('deployed ' + copied + ' files to ' + DST);
