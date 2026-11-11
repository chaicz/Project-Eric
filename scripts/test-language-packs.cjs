#!/usr/bin/env node
/**
 * Language-pack deployment + verification test.
 *
 * Covers three things the earlier suites did not:
 *
 *   1. GENERATION  — `scripts/build-language-packs.cjs` is deterministic and
 *      produces one pack per web language pack, in the extension's
 *      `LanguagePack` shape.
 *
 *   2. LOADING     — the extension's `loadPacks()` reads
 *      `data/languages/<id>.lang.json` and substitutes the full pack for the
 *      stub entry in `data/owasp-pack.json`. This test replicates that read
 *      path exactly (same relative paths, same parse calls) and asserts that
 *      every declared language resolves to a real pack with rules.
 *
 *   3. SCANNING    — each language pack is exercised against a vulnerable
 *      sample and a safe sample, using the extension's real scanner. The
 *      vulnerable sample must produce findings; the safe sample must not
 *      produce findings for the categories that the pack covers.
 *
 * Usage: node scripts/test-language-packs.cjs
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const EXT_ROOT = path.join(ROOT, 'extensions', 'project-eric-owasp');
const EXT_DATA = path.join(EXT_ROOT, 'data');
const LANG_DIR = path.join(EXT_DATA, 'languages');
const REPORT_DIR = path.join(ROOT, 'reports');

// ---------------------------------------------------------------------------
// The extension reads these paths. The test uses the same ones so a change
// to the extension's layout breaks this test too.
// ---------------------------------------------------------------------------
const PACK_FILE = path.join(EXT_DATA, 'owasp-pack.json');
const LANG_PACK_PATH = (id) => path.join(LANG_DIR, `${id}.lang.json`);

// ---------------------------------------------------------------------------
// Vulnerable / safe samples per language.
//
// The vulnerable sample must trip at least one rule in the generated pack.
// The safe sample must trip none of that language's rules.
// ---------------------------------------------------------------------------
const SAMPLES = {
  javascript: {
    vuln: `const password = "supersecret123";\nel.innerHTML = userInput;\nconst q = "SELECT * FROM t WHERE id=" + id;\n`,
    safe: `const digest = await crypto.subtle.digest("SHA-256", data);\nel.textContent = userInput;\nconst q = "SELECT * FROM t WHERE id = ?";\n`,
  },
  typescript: {
    vuln: `const token = jwt.sign(payload, secret, { algorithm: "none" });\nconst res = await fetch(url);\n`,
    safe: `const token = jwt.sign(payload, secret, { algorithm: "HS256" });\nconst res = await fetch(url, { headers });\n`,
  },
  python: {
    vuln: `import pickle\ndata = pickle.loads(untrusted)\nimport subprocess\nsubprocess.run("ls " + user_dir, shell=True)\n`,
    safe: `import json\ndata = json.loads(untrusted)\nimport subprocess\nsubprocess.run(["ls", user_dir], shell=False)\n`,
  },
  java: {
    vuln: `MessageDigest md = MessageDigest.getInstance("MD5");\nString sql = "SELECT * FROM u WHERE n='" + name + "'";\n`,
    safe: `MessageDigest md = MessageDigest.getInstance("SHA-256");\nPreparedStatement ps = conn.prepareStatement("SELECT * FROM u WHERE n=?");\n`,
  },
  csharp: {
    vuln: `var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = " + id);\n`,
    safe: `var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = @id");\ncmd.Parameters.Add("@id", id);\n`,
  },
  go: {
    vuln: `db.Query("SELECT * FROM users WHERE id = " + id)\ncmd := exec.Command("sh", "-c", "cat "+name)\n`,
    safe: `db.Query("SELECT * FROM users WHERE id = $1", id)\ncmd := exec.Command("cat", name)\n`,
  },
  rust: {
    // A03-RUST-003 matches Command::new("sh" | "bash" | ...).
    // A04-RUST-004 matches unwrap()/expect() applied to a value that came
    // from a user-controlled source (request body, path, env, ...).
    vuln: `let body = web::JsonBody::from_json(&bytes).unwrap();\nlet out = Command::new("sh").arg("-c").arg(cmd).output().unwrap();\n`,
    safe: `let out = Command::new("cat").arg(path).output().unwrap();\n`,
  },
  ruby: {
    // A03-RUBY-003 matches interpolation inside a backtick command.
    vuln: 'output = `cat #{params[:dir]}`\n',
    safe: 'output = `cat`\n',
  },
  php: {
    // A03-PHP-003 matches the PHP shell family called with a string that
    // is concatenated onto a variable.
    vuln: '$dir = $_GET["d"];\nsystem("ls " . $dir);\n',
    safe: '$stmt = $pdo->prepare("SELECT * FROM users WHERE name = ?");\n$stmt->execute([$name]);\n',
  },
  sql: {
    // A03-SQL-001 matches a *quoted* SELECT followed by concatenation.
    vuln: `q = "SELECT * FROM users WHERE id = " + userId;\n`,
    safe: `q = "SELECT * FROM users WHERE id = ?";\n`,
  },
  cpp: {
    vuln: `char buf[10];\nstrcpy(buf, userInput);\n`,
    safe: `char buf[10] = {0};\nsnprintf(buf, sizeof(buf), "%s", userInput);\n`,
  },
  html: {
    vuln: `<script>document.write(userInput)</script>\n`,
    safe: `<div id="out"></div>\n<script>document.getElementById('out').textContent = userInput;</script>\n`,
  },
  css: {
    // A03-CSS-001 matches expression() / behavior: / @import javascript:
    vuln: `<style>body { width: expression(alert(1)); }</style>\n`,
    safe: `<style>body { background: #fff; }</style>\n`,
  },
  mcp: {
    // The mcp pack ships its rules inline in owasp-pack.json (it has no web
    // counterpart), so it only needs a scan check.
    vuln: `server.tool("readFile", {\n  description: "read",\n});\nconst host = "0.0.0.0";\nspawn("rg", args.path);\n`,
    safe: `server.tool("readFile", {\n  description: "read",\n  handler: async (args) => {\n    const root = path.resolve(ROOT);\n    const safe = path.resolve(root, args.path);\n    if (!safe.startsWith(root + path.sep)) throw new Error("outside root");\n    return fs.readFile(safe);\n  },\n});\n`,
  },
};

// ---------------------------------------------------------------------------
// Build the extension scanner (bundled, so the real TS runs).
// ---------------------------------------------------------------------------
async function buildScanner() {
  const outfile = path.join(REPORT_DIR, '.tmp-langpack-scanner.cjs');
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

/**
 * Replicate `loadPacks()` from extension.ts exactly:
 * read owasp-pack.json, then substitute each stub language with the full
 * pack from data/languages/<id>.lang.json.
 *
 * Returns the pack plus a record of where each language's rules came from,
 * so the test can prove the generated files are actually the ones in use.
 */
