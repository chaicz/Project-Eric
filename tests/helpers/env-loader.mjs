// ---------------------------------------------------------------------------
// Node loader hooks that make the browser bundle importable under Node.
//
// Two things stand between `src/` and a plain Node test run:
//
//  1. `import.meta.env` — Vite replaces it at build time. Three modules
//     read their configuration from it (`src/services/api.js`,
//     `src/services/codeServer.js`, `src/services/billdDeskService.js`).
//     The `load` hook rewrites the expression to a global that the test
//     setup populates.
//
//  2. Extensionless relative imports — the source is written for Vite,
//     which resolves `./scannerLanguages` to `./scannerLanguages.js`.
//     Node's ESM resolver requires the extension, so the `resolve` hook
//     adds it.
//
// The hooks are registered in-thread with `module.registerHooks`, so they
// apply to the whole test process without a separate loader thread.
// ---------------------------------------------------------------------------

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENV_PATTERN = /import\.meta\.env\b/g;

/** The global the rewritten `import.meta.env` reads from. */
export const VITE_ENV_GLOBAL = '__VITE_ENV__';

/**
 * Register the hooks. Call this once, before the modules under test are
 * imported.
 */
export function registerTestHooks() {
  registerHooks({
    /**
     * Add the `.js` extension to relative imports that omit it.
     *
     * @param {string} specifier
     * @param {object} context
     * @param {object} nextResolve
     */
    resolve(specifier, context, nextResolve) {
      // Only relative, extensionless specifiers need help. Anything with
      // a protocol, a bare package name or an explicit extension is
      // left to Node.
      const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
      if (!isRelative || hasExtension) {
        return nextResolve(specifier, context);
      }

      try {
        const parentURL = context.parentURL;
        if (!parentURL || !parentURL.startsWith('file:')) {
          return nextResolve(specifier, context);
        }
        const resolved = new URL(specifier, parentURL);
        const asPath = fileURLToPath(resolved);
        if (existsSync(asPath)) return nextResolve(specifier, context);
        if (existsSync(`${asPath}.js`)) {
          return nextResolve(pathToFileURL(`${asPath}.js`).href, context);
        }
        if (existsSync(`${asPath}/index.js`)) {
          return nextResolve(pathToFileURL(`${asPath}/index.js`).href, context);
        }
      } catch {
        /* fall through to the default resolver */
      }
      return nextResolve(specifier, context);
    },

    /**
     * Rewrite `import.meta.env` to the test global.
     *
     * @param {string} url
     * @param {object} context
     * @param {object} nextLoad
     */
    load(url, context, nextLoad) {
      if (!url.startsWith('file:')) return nextLoad(url, context);

      const result = nextLoad(url, context);
      if (result.format !== 'module') return result;

      // Node hands the source back as a string for most files, but the
      // spec allows a byte sequence as well. Both are handled so the
      // rewrite never silently skips a file.
      const isBuffer = typeof result.source !== 'string';
      const source = isBuffer
        ? Buffer.from(result.source).toString('utf8')
        : result.source;

      if (!ENV_PATTERN.test(source)) return result;
      ENV_PATTERN.lastIndex = 0;

      const rewritten = source.replace(
        ENV_PATTERN,
        `globalThis.${VITE_ENV_GLOBAL}`,
      );

      return {
        ...result,
        source: isBuffer ? Buffer.from(rewritten, 'utf8') : rewritten,
      };
    },
  });
}

export default registerTestHooks;
