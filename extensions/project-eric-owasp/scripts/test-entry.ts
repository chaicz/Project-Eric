/**
 * Tiny entry used by the smoke test — re-exports the scanner pieces
 * without depending on the `vscode` module.
 */

export { scanCode } from '../src/scanner/scanner';
export { parsePack, ingestPack } from '../src/scanner/packLoader';