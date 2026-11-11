// ---------------------------------------------------------------------------
// Shared code-runner service for the Code IDE and OWASP Analysis pages.
//
// Exports:
//   LANGUAGES              — registry of supported languages
//   TEMPLATES              — boilerplate snippets for the "New file" dialog
//   languageFromName       — map a filename extension to a language id
//   RUNNERS                — per-language execution pipelines
//   SANDBOX_BRIDGE_ONLY    — postMessage bridge used inside runner iframes
//   TEST_SAMPLES           — small curated snippets for the language test sweep
//   buildSampleForLanguage — pick a sensible sample for a language
//   runSingleLanguageTest  — run one language and report pass/warning/fail
//   runAllLanguageTests    — run every language and stream results back
//
// Each test result is shaped like an OWASP finding:
//   { langId, label, icon, ext, status, severity, message,
//     output, duration, canRun, description }
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------
//
// Every language in the IDE is described here. `canRun` is one of:
//   true     — executes in a sandboxed iframe
//   'partial'— runs a lightweight check (parse, syntax) in the browser
//   false    — preview only, browser can't execute it
//
// `runner` is the id of the function in `RUNNERS` below that knows how to
// turn the file's content into output (logs, an HTML preview, or both).
// ---------------------------------------------------------------------------

export const LANGUAGES = {
  html:        { label: 'HTML',           ext: 'html',     canRun: true,     icon: '🌐', runner: 'html',     description: 'Renders in a sandboxed iframe with live console capture.' },
  css:         { label: 'CSS',            ext: 'css',      canRun: true,     icon: '🎨', runner: 'css',      description: 'Stylesheet previewed against a sample HTML page.' },
  javascript:  { label: 'JavaScript',     ext: 'js',       canRun: true,     icon: '📜', runner: 'js',       description: 'Runs in a sandboxed iframe via `new Function`, console + errors streamed live.' },
  typescript:  { label: 'TypeScript',     ext: 'ts',       canRun: false,    icon: '🟦', runner: 'source',   description: 'TypeScript needs a transpiler. Preview only — no browser runtime.' },
  jsx:         { label: 'JSX (React)',    ext: 'jsx',      canRun: false,    icon: '⚛️', runner: 'source',   description: 'JSX needs a transpiler. Preview only.' },
  tsx:         { label: 'TSX (React)',    ext: 'tsx',      canRun: false,    icon: '⚛️', runner: 'source',   description: 'TSX needs a transpiler. Preview only.' },
  json:        { label: 'JSON',           ext: 'json',     canRun: true,     icon: '🧾', runner: 'json',     description: 'Validates the document and pretty-prints the tree.' },
  markdown:    { label: 'Markdown',       ext: 'md',       canRun: true,     icon: '📝', runner: 'markdown', description: 'Renders to a styled HTML preview (no external libraries).' },
  python:      { label: 'Python',         ext: 'py',       canRun: false,    icon: '🐍', runner: 'source',   description: 'Python needs a backend runtime. Preview only.' },
  java:        { label: 'Java',           ext: 'java',     canRun: false,    icon: '☕', runner: 'source',   description: 'Java needs a JDK. Preview only.' },
  cpp:         { label: 'C++',            ext: 'cpp',      canRun: false,    icon: '➕', runner: 'source',   description: 'C++ needs a compiler. Preview only.' },
  c:           { label: 'C',              ext: 'c',        canRun: false,    icon: '🇨',  runner: 'source',   description: 'C needs a compiler. Preview only.' },
  csharp:      { label: 'C#',             ext: 'cs',       canRun: false,    icon: '🎯', runner: 'source',   description: 'C# needs a compiler. Preview only.' },
  go:          { label: 'Go',             ext: 'go',       canRun: false,    icon: '🐹', runner: 'source',   description: 'Go needs a toolchain. Preview only.' },
  rust:        { label: 'Rust',           ext: 'rs',       canRun: false,    icon: '🦀', runner: 'source',   description: 'Rust needs a toolchain. Preview only.' },
  php:         { label: 'PHP',            ext: 'php',      canRun: false,    icon: '🐘', runner: 'source',   description: 'PHP needs a server runtime. Preview only.' },
  ruby:        { label: 'Ruby',           ext: 'rb',       canRun: false,    icon: '💎', runner: 'source',   description: 'Ruby needs a runtime. Preview only.' },
  sql:         { label: 'SQL',            ext: 'sql',      canRun: 'partial', icon: '🗃️', runner: 'sql',     description: 'Lightweight syntax check (matching parens, quotes, keywords).' },
  yaml:        { label: 'YAML',           ext: 'yml',      canRun: 'partial', icon: '🧷', runner: 'yaml',     description: 'Indentation-based syntax check.' },
  text:        { label: 'Plain text',     ext: 'txt',      canRun: false,    icon: '📄', runner: 'source',   description: 'No execution. Preview only.' },
};

