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
    __OWASP_PACK_JSON__: packLiteral,
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
