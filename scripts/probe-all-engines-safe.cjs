/**
 * Print every finding the three engines produce for the "safe" fixtures.
 *
 * A safe fixture that trips a rule is not automatically a broken fixture:
 * a regex scanner cannot tell that a route's `{id}` is authorised by a
 * check three lines below it. This lists the exact rules so the
 * expected behaviour can be documented, and so a *new* finding on a
 * safe fixture is noticed rather than absorbed.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'owasp-fixtures');
const PUBLIC_EXT = path.join(ROOT, 'public', 'extensions');
const EXT_DATA = path.join(ROOT, 'extensions', 'project-eric-owasp', 'data');

const CASES = [
  ['jwt-none', 'typescript', 'ts'],
  ['unwrap-panic', 'rust', 'rs'],
  ['pickle-loads', 'python', 'py'],
  ['md5-digest', 'java', 'java'],
  ['command-injection', 'go', 'go'],
  ['shell-interpolation', 'ruby', 'rb'],
  ['idor-laravel', 'php', 'php'],
  ['dom-xss', 'javascript', 'js'],
  ['sql-injection', 'csharp', 'cs'],
];

(async () => {
  // --- extension engine, loading language packs like the extension does ---
  const extOut = path.join(ROOT, 'reports', '.tmp-probe-ext.cjs');
  await esbuild.build({
    stdin: {
      contents: "export * from './scanner'; export * from './packLoader';",
      resolveDir: path.join(ROOT, 'extensions', 'project-eric-owasp', 'src', 'scanner'),
      loader: 'ts',
    },
    bundle: true, format: 'cjs', platform: 'node', outfile: extOut, logLevel: 'silent',
  });
  const ext = require(extOut);
  const pack = ext.parsePack(fs.readFileSync(path.join(EXT_DATA, 'owasp-pack.json'), 'utf8'));
  for (const lang of pack.languages) {
    const file = path.join(EXT_DATA, 'languages', `${lang.id}.lang.json`);
    if (!fs.existsSync(file)) continue;
    const idx = pack.languages.findIndex((l) => l.id === lang.id);
    if (idx >= 0) pack.languages[idx] = ext.parseLanguagePack(fs.readFileSync(file, 'utf8'));
  }
  ext.ingestPack(pack);

  // --- web pack engine ---
  const webOut = path.join(ROOT, 'reports', '.tmp-probe-web.cjs');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'utils', 'owaspPackLoader.js')],
    bundle: true, format: 'cjs', platform: 'node', outfile: webOut, logLevel: 'silent',
  });
  const web = require(webOut);
  global.fetch = async (url) => {
    const rel = String(url).replace(/^\/extensions\//, '');
    const file = path.join(PUBLIC_EXT, rel);
    if (!fs.existsSync(file)) return { ok: false, json: async () => null };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  // --- built-in detector engine ---
  const biOut = path.join(ROOT, 'reports', '.tmp-probe-bi.cjs');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'utils', 'owaspDetectors.js')],
    bundle: true, format: 'cjs', platform: 'node', outfile: biOut, logLevel: 'silent',
  });
  const bi = require(biOut);

  for (const [id, lang, extName] of CASES) {
    const code = fs.readFileSync(path.join(FIXTURES, 'safe', `${id}.${extName}`), 'utf8');

    const extFindings = ext.scanCode({
      uri: `safe/${id}`, language: lang, text: code, minSeverity: 'low', skipCategories: [],
    }).findings.map((f) => `${f.category} ${f.ruleId}`);

    web._resetCache();
    const webFindings = (await web.analyse(code, lang))
      .filter((f) => f.count > 0)
      .map((f) => `${f.id} x${f.count}`);

    const biFindings = (await bi.runDetectors(code, 'code', lang))
      .filter((f) => f.count > 0)
      .map((f) => `${f.id} x${f.count}`);

    console.log(`\n--- safe/${id} (${lang}) ---`);
    console.log(`  extension : ${extFindings.length ? extFindings.join(', ') : '(clean)'}`);
    console.log(`  web-pack  : ${webFindings.length ? webFindings.join(', ') : '(clean)'}`);
    console.log(`  web-builtin: ${biFindings.length ? biFindings.join(', ') : '(clean)'}`);
  }
})();
