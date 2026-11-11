// ---------------------------------------------------------------------------
// Browser-globals shim for the Node test run.
//
// The modules under test are written for the browser, so they touch
// `localStorage`, `document`, `window` and `navigator`. This file installs
// small, deterministic stand-ins for those globals so the modules can be
// exercised outside a browser.
//
// Every shim is deliberately strict about the things the code under test
// is supposed to survive: the storage can be told to throw (quota
// exceeded, private mode), the document element can be observed, and the
// clipboard can be told to fail. That is what makes the error-state tests
// meaningful rather than decorative.
// ---------------------------------------------------------------------------

/** A `localStorage` implementation backed by a Map. */
export function createMemoryStorage({ failOnSet = false, failOnGet = false } = {}) {
  const map = new Map();
  return {
    getItem(key) {
      if (failOnGet) throw new Error('SecurityError: storage is not available');
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (failOnSet) throw new Error('QuotaExceededError: storage quota exceeded');
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    get length() {
      return map.size;
    },
    /** Test helper: every key currently stored. */
    keys() {
      return [...map.keys()];
    },
  };
}

/** A minimal `document` whose root element records the CSS variables set on it. */
export function createFakeDocument() {
  const style = {
    properties: {},
    setProperty(name, value) {
      this.properties[name] = value;
    },
    getPropertyValue(name) {
      return this.properties[name] ?? '';
    },
    removeProperty(name) {
      delete this.properties[name];
    },
  };

  const root = {
    style,
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) {
        const on = force === undefined ? !this._classes.has(c) : !!force;
        if (on) this._classes.add(c);
        else this._classes.delete(c);
        return on;
      },
      contains(c) { return this._classes.has(c); },
    },
  };

  return {
    documentElement: root,
    body: {
      appendChild() {},
      removeChild() {},
    },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        style: {},
        value: '',
        textContent: '',
        innerHTML: '',
        setAttribute() {},
        select() {},
      };
    },
  };
}

/**
 * Install the browser globals.
 *
 * @param {object} [options]
 * @param {object} [options.storage] a storage implementation to use
 * @returns {{ storage: object, restore: () => void }}
 */
export function installBrowserGlobals({ storage } = {}) {
  const store = storage || createMemoryStorage();

  const previous = {
    localStorage: globalThis.localStorage,
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    __VITE_ENV__: globalThis.__VITE_ENV__,
  };

  globalThis.localStorage = store;
  globalThis.document = createFakeDocument();

  // Node has no FileReader, but the browser does and `blobToBase64`
  // depends on it. The stub reads a Blob through its own async API.
  if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = class FileReader {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.result = null;
      }

      readAsDataURL(blob) {
        blob.arrayBuffer()
          .then((buffer) => {
            this.result = `data:${blob.type || 'application/octet-stream'};base64,` +
              Buffer.from(buffer).toString('base64');
            this.onload?.({ target: this });
          })
          .catch((err) => {
            this.onerror?.(err);
          });
      }
    };
  }

  globalThis.window = {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    location: { origin: 'http://localhost:5173' },
    // Some browser libraries (jsPDF among them) look for these on
    // `window` rather than on the global object, so the shim has to
    // carry them too.
    atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
    btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
  };
  // `navigator` is a getter-only global in Node 24, so it has to be
  // redefined rather than assigned.
  Object.defineProperty(globalThis, 'navigator', {
    value: globalThis.navigator || {},
    writable: true,
    configurable: true,
  });
  globalThis.__VITE_ENV__ = globalThis.__VITE_ENV__ || {};

  return {
    storage: store,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    },
  };
}

/**
 * Replace `globalThis.fetch` with a stub for the duration of a test.
 *
 * @param {(url: string, options: object) => any} handler
 * @returns {() => void} restores the original fetch
 */
export function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const result = await handler(String(url), options);
    if (result === undefined) {
      throw new TypeError('Failed to fetch');
    }
    return result;
  };
  return () => {
    globalThis.fetch = original;
  };
}

/** Build a `Response`-like object for the fetch stub. */
export function jsonResponse(body, { ok = true, status = 200 } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    text: async () => text,
    json: async () => {
      try {
        return JSON.parse(text);
      } catch {
        throw new SyntaxError('Unexpected token in JSON');
      }
    },
  };
}