export const languageFromName = (name = '') => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ({
    html: 'html', htm: 'html',
    css: 'css', scss: 'css',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'tsx', jsx: 'jsx',
    json: 'json', md: 'markdown', py: 'python', java: 'java',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'c',
    cs: 'csharp', go: 'go', rs: 'rust', php: 'php', rb: 'ruby',
    sql: 'sql', yml: 'yaml', yaml: 'yaml', txt: 'text',
  })[ext] || 'text';
};

// ---------------------------------------------------------------------------
// Boilerplate templates — surfaced in the "New file" dialog
// ---------------------------------------------------------------------------

export const TEMPLATES = {
  html: {
    'HTML5 boilerplate': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My page</title>
  <style>
    body { font: 16px/1.5 system-ui; margin: 0; padding: 32px; background: #f8fafc; color: #0f172a; }
    h1 { color: #1e40af; }
    button { padding: 8px 14px; border: none; background: #2563eb; color: white; border-radius: 8px; cursor: pointer; }
    button:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <h1>Hello, HTML 👋</h1>
  <p>Edit this file and click <b>Run</b>.</p>
  <button onclick="alert('It works!')">Click me</button>
</body>
</html>`,
  },
  css: {
    'Animated card': `@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

body {
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
  background: linear-gradient(135deg, #667eea, #764ba2);
  font-family: system-ui;
  color: white;
}

.card {
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(20px);
  padding: 32px 48px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.25);
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  animation: float 3s ease-in-out infinite;
}

h1 { margin: 0; font-size: 28px; }`,
  },
  javascript: {
    'Hello + DOM': `// Click "Run" to execute this script in a sandboxed iframe.
console.log('Hello from JavaScript!');

const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
console.log('Sum of', numbers, '=', sum);

const profile = { name: 'Demo', role: 'Coder', skills: ['JS', 'React'] };
console.log('Profile:', profile);

fetch('data:application/json,{"ping":"pong"}')
  .then((r) => r.json())
  .then((j) => console.log('Async fetch:', j))
  .catch((e) => console.error('Fetch error:', e.message));

console.log('✓ Script finished.');`,
    'DOM playground': `// Mounts a small UI in the preview iframe.
const style = document.createElement('style');
style.textContent = \`body{font:14px system-ui;background:#0f172a;color:#e2e8f0;padding:24px;}
button{padding:8px 14px;border:none;background:#22d3ee;color:#0f172a;border-radius:8px;cursor:pointer;margin-right:6px;}\`;
document.head.appendChild(style);

const root = document.createElement('div');
root.innerHTML = '<h2>Counter</h2><p id="out">0</p><button id="inc">+</button><button id="dec">−</button><button id="rst">reset</button>';
document.body.appendChild(root);

let n = 0;
const out = document.getElementById('out');
root.querySelector('#inc').onclick = () => { n++; out.textContent = n; console.log('now', n); };
root.querySelector('#dec').onclick = () => { n--; out.textContent = n; };
root.querySelector('#rst').onclick = () => { n = 0; out.textContent = n; };
console.log('UI mounted.');`,
  },
  typescript: {
    'Typed counter': `// TypeScript — preview only (no browser runtime for .ts)
interface Counter {
  value: number;
  step: number;
}

const counter: Counter = { value: 0, step: 1 };

function bump(c: Counter, delta: number): Counter {
  return { ...c, value: c.value + delta };
}

console.log('initial', counter);
console.log('bumped', bump(counter, 5));

export {}; // make this file a module
`,
  },
  jsx: {
    'React counter (JSX)': `// JSX — preview only (needs a React build step to run in a browser)
import React, { useState } from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return (
    <div>
      <h2>Count: {n}</h2>
      <button onClick={() => setN(n + 1)}>+1</button>
      <button onClick={() => setN(0)}>reset</button>
    </div>
  );
}
`,
  },
  tsx: {
    'React counter (TSX)': `// TSX — preview only (needs a React + TS build step)
import React, { useState } from 'react';

interface Props { step?: number; }

export default function Counter({ step = 1 }: Props) {
  const [n, setN] = useState<number>(0);
  return (
    <div>
      <h2>Count: {n}</h2>
      <button onClick={() => setN(n + step)}>+{step}</button>
    </div>
  );
}
`,
  },
  json: {
    'Empty object': '{}\n',
    'Sample config': `{
  "name": "my-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node index.js",
    "test": "echo 'no tests yet'"
  },
  "dependencies": {
    "react": "^18.2.0"
  }
}\n`,
  },
  markdown: {
    'README template': `# Project name

> One-line description of what this is.

## Quick start

\`\`\`bash
npm install
npm run dev
\`\`\`

## Features

- Feature one
- Feature two
- Feature three

## License

MIT
`,
  },
  python: {
    'Hello world': `#!/usr/bin/env python3
"""Demo script — runs in a real Python interpreter, not in the browser."""

import json
from datetime import datetime

def factorial(n: int) -> int:
    return 1 if n <= 1 else n * factorial(n - 1)

def main() -> None:
    print(f"[{datetime.utcnow().isoformat()}Z] starting")
    print("factorials:", [factorial(i) for i in range(1, 7)])
    print("config:", json.dumps({"name": "demo", "level": 3}, indent=2))

if __name__ == "__main__":
    main()
`,
  },
  java: {
    'Hello world': `// Java — needs a JDK to compile and run.
public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, Java!");
    for (int i = 1; i <= 5; i++) {
      System.out.println("i = " + i);
    }
  }
}
`,
  },
  cpp: {
    'Hello world': `// C++ — needs a compiler (g++, clang++) to build and run.
#include <iostream>
#include <vector>
#include <numeric>

int main() {
  std::cout << "Hello, C++!" << std::endl;
  std::vector<int> v(10);
  std::iota(v.begin(), v.end(), 1);
  int sum = std::accumulate(v.begin(), v.end(), 0);
  std::cout << "sum of 1..10 = " << sum << std::endl;
  return 0;
}
`,
  },
  c: {
    'Hello world': `// C — needs a compiler (gcc, clang) to build and run.
#include <stdio.h>

int main(void) {
  printf("Hello, C!\\n");
  for (int i = 1; i <= 5; ++i) {
    printf("i = %d\\n", i);
  }
  return 0;
}
`,
  },
  csharp: {
    'Hello world': `// C# — needs the .NET SDK to build and run.
using System;
using System.Linq;

class Program {
  static void Main() {
    Console.WriteLine("Hello, C#!");
    var sum = Enumerable.Range(1, 10).Sum();
    Console.WriteLine($"sum of 1..10 = {sum}");
  }
}
`,
  },
  go: {
    'Hello world': `// Go — needs the Go toolchain to build and run.
package main

import "fmt"

func main() {
  fmt.Println("Hello, Go!")
  sum := 0
  for i := 1; i <= 10; i++ {
    sum += i
  }
  fmt.Printf("sum of 1..10 = %d\\n", sum)
}
`,
  },
  rust: {
    'Hello world': `// Rust — needs the rustc toolchain to build and run.
fn main() {
    println!("Hello, Rust!");
    let sum: i32 = (1..=10).sum();
    println!("sum of 1..10 = {}", sum);
}
`,
  },
  php: {
    'Hello world': `<?php
// PHP — needs a PHP runtime (php-cli or a web server).
echo "Hello, PHP!\\n";
$sum = 0;
for ($i = 1; $i <= 10; $i++) { $sum += $i; }
echo "sum of 1..10 = $sum\\n";
`,
  },
  ruby: {
    'Hello world': `# Ruby — needs a Ruby runtime (ruby / JRuby).
puts "Hello, Ruby!"
sum = (1..10).reduce(0) { |a, b| a + b }
puts "sum of 1..10 = #{sum}"
`,
  },
  sql: {
    'Sample query': `-- SQL — syntax check only. Execution needs a database.
SELECT id, name, email
FROM users
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND status = 'active'
ORDER BY created_at DESC
LIMIT 50;
`,
  },
  yaml: {
    'Sample config': `# YAML — indentation-based syntax check.
name: my-app
version: 1.0.0
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
  api:
    image: my-api:1.2.3
    environment:
      LOG_LEVEL: info
      DATABASE_URL: postgres://db/app
`,
  },
  text: {
    'Blank note': '',
  },
};

// ---------------------------------------------------------------------------
// Console bridge — installed inside every sandboxed iframe so that
// console.log / .error / .warn / unhandled errors stream back to the
// parent page via postMessage.
// ---------------------------------------------------------------------------

export const SANDBOX_BRIDGE_ONLY = `<script>
(function () {
  function send(level, args) {
    try {
      var parts = [];
      for (var i = 0; i < args.length; i++) {
        var v = args[i];
        if (v === null) parts.push('null');
        else if (v === undefined) parts.push('undefined');
        else if (typeof v === 'object') { try { parts.push(JSON.stringify(v, null, 2)); } catch (e) { parts.push(String(v)); } }
        else parts.push(String(v));
      }
      parent.postMessage({ __sandboxLog: true, level: level, message: parts.join(' ') }, '*');
    } catch (e) {}
  }
  var oL = console.log, oE = console.error, oW = console.warn, oI = console.info;
  console.log   = function () { send('log',   arguments); try { oL.apply(console, arguments); } catch (e) {} };
  console.error = function () { send('error', arguments); try { oE.apply(console, arguments); } catch (e) {} };
  console.warn  = function () { send('warn',  arguments); try { oW.apply(console, arguments); } catch (e) {} };
  console.info  = function () { send('info',  arguments); try { oI.apply(console, arguments); } catch (e) {} };
  window.addEventListener('error', function (e) {
    parent.postMessage({ __sandboxLog: true, level: 'error', message: (e.error && e.error.stack) || e.message }, '*');
  });
  window.addEventListener('unhandledrejection', function (e) {
    parent.postMessage({ __sandboxLog: true, level: 'error', message: 'Unhandled promise rejection: ' + ((e.reason && e.reason.stack) || e.reason) }, '*');
  });
  parent.postMessage({ __sandboxReady: true }, '*');
})();
</script>`;

// ---------------------------------------------------------------------------
// Local asset inlining
// ---------------------------------------------------------------------------
//
// The preview runs inside an iframe whose document is set through
// `srcdoc`. A `srcdoc` iframe has no URL of its own, so every relative
// reference inside it resolves against the page that hosts the iframe —
// the Vite dev server. Asking it for `app.js` returns the single-page
// app's `index.html`, and the browser then tries to parse that HTML as
// JavaScript and fails with "Unexpected token '<'".
//
// So the referenced project files are inlined into the document before
// it is handed to the iframe, and any local reference we cannot resolve
// is stripped rather than left to hit the network.

/** The file name a `src` / `href` points at, if it is a local one. */
const localRefName = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return null;
  // Absolute URL, protocol-relative URL, data: or blob: — not local.
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return null;
  if (raw.startsWith('#')) return null;
  // Strip any query string or fragment, then take the last path segment.
  const path = raw.split(/[?#]/)[0];
  const segment = path.split('/').pop() || '';
  return segment || null;
};

/**
 * Inline the project files an HTML document references.
 *
 * @param {string} html      The document body.
 * @param {Array<{name: string, content: string}>} allFiles  Project files.
 * @returns {{ html: string, inlined: string[] }} The document with local
 *   references resolved, plus the names of the files that were inlined.
 */
export const inlineLocalAssets = (html, allFiles) => {
  let body = String(html || '');
  const files = allFiles || [];
  const byName = new Map();
  for (const f of files) {
    if (!f?.name) continue;
    byName.set(f.name, f);
    // Also index the bare name so `src="app.js"` finds `src/app.js`.
    byName.set(f.name.split('/').pop(), f);
  }

  const inlined = new Set();
  const remember = (name) => {
    if (name) inlined.add(name);
  };

  // <script src="app.js"></script>  ->  <script>…contents…</script>
  body = body.replace(
    /<script\b([^>]*)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>\s*<\/script>/gi,
    (match, before, quote, url, after) => {
      const name = localRefName(url);
      if (!name) return match;
      const file = byName.get(name);
      if (!file) return '';
      remember(file.name);
      return `<script${before}${after}>${file.content || ''}</script>`;
    }
  );

  // <link rel="stylesheet" href="styles.css" />  ->  <style>…</style>
  body = body.replace(
    /<link\b([^>]*)\bhref\s*=\s*(["'])(.*?)\2([^>]*)\/?>/gi,
    (match, before, quote, url, after) => {
      const name = localRefName(url);
      if (!name) return match;
      const file = byName.get(name);
      if (!file) return '';
      if (!/rel\s*=\s*(["'])stylesheet\1/i.test(before)) return '';
      remember(file.name);
      return `<style>${file.content || ''}</style>`;
    }
  );

  // A script tag with no body (e.g. `<script src="x.js" />`).
  body = body.replace(
    /<script\b([^>]*)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)\/?>/gi,
    (match, before, quote, url, after) => {
      const name = localRefName(url);
      if (!name) return match;
      const file = byName.get(name);
      if (!file) return '';
      remember(file.name);
      return `<script${before}${after}>${file.content || ''}</script>`;
    }
  );

  return { html: body, inlined: [...inlined] };
};

// ---------------------------------------------------------------------------
// HTML escape helper used by the runners
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Source-only preview shell — what the user sees when they run a file the
// browser cannot execute (TypeScript, Python, Java, C++, …).
const sourceOnlyPreview = (file, language) => {
  const head = LANGUAGES[language] || LANGUAGES.text;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body { margin: 0; font: 13px/1.5 ui-monospace, Menlo, monospace; background: #0f172a; color: #e2e8f0; }
  .banner { display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: linear-gradient(90deg, #1e293b, #0f172a); border-bottom: 1px solid #1e293b; }
  .banner .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
  .banner .title { font-weight: 600; }
  .banner .sub { color: #94a3b8; font-size: 12px; }
  pre { margin: 0; padding: 20px; white-space: pre-wrap; word-break: break-word; color: #e2e8f0; }
  .hl-kw { color: #60a5fa; }
  .hl-str { color: #34d399; }
  .hl-com { color: #64748b; font-style: italic; }
</style></head>
<body>
  <div class="banner">
    <div class="dot"></div>
    <div>
      <div class="title">${esc(head.icon)} ${esc(head.label)} — preview only</div>
      <div class="sub">${esc(head.description)}</div>
    </div>
  </div>
  <pre id="code">${esc(file.content || '(empty file)')}</pre>
  <script>
    (function () {
      var el = document.getElementById('code');
      var html = el.textContent;
      html = html.replace(/(\/\/[^\n]*)/g, '<span class="hl-com">$1</span>');
      html = html.replace(/("[^"]*"|'[^']*'|\`[^\`]*\`)/g, '<span class="hl-str">$1</span>');
      el.innerHTML = html;
      parent.postMessage({ __sandboxLog: true, level: 'warn', message: '⚠ ' + ${JSON.stringify(head.label)} + ' cannot run in the browser. Showing source preview.' }, '*');
      parent.postMessage({ __sandboxLog: true, level: 'log',   message: 'To execute this file, use a matching local toolchain or backend runner.' }, '*');
      parent.postMessage({ __sandboxDone: true, ok: true }, '*');
    })();
  </script>
</body></html>`;
};

// ---------------------------------------------------------------------------
// Per-language runners
// ---------------------------------------------------------------------------
//
// Each runner receives `{ file, allFiles, addLog }` and returns one of:
//   { kind: 'html',  html }   — load `html` in the preview iframe
//   { kind: 'silent' }        — runner has no preview output (validator)
// ---------------------------------------------------------------------------

export const RUNNERS = {
  html({ file, allFiles }) {
    let body = file.content || '';
    // Resolve `<script src>` / `<link href>` against the project files
    // before the document is handed to the srcdoc iframe — see
    // inlineLocalAssets for why this matters.
    const resolved = inlineLocalAssets(body, allFiles);
    body = resolved.html;
    const alreadyInlined = new Set(resolved.inlined);
    const css = allFiles.find((f) => /\.(css|scss)$/.test(f.name) && !f.name.includes('preview'));
    const js  = allFiles.find((f) => /\.(js|mjs|cjs)$/.test(f.name));
    // Only append a file the document did not already reference, so its
    // code does not run twice.
    if (css && !alreadyInlined.has(css.name)) {
      body = body.replace(/<\/head>/i, `<style>${css.content || ''}</style></head>`);
    }
    if (js && !alreadyInlined.has(js.name)) {
      body = body.replace(/<\/body>/i, `<script>\n${js.content || ''}\n</script></body>`);
    }
    const bridge = SANDBOX_BRIDGE_ONLY;
    if (!/<\/body>/i.test(body)) body += `<body>${bridge}</body>`;
    else body = body.replace(/<\/body>/i, `${bridge}</body>`);
    return { kind: 'html', html: body };
  },

  css({ file, addLog }) {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>${file.content || ''}</style></head>
<body>
  <h1>CSS preview</h1>
  <p>Edit the CSS file and click <b>Run</b> to refresh this preview.</p>
  <button>Hover me</button>
  <div class="card">Sample card</div>
  ${SANDBOX_BRIDGE_ONLY}
</body></html>`;
    addLog('success', `Rendered ${file.name} against a sample HTML page.`);
    return { kind: 'html', html };
  },

  js({ file, addLog }) {
    const code = file.content || '';
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>body{font:13px ui-monospace,monospace;background:#0f172a;color:#e2e8f0;padding:16px;}</style>
</head><body>
<pre id="log"></pre>
${SANDBOX_BRIDGE_ONLY}
<script>
(function () { function run() { try { ${code} } catch (e) { parent.postMessage({ __sandboxLog: true, level: 'error', message: (e && e.stack) || String(e) }, '*'); } parent.postMessage({ __sandboxDone: true, ok: true }, '*'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
</script>
</body></html>`;
    addLog('log', `Executing ${file.name} in sandboxed iframe…`);
    return { kind: 'html', html };
  },

  json({ file, addLog }) {
    const text = (file.content || '').trim();
    if (!text) { addLog('warn', 'File is empty.'); return { kind: 'silent' }; }
    try {
      const parsed = JSON.parse(text);
      addLog('success', '✓ Valid JSON');
      addLog('log', `Top-level type: ${Array.isArray(parsed) ? `array(${parsed.length})` : typeof parsed}`);
      if (parsed && typeof parsed === 'object') {
        const keys = Array.isArray(parsed) ? parsed.slice(0, 20).map((_, i) => `[${i}]`) : Object.keys(parsed).slice(0, 20);
        addLog('log', `Keys (first 20): ${keys.join(', ')}`);
      }
      addLog('log', '— Pretty-printed —');
      for (const line of JSON.stringify(parsed, null, 2).split('\n').slice(0, 200)) addLog('log', line);
      if (JSON.stringify(parsed, null, 2).split('\n').length > 200) addLog('warn', '(truncated to first 200 lines)');
      return { kind: 'silent' };
    } catch (e) {
      addLog('error', `✗ Invalid JSON — ${e.message}`);
      return { kind: 'silent' };
    }
  },

  markdown({ file, addLog }) {
    const md = file.content || '';
    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const renderInline = (s) => {
      let out = escapeHtml(s);
      out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return out;
    };
    const lines = md.split('\n');
    const out = [];
    let inCode = false; let codeBuf = []; let listOpen = false;
    const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };
    for (const raw of lines) {
      const line = raw;
      if (line.startsWith('```')) {
        if (inCode) { out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`); codeBuf = []; inCode = false; }
        else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }
      if (/^#{1,6} /.test(line)) { closeList(); out.push(`<h${line.match(/^#+/)[0].length}>${renderInline(line.replace(/^#+\s*/, ''))}</h${line.match(/^#+/)[0].length}>`); continue; }
      if (/^> /.test(line)) { closeList(); out.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`); continue; }
      if (/^[-*] /.test(line)) {
        if (!listOpen) { out.push('<ul>'); listOpen = true; }
        out.push(`<li>${renderInline(line.slice(2))}</li>`);
        continue;
      }
      if (line.trim() === '') { closeList(); out.push(''); continue; }
      closeList();
      out.push(`<p>${renderInline(line)}</p>`);
    }
    closeList();
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body { font: 15px/1.6 -apple-system, system-ui; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #0f172a; }
  h1, h2, h3 { color: #1e293b; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow: auto; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #6366f1; padding-left: 16px; color: #475569; margin-left: 0; }
  a { color: #2563eb; }
</style></head>
<body>${out.join('\n')}${SANDBOX_BRIDGE_ONLY}</body></html>`;
    addLog('success', `Rendered ${file.name} as HTML preview.`);
    return { kind: 'html', html };
  },

  sql({ file, addLog }) {
    const text = (file.content || '').trim();
    if (!text) { addLog('warn', 'File is empty.'); return { kind: 'silent' }; }
    const issues = [];
    const stripped = text.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/--[^\n]*/g, '');
    const opens = (stripped.match(/\(/g) || []).length;
    const closes = (stripped.match(/\)/g) || []).length;
    if (opens !== closes) issues.push(`Mismatched parentheses: ${opens} '(' vs ${closes} ')'`);
    if (/;\s*$/m.test(text) === false && text.length > 80) issues.push('No terminating \`;\` found (queries usually end with semicolons).');
    const kws = ['SELECT','FROM','WHERE','INSERT','UPDATE','DELETE','CREATE','DROP','ALTER','TABLE','INTO','VALUES','JOIN','LEFT','RIGHT','INNER','OUTER','GROUP','BY','ORDER','LIMIT','OFFSET'];
    const foundKw = kws.filter((k) => new RegExp('\\b' + k + '\\b', 'i').test(text));
    if (text.length > 12 && foundKw.length === 0) issues.push('No SQL keywords detected — does this look like a query?');
    if (issues.length === 0) {
      addLog('success', '✓ SQL syntax check passed (lightweight).');
      addLog('log', `Detected keywords: ${foundKw.join(', ')}`);
      addLog('log', `Length: ${text.split('\n').length} lines · ${text.length} chars.`);
    } else {
      for (const i of issues) addLog('warn', `⚠ ${i}`);
    }
    addLog('log', 'Note: execution needs a real database driver. Connect via the API service.');
    return { kind: 'silent' };
  },

  yaml({ file, addLog }) {
    const text = (file.content || '').trim();
    if (!text) { addLog('warn', 'File is empty.'); return { kind: 'silent' }; }
    const lines = text.split('\n');
    let lastIndent = -1;
    let hasIssue = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const indent = line.match(/^ */)[0].length;
      if (indent % 2 !== 0) { addLog('warn', `Line ${i + 1}: indent ${indent} is odd (YAML likes multiples of 2).`); hasIssue = true; }
      if (indent > lastIndent + 2 && lastIndent !== -1) { addLog('warn', `Line ${i + 1}: jump in indent (${lastIndent} → ${indent}).`); hasIssue = true; }
      lastIndent = indent;
    }
    if (!hasIssue) addLog('success', '✓ Indentation looks consistent (lightweight check).');
    addLog('log', `${lines.length} lines, ${text.length} chars.`);
    return { kind: 'silent' };
  },

  source({ file }) {
    return { kind: 'html', html: sourceOnlyPreview(file, file.language || 'text') };
  },
};

// ---------------------------------------------------------------------------
// Test samples — small, deterministic snippets used by the language test
// sweep. Picked first if a language has no template.
// ---------------------------------------------------------------------------

export const TEST_SAMPLES = {
  html: '<!DOCTYPE html><html><head><title>t</title></head><body><h1>Test</h1><p id="o">ready</p><script>document.getElementById("o").textContent="ok";</script></body></html>',
  css: 'body { background:#0f172a; color:#fff; font: 14px system-ui; padding: 20px; } h1 { color:#60a5fa; }',
  javascript: 'console.log("hello");\nconsole.log(1+2);\nconsole.log(JSON.stringify({ok:true}));',
  typescript: '// TypeScript — preview only (browser cannot execute .ts)\nconst n: number = 42;\nconsole.log("answer", n);',
  jsx: '// JSX — preview only\nimport React from "react";\nexport default function Hi(){ return <h1>hi</h1>; }',
  tsx: '// TSX — preview only\nimport React from "react";\nexport default function Hi(): JSX.Element { return <h1>hi</h1>; }',
  json: '{ "name": "test", "version": "1.0.0", "ok": true, "items": [1,2,3] }',
  markdown: '# Hello\n\nThis is a **test** of the markdown runner.\n\n- one\n- two\n- three',
  python: '# Python — preview only\nprint("hello from python")\nfor i in range(3): print(i)',
  java: '// Java — preview only\npublic class T { public static void main(String[] a) { System.out.println("ok"); } }',
  cpp: '// C++ — preview only\n#include <iostream>\nint main(){ std::cout<<"ok"; return 0; }',
  c: '// C — preview only\n#include <stdio.h>\nint main(){ printf("ok"); return 0; }',
  csharp: '// C# — preview only\nclass P{ static void Main(){ System.Console.WriteLine("ok"); } }',
  go: '// Go — preview only\npackage main\nimport "fmt"\nfunc main(){ fmt.Println("ok") }',
  rust: '// Rust — preview only\nfn main(){ println!("ok"); }',
  php: '<?php // PHP — preview only\necho "ok";',
  ruby: '# Ruby — preview only\nputs "ok"',
  sql: "SELECT id, name FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT 10;",
  yaml: 'name: test\nversion: 1.0.0\nservices:\n  web:\n    image: nginx\n    port: 80',
  text: 'Just some plain text.',
};

export const buildSampleForLanguage = (langId) => {
  const meta = LANGUAGES[langId];
  if (!meta) return '';
  const tplSet = TEMPLATES[langId];
  if (tplSet && Object.keys(tplSet).length > 0) {
    // The first template is used, unless it is deliberately blank (the
    // "Blank note" template is), in which case the plain sample is the
    // better answer.
    const first = Object.values(tplSet)[0];
    if (first) return first;
  }
  return TEST_SAMPLES[langId] || `// Sample ${meta.label} code`;
};

// ---------------------------------------------------------------------------
// Language test runner
// ---------------------------------------------------------------------------
//
// Runs the runner pipeline for every language in LANGUAGES with a sample
// snippet, then reports pass / warning / fail in the same shape as the
// OWASP findings list. Used by the "Test all languages" feature so the user
// can see at a glance which coding types actually execute in this IDE.

export const runSingleLanguageTest = async (langId) => {
  const meta = LANGUAGES[langId];
  if (!meta) {
    return { langId, label: langId, icon: '❓', status: 'fail', severity: 'high', message: 'Unknown language', output: '', duration: 0, canRun: false };
  }

  const sampleContent = buildSampleForLanguage(langId);
  const testFile = { id: '__test__', name: `test.${meta.ext}`, language: langId, content: sampleContent };

  const logs = [];
  const addLog = (type, message) => logs.push({ type, message });

  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let status = 'pass';
  let severity = 'info';
  let message = '';

  try {
    const result = RUNNERS[meta.runner]({ file: testFile, allFiles: [testFile], addLog });

    if (meta.runner === 'source' || meta.runner === 'sql' || meta.runner === 'yaml') {
      const errors = logs.filter((l) => l.type === 'error');
      const warnings = logs.filter((l) => l.type === 'warn');
      if (errors.length > 0) {
        status = 'fail'; severity = 'high';
        message = errors.map((e) => e.message).join(' · ');
      } else if (warnings.length > 0) {
        status = 'warning'; severity = 'medium';
        message = warnings.map((w) => w.message).join(' · ');
      } else {
        const ok = logs.find((l) => l.type === 'success');
        status = 'pass'; severity = 'info';
        message = ok?.message || (meta.canRun === 'partial' ? 'Browser-side check passed.' : 'Source preview only — no execution attempted.');
      }
    } else {
      const iframeHtml = result?.kind === 'html' ? result.html : '';
      if (!iframeHtml) {
        status = 'warning'; severity = 'medium';
        message = 'Runner did not produce a preview payload.';
      } else {
        const testResult = await new Promise((resolve) => {
          const iframe = document.createElement('iframe');
          iframe.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;border:0;';
          iframe.setAttribute('sandbox', 'allow-scripts');
          document.body.appendChild(iframe);

          const onMsg = (e) => {
            const data = e.data;
            if (!data || typeof data !== 'object') return;
            if (data.__sandboxLog) {
              logs.push({ type: data.level === 'ok' ? 'success' : data.level, message: data.message });
            }
            if (data.__sandboxDone) {
              cleanup();
              resolve({ ok: !!data.ok });
            }
          };

          const cleanup = () => {
            window.removeEventListener('message', onMsg);
            clearTimeout(timer);
            try { document.body.removeChild(iframe); } catch {}
          };

          const timer = setTimeout(() => { cleanup(); resolve({ ok: false, timeout: true }); }, 4000);
          window.addEventListener('message', onMsg);
          iframe.srcdoc = iframeHtml;
        });

        if (testResult.timeout) {
          status = 'warning'; severity = 'medium';
          message = 'Execution timed out after 4s (likely an infinite animation or wait).';
        } else if (!testResult.ok) {
          status = 'fail'; severity = 'high';
          const errs = logs.filter((l) => l.type === 'error');
          message = errs.length ? errs.map((e) => e.message).join(' · ') : 'Execution failed without an error message.';
        } else {
          status = 'pass'; severity = 'info';
          message = 'Executed successfully in a sandboxed iframe.';
        }
      }
    }
  } catch (e) {
    status = 'fail'; severity = 'high';
    message = `Runner threw: ${e?.message || String(e)}`;
  }

  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  return {
    langId,
    label: meta.label,
    icon: meta.icon,
    ext: meta.ext,
    status,
    severity,
    message,
    output: logs.map((l) => `[${l.type}] ${l.message}`).slice(0, 20).join('\n'),
    duration: Math.round((t1 - t0) * 10) / 10,
    canRun: meta.canRun,
    description: meta.description,
  };
};

// Run every language in sequence and stream results back through `onResult`.
export const runAllLanguageTests = async (onResult) => {
  const out = [];
  for (const langId of Object.keys(LANGUAGES)) {
    const r = await runSingleLanguageTest(langId);
    out.push(r);
    if (onResult) onResult(r, out);
  }
  return out;
};
