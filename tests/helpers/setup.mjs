// ---------------------------------------------------------------------------
// Test entry point.
//
// Loaded with `node --import ./tests/helpers/setup.mjs --test ...`.
// It registers the loader hooks and installs the browser globals before
// any test file is evaluated.
// ---------------------------------------------------------------------------

import { registerTestHooks } from './env-loader.mjs';
import { installBrowserGlobals } from './browser-globals.mjs';

registerTestHooks();

// The Vite environment the modules read through `import.meta.env`.
globalThis.__VITE_ENV__ = {
  VITE_API_URL: 'http://localhost/project-eric-api/api',
  VITE_CODE_SERVER_URL: 'http://127.0.0.1:8080',
  VITE_BILLD_BASE: '/billd',
};

installBrowserGlobals();
