// Drives the OWASP engine exactly as code-server loads it:
// require the installed extension's compiled scanner + pack from
// code-server's extension directory, then scan the IDE workspace files.
const path = require('path');
const fs = require('fs');

const EXT = path.join(
  process.env.LOCALAPPDATA,
  'code-server',
  'Data',
  'extensions',
  'project-eric.project-eric-owasp-0.1.0',
);

const packLoader = require(path.join(EXT, 'out', 'scanner', 'packLoader.js'));
const scanner = require(path.join(EXT, 'out', 'scanner', 'scanner.js'));

const raw = fs.readFileSync(path.join(EXT, 'data', 'owasp-pack.json'), 'utf8');
const pack = packLoader.parsePack(raw);
packLoader.ingestPack(pack);

console.log('pack loaded: globalRules=' + pack.globalRules.length +
  ' languages=' + pack.languages.map((l) => l.id).join(','));

const workspace = 'C:\\Users\\Public\\project-eric-ide';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}

const files = walk(workspace);
const inputs = [];
for (const file of files) {
  const lang = packLoader.languageIdForFile(file, pack);
  if (!lang) continue;
  inputs.push({ uri: file, language: lang, text: fs.readFileSync(file, 'utf8') });
}

console.log('\nfiles discovered by extension logic: ' + inputs.length + '/' + files.length);
for (const i of inputs) {
  console.log('  [' + i.language + '] ' + path.relative(workspace, i.uri));
}

(async () => {
  const results = await scanner.scanFiles(inputs, { minSeverity: 'low', skipCategories: [] });
  const findings = scanner.flattenFindings(results);
  console.log('\n=== SCAN RESULTS ===');
  console.log('files scanned : ' + results.length);
  console.log('findings      : ' + findings.length);

  const bySev = {};
  const byCat = {};
  for (const f of findings) {
    bySev[f.severity] = (bySev[f.severity] || 0) + 1;
    byCat[f.category] = (byCat[f.category] || 0) + 1;
  }
  console.log('by severity   : ' + JSON.stringify(bySev));
  console.log('by category   : ' + JSON.stringify(byCat));

  console.log('\n--- findings (file:line category severity rule) ---');
  for (const f of findings) {
    const rel = path.relative(workspace, f.uri);
    const line = f.line ?? '?';
    console.log(
      '  ' + rel + ':' + line + '  ' + f.category + '  ' + f.severity + '  ' + f.ruleId +
      '  ' + String(f.message).slice(0, 80),
    );
  }

  // Score via the extension's own scoring module
  try {
    const score = require(path.join(EXT, 'out', 'scoring', 'scoreCalculator.js'));
    const fn = score.scoreWorkspace || score.scoreFiles || score.score;
    if (typeof fn === 'function') {
      const s = fn(results);
      console.log('\nscore: ' + JSON.stringify(s));
    }
  } catch (e) {
    console.log('\n(score module not loadable: ' + e.message + ')');
  }
})();
