#!/usr/bin/env node
/**
 * Bundle the TypeScript out/ directory into a single extension.web.js
 * for vscode.dev. Run after `tsc`.
 *
 * Uses esbuild to bundle every source file in src/ into one file.
 */

const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');

esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'extension.ts')],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'cjs',
  outfile: path.join(root, 'out', 'extension.web.js'),
  external: ['vscode'],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
});