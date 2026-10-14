/**
 * Tiny browser-safe path helpers.
 *
 * The scanner used to depend on Node's `path` module, which breaks the
 * browser bundle that vscode.dev and GitHub Codespaces load. These helpers
 * cover only the few operations we actually need (joining an extension
 * root with a few segments and grabbing the trailing filename). Anything
 * more complex should stay inside the desktop build.
 */

/**
 * Join path segments using a forward slash. On Windows the host runtime
 * already passes `context.extensionPath` with backslashes, but mixing
 * `/` works for both `vscode.Uri.file()` and the desktop `node:fs`.
 */
export const joinPosix = (...parts: string[]): string =>
  parts
    .filter((p) => p !== '' && p !== undefined && p !== null)
    .join('/')
    .replace(/\/{2,}/g, '/');

/** Return the last segment of a forward-slash or back-slash path. */
export const basenamePosix = (p: string): string => {
  if (!p) return '';
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
};