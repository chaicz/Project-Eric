#!/usr/bin/env node
/**
 * Verifies the *installed* code-server extension — not the repo copy.
 *
 * The repo can be correct while the deployed extension is stale, and the
 * scanner only ever reads the deployed copy. This script checks the
 * installed folder directly:
 *
 *   1. every language pack the manifest declares is present on disk
 *   2. every pack parses and has rules
 *   3. the deployed packs actually scan (vulnerable sample -> findings)
 *
 * Usage: node scripts/test-installed-language-packs.cjs
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const EXT_ROOT = path.join(ROOT, 'extensions', 'project-eric-owasp');
const REPORT_DIR = path.join(ROOT, 'reports');

const INSTALLED = path.join(
  process.env.LOCALAPPDATA,
  'code-server',
  'Data',
  'extensions',
  'project-eric.project-eric-owasp-0.1.0',
);

// A small vulnerable sample per language, chosen to trip at least one
// rule from the generated pack.
const SAMPLES = {
  javascript: 'el.innerHTML = userInput;\nconst q = "SELECT * FROM t WHERE id=" + id;\n',
  typescript: 'const token = jwt.sign(payload, secret, { algorithm: "none" });\n',
  python: 'import pickle\ndata = pickle.loads(untrusted)\n',
  sql: 'q = "SELECT * FROM users WHERE id = " + userId;\n',
  java: 'MessageDigest md = MessageDigest.getInstance("MD5");\n',
  php: '$dir = $_GET["d"];\nsystem("ls " . $dir);\n',
  go: 'db.Query("SELECT * FROM users WHERE id = " + id)\n',
  rust: 'let out = Command::new("sh").arg("-c").arg(cmd).output().unwrap();\n',
  ruby: 'output = `cat #{params[:dir]}`\n',
  cpp: 'char buf[10];\nstrcpy(buf, userInput);\n',
  csharp: 'var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = " + id);\n',
  html: '<script>document.write(userInput)</script>\n',
  css: '<style>body { width: expression(alert(1)); }</style>\n',
  mcp: 'server.tool("readFile", {\n  description: "read",\n});\nconst host = "0.0.0.0";\n',
};

async function buildScanner() {
  const outfile = path.join(REPORT_DIR, '.tmp-installed-scanner.cjs');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  await esbuild.build({
    stdin: {
      contents: "export * from './scanner'; export * from './packLoader';",
      resolveDir: path.join(EXT_ROOT, 'src', 'scanner'),
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  return require(outfile);
}

(async () => {
  console.log('\nInstalled code-server extension — language pack verification\n');
  console.log(`  installed at: ${INSTALLED}\n`);

  let failures = 0;

  if (!fs.existsSync(INSTALLED)) {
    console.log('  ! extension is not installed — run scripts/deploy-owasp-extension.cjs');
    process.exitCode = 1;
    return;
  }

  const scanner = await buildScanner();

  // ---- 1. Files present ------------------------------------------------
  const packFile = path.join(INSTALLED, 'data', 'owasp-pack.json');
  if (!fs.existsSync(packFile)) {
    console.log('  ! data/owasp-pack.json is missing');
    process.exitCode = 1;
    return;
  }
  const pack = scanner.parsePack(fs.readFileSync(packFile, 'utf8'));
  scanner.ingestPack(pack);

  console.log('files');
  let present = 0;
  let absent = 0;
  let inline = 0;
  for (const lang of pack.languages) {
    const file = path.join(INSTALLED, 'data', 'languages', `${lang.id}.lang.json`);
    if (fs.existsSync(file)) {
      present += 1;
    } else if ((lang.rules || []).length > 0) {
      // The pack ships its rules inline in owasp-pack.json (the mcp pack
      // does — it has no web counterpart), so no separate file is needed.
      inline += 1;
    } else {
      absent += 1;
      console.log(`  ! missing on disk: data/languages/${lang.id}.lang.json`);
    }
  }
  console.log(`  ${present} language pack file(s) installed, ${inline} inline in owasp-pack.json, ${absent} missing`);
  if (absent) failures += 1;
  console.log('');

  // ---- 2. Substitute + scan, exactly as the extension does --------------
  console.log('scanning with the installed packs');
  for (const lang of pack.languages) {
    const id = lang.id;
    const file = path.join(INSTALLED, 'data', 'languages', `${id}.lang.json`);
    let effective = lang;
    if (fs.existsSync(file)) {
      const parsed = scanner.parseLanguagePack(fs.readFileSync(file, 'utf8'));
      const idx = pack.languages.findIndex((l) => l.id === id);
      if (idx >= 0) pack.languages[idx] = parsed;
      effective = parsed;
    }
    scanner.ingestPack(pack);

    const rules = scanner.mergedRulesFor(id);
    const sample = SAMPLES[id];
    const result = scanner.scanCode({
      uri: `installed.${id}`,
      language: id,
      text: sample,
      minSeverity: 'info',
      skipCategories: [],
      rules,
    });

    const ok = rules.length > 0 && result.findings.length > 0;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(11)} ` +
        `${String(effective.rules ? effective.rules.length : 0).padStart(2)} pack rules  ` +
        `${String(rules.length).padStart(2)} effective  ` +
        `${String(result.findings.length).padStart(2)} finding(s)`,
    );
    if (!ok) {
      if (!rules.length) console.log('        no rules loaded for this language');
      else console.log('        the installed pack produced no findings for the vulnerable sample');
    }
  }
  console.log('');

  console.log(failures === 0 ? 'installed extension verified' : `${failures} check(s) failed`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