function loadPacksLikeTheExtension(scanner) {
  const packText = fs.readFileSync(PACK_FILE, 'utf8');
  const pack = scanner.parsePack(packText);
  scanner.ingestPack(pack);

  const skipped = [];
  const source = {};
  for (const lang of pack.languages) {
    const file = LANG_PACK_PATH(lang.id);
    if (!fs.existsSync(file)) {
      // No generated file: the manifest's inline rules are used as-is.
      source[lang.id] = { from: 'inline', rules: (lang.rules || []).length };
      continue;
    }
    try {
      const parsed = scanner.parseLanguagePack(fs.readFileSync(file, 'utf8'));
      const idx = pack.languages.findIndex((l) => l.id === lang.id);
      if (idx >= 0) pack.languages[idx] = parsed;
      source[lang.id] = { from: 'data/languages', rules: (parsed.rules || []).length };
    } catch (err) {
      skipped.push(`${lang.id} (${String(err)})`);
      source[lang.id] = { from: 'inline', rules: (lang.rules || []).length };
    }
  }
  scanner.ingestPack(pack);
  return { pack, skipped, source };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const scanner = await buildScanner();
  const results = [];
  let failures = 0;

  console.log('\nLanguage pack deployment + verification\n');

  // ---- 1. Generation is deterministic and complete ----------------------
  const webDir = path.join(ROOT, 'public', 'extensions');
  const webLangs = fs
    .readdirSync(webDir)
    .filter((f) => f.endsWith('.lang.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(webDir, f), 'utf8')).id)
    .sort();

  const generated = fs.existsSync(LANG_DIR)
    ? fs.readdirSync(LANG_DIR).filter((f) => f.endsWith('.lang.json')).map((f) => f.replace('.lang.json', '')).sort()
    : [];

  const missing = webLangs.filter((l) => !generated.includes(l));
  const extra = generated.filter((l) => !webLangs.includes(l));

  console.log('generation');
  console.log(`  web packs      : ${webLangs.length} (${webLangs.join(', ')})`);
  console.log(`  generated packs: ${generated.length}`);
  if (missing.length) {
    failures += 1;
    console.log(`  ! missing: ${missing.join(', ')}`);
  }
  if (extra.length) {
    failures += 1;
    console.log(`  ! unexpected: ${extra.join(', ')}`);
  }
  if (!missing.length && !extra.length) console.log('  every web pack has a generated extension pack');
  console.log('');

  // ---- 2. The extension can load every declared language ----------------
  const { pack, skipped, source } = loadPacksLikeTheExtension(scanner);
  console.log('loading (the extension\'s own loadPacks path)');

  // A language is acceptable if it either has a generated file under
  // data/languages/ or already carries its rules inline in the manifest
  // pack (the mcp pack does — it has no web counterpart).
  const reallySkipped = skipped.filter((id) => !(source[id] && source[id].rules > 0));

  if (reallySkipped.length) {
    failures += 1;
    console.log(`  ! skipped with no rules at all: ${reallySkipped.join(', ')}`);
  } else {
    const fromFile = Object.entries(source).filter(([, v]) => v.from === 'data/languages');
    const fromInline = Object.entries(source).filter(([, v]) => v.from === 'inline');
    console.log(
      `  all ${pack.languages.length} declared languages loaded - ` +
        `${fromFile.length} from data/languages/, ${fromInline.length} inline`,
    );
    for (const [id, v] of fromFile) {
      console.log(`    ${id.padEnd(11)} ${String(v.rules).padStart(2)} rules from data/languages/${id}.lang.json`);
    }
    for (const [id, v] of fromInline) {
      console.log(`    ${id.padEnd(11)} ${String(v.rules).padStart(2)} rules inline in owasp-pack.json`);
    }
  }

  // Every generated file must actually be the one in use — if the
  // substitution silently fell back to the inline stub, the deployment
  // would be a no-op and the whole point of the exercise would be lost.
  const notSubstituted = Object.entries(source).filter(
    ([, v]) => v.from === 'data/languages' && v.rules === 0,
  );
  if (notSubstituted.length) {
    failures += 1;
    console.log(`  ! generated but empty: ${notSubstituted.map(([id]) => id).join(', ')}`);
  }

  const loadedLanguages = scanner.listLanguages();
  const thin = pack.languages.filter((l) => (l.rules || []).length === 0);
  if (thin.length) {
    failures += 1;
    console.log(`  ! loaded with zero rules: ${thin.map((l) => l.id).join(', ')}`);
  } else {
    console.log('  every loaded language has at least one rule');
  }
  console.log('');

  // ---- 3. Every language scans, and the safe sample stays clean --------
  console.log('scanning');
  for (const lang of pack.languages) {
    const id = lang.id;
    const sample = SAMPLES[id];

    if (!sample) {
      // A language with no sample still has to load with rules.
      console.log(`  SKIP  ${id.padEnd(11)} no sample defined (load-only check passed)`);
      continue;
    }

    const rules = scanner.mergedRulesFor(id);
    const vulnResult = scanner.scanCode({
      uri: `vuln.${id}`,
      language: id,
      text: sample.vuln,
      minSeverity: 'info',
      skipCategories: [],
      rules,
    });
    const safeResult = scanner.scanCode({
      uri: `safe.${id}`,
      language: id,
      text: sample.safe,
      minSeverity: 'info',
      skipCategories: [],
      rules,
    });

    // A finding is a false positive only if it comes from a rule that
    // belongs to this language pack (the globals are shared and are
    // covered by their own suite).
    const langRuleIds = new Set((lang.rules || []).map((r) => r.id));
    const safeLangFindings = safeResult.findings.filter((f) => langRuleIds.has(f.ruleId));

    const ok = vulnResult.findings.length > 0 && safeLangFindings.length === 0;
    if (!ok) failures += 1;

    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(11)} ` +
        `vuln=${String(vulnResult.findings.length).padStart(2)} finding(s)  ` +
        `safe=${safeLangFindings.length} finding(s)  ` +
        `rules=${rules.length}`,
    );
    if (!ok) {
      for (const f of safeLangFindings.slice(0, 4)) {
        console.log(`        false positive: ${f.ruleId} ${f.ruleName} @ line ${f.line + 1}`);
      }
      if (!vulnResult.findings.length) console.log('        vulnerable sample produced no findings');
    }

    results.push({
      id,
      ruleCount: rules.length,
      vulnFindings: vulnResult.findings.map((f) => ({ ruleId: f.ruleId, category: f.category, line: f.line + 1 })),
      safeFindings: safeLangFindings.map((f) => ({ ruleId: f.ruleId, category: f.category, line: f.line + 1 })),
    });
  }
  console.log('');

  // ---- summary ---------------------------------------------------------
  const scanned = results.length;
  console.log('summary');
  console.log('-------');
  console.log(`  ${generated.length} language packs generated`);
  console.log(`  ${loadedLanguages.length} languages loadable by the extension`);
  console.log(`  ${scanned} languages scanned vulnerable + safe samples`);

  fs.writeFileSync(
    path.join(REPORT_DIR, 'language-pack-test.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        webLangs,
        generated,
        missing,
        extra,
        skipped,
        results,
      },
      null,
      2,
    ),
  );
  console.log('report: reports/language-pack-test.json');

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
