#!/usr/bin/env node
/**
 * Bundle the standalone scanner into a single, self-contained JS file
 * with the OWASP pack inlined.
 *
 * Output:
 *   dist/project-eric-scanner.js     (full bundle, sourcemap)
 *   dist/project-eric-scanner.min.js (minified, for code-server)
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const packPath = path.join(root, 'data', 'owasp-pack.json');
const packJson = fs.readFileSync(packPath, 'utf8');
// Wrap as a JSON string so it inlines cleanly inside the JS source.
const packLiteral = JSON.stringify(packJson);

// The per-language packs under `data/languages/` carry the full rule set
// for each language (74 rules across 13 languages). `data/owasp-pack.json`
// only holds 1-3 stub rules per language, because the extension loads the
// real packs from disk at activation time.
//
// The standalone bundle cannot read from disk in the browser, so it would
// otherwise ship with only the stubs — which is why `ProjectEric.scan()`
// inside code-server's webview used to miss most findings. Inlining the
// per-language packs here keeps the standalone function on par with the
// extension.
const langDir = path.join(root, 'data', 'languages');
const langPacks = {};
if (fs.existsSync(langDir)) {
  for (const file of fs.readdirSync(langDir).filter((f) => f.endsWith('.lang.json'))) {
    const id = path.basename(file, '.lang.json');
    langPacks[id] = JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8'));
  }
}

// Fold the full packs into the master pack: replace the stub entry for each
// language with its real pack, leaving any language that ships its rules
// inline (the `mcp` pack) untouched.
const mergedPack = JSON.parse(packJson);
for (const lang of mergedPack.languages) {
  const full = langPacks[lang.id];
  if (full && Array.isArray(full.rules) && full.rules.length) {
    lang.rules = full.rules;
    if (Array.isArray(full.extensions) && full.extensions.length) {
      lang.extensions = full.extensions;
    }
  }
}
const mergedPackLiteral = JSON.stringify(JSON.stringify(mergedPack));

const baseConfig = {
  entryPoints: [path.join(root, 'src', 'standalone', 'projectEricStandalone.ts')],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  globalName: 'ProjectEricStandalone',
  // `declare const __OWASP_PACK_JSON__: string;` in the entry point
  // gets replaced here with the literal string at compile time.
  define: {
    __OWASP_PACK_JSON__: mergedPackLiteral,
  },
  logLevel: 'info',
};

// Full bundle — easy to read while developing.
esbuild.buildSync({
  ...baseConfig,
  outfile: path.join(distDir, 'project-eric-scanner.js'),
  sourcemap: true,
  minify: false,
});

// Minified bundle — used by code-server / the user-script.
esbuild.buildSync({
  ...baseConfig,
  outfile: path.join(distDir, 'project-eric-scanner.min.js'),
  sourcemap: false,
  minify: true,
});

// Also expose a CommonJS bundle for Node consumers.
esbuild.buildSync({
  ...baseConfig,
  format: 'cjs',
  outfile: path.join(distDir, 'project-eric-scanner.cjs.js'),
  sourcemap: false,
  minify: false,
});

console.log('[standalone] bundled', path.join(distDir, 'project-eric-scanner.js'));
console.log('[standalone] minified', path.join(distDir, 'project-eric-scanner.min.js'));
console.log('[standalone] cjs     ', path.join(distDir, 'project-eric-scanner.cjs.js'));
