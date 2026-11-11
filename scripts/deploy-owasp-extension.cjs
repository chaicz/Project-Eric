// Copies the freshly-built extension artifacts from the repo into the
// code-server extension folder so the running workbench picks up changes.
const fs = require('fs');
const path = require('path');

const SRC = 'D:/webpage design/extensions/project-eric-owasp';
const DST = path.join(
  process.env.LOCALAPPDATA,
  'code-server',
  'Data',
  'extensions',
  'project-eric.project-eric-owasp-0.1.0'
);

const items = [
  'package.json',
  'out/extension.js',
  'out/extension.web.js',
  'out/providers/dashboardWebview.js',
  'out/providers/dashboardWebview.d.ts',
  'out/providers/standaloneScannerWebview.js',
  'out/providers/securityTreeProvider.js',
  'out/providers/statusBar.js',
  'out/scanner/scanner.js',
  'out/scanner/packLoader.js',
  'out/scoring/scoreCalculator.js',
  'out/standalone/projectEricStandalone.js',
  'out/diagnostics/diagnosticManager.js',
  'out/util/pathSafe.js',
  'out/types.js',
  'dist/project-eric-scanner.js',
  'dist/project-eric-scanner.min.js',
  'dist/project-eric-scanner.cjs.js',
  'data/owasp-pack.json',
  'data/owasp-severity.language-configuration.json',
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

// The per-language rule packs. `extension.ts` reads these from
// `data/languages/<id>.lang.json` and substitutes them for the stub
// entries in owasp-pack.json. Without this directory every language falls
// back to one or two rules and the scanner misses most findings.
const langSrc = path.join(SRC, 'data', 'languages');
if (fs.existsSync(langSrc)) {
  const langDst = path.join(DST, 'data', 'languages');
  fs.mkdirSync(langDst, { recursive: true });
  const packs = fs.readdirSync(langSrc).filter((f) => f.endsWith('.lang.json')).sort();
  for (const pack of packs) {
    fs.copyFileSync(path.join(langSrc, pack), path.join(langDst, pack));
    copied++;
  }
  console.log('deployed ' + packs.length + ' language packs');
} else {
  console.log('  ! no data/languages directory — run: node scripts/build-language-packs.cjs');
}

console.log('deployed ' + copied + ' files to ' + DST);
