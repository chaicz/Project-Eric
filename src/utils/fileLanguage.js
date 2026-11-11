// ---------------------------------------------------------------------------
// fileLanguage.js
//
// Work out which scanner language a dropped file belongs to.
//
// The OWASP Scanner detects 11 code languages plus a SQL mode. A user
// who uploads `orders.php` should not also have to pick "PHP" from a
// dropdown — the file name and the file content already say so.
//
// The detection runs in two steps:
//
//   1. The extension is looked up in a table. This covers the vast
//      majority of files and is exact.
//
//   2. When the extension is unknown (or missing), a set of cheap
//      content heuristics looks for the tell-tale syntax of each
//      language — `<?php`, `def `, `package main`, `using System`,
//      and so on.
//
// If neither step is conclusive the file falls back to `other`, which
// the scanner still analyses: the detectors are mostly language
// agnostic and work on the raw text.
// ---------------------------------------------------------------------------

import { CODE_LANGUAGES, SQL_DIALECTS } from './scannerLanguages';

// ---------------------------------------------------------------------------
// Extension → scanner language
// ---------------------------------------------------------------------------
//
// The first extension in each list is the canonical one. The table is
// deliberately generous: `.mjs`, `.php5` and `.h` all land in a real
// language rather than in "other".
const EXTENSION_MAP = {
  // JavaScript
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  // TypeScript
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  // Python
  py: 'python', pyw: 'python', pyi: 'python',
  // Java
  java: 'java',
  // C#
  cs: 'csharp', csx: 'csharp',
  // Go
  go: 'go',
  // PHP
  php: 'php', php3: 'php', php4: 'php', php5: 'php', phtml: 'php',
  // Ruby
  rb: 'ruby', rake: 'ruby', erb: 'ruby',
  // Rust
  rs: 'rust',
  // C / C++
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  // SQL
  sql: 'sql',
};

// Files that are not source code at all. They are still scanned — the
// detectors are happy with any text — but the user gets a clearer
// message than "JavaScript".
const NON_CODE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'yml', 'yaml', 'xml', 'html', 'htm',
  'css', 'scss', 'less', 'vue', 'svelte', 'sh', 'bash', 'zsh', 'ps1',
  'bat', 'cmd', 'env', 'ini', 'cfg', 'conf', 'toml', 'lock', 'log',
]);

// ---------------------------------------------------------------------------
// Content heuristics
// ---------------------------------------------------------------------------
//
// Each rule is a regular expression that has to match the file, plus
// the language it identifies. The rules are tried in order, so the
// more distinctive ones come first — `<?php` is a much stronger signal
// than a lone `class `.
//
// Every rule needs at least two independent signals (or one that is
// unambiguous on its own), so a file that merely mentions the word
// "import" is not mistaken for Python.
//
// The `weight` on a rule decides what happens when two languages match
// equally well. Java and C# look alike on the surface — both declare
// `public class Foo` — so the tie is broken by weight: C# wins because
// `using System;` and `namespace` are unambiguous, while Java's
// `package com.example;` is only a tie-breaker.
const CONTENT_RULES = [
  { language: 'php',       weight: 3, patterns: [/<\?php\b/i, /<\?=.*\b(echo|print)\b/i] },
  { language: 'python',    weight: 3, patterns: [/^\s*def\s+\w+\s*\(/m, /^\s*from\s+[\w.]+\s+import\b/m, /^\s*import\s+\w+$/m, /^\s*@[\w.]+\s*$/m, /\bself\.\w+\s*=/] },
  { language: 'ruby',      weight: 3, patterns: [/^\s*(?:def|class|module)\s+\w+[\s\S]*?^\s*end\s*$/m, /^\s*require\s+['"][\w\/]+['"]/m, /\bputs\s+["']/, /^\s*(?:attr_accessor|require_relative)\b/m] },
  { language: 'rust',      weight: 3, patterns: [/^\s*fn\s+\w+\s*\(.*\)\s*->/m, /\blet\s+mut\s+\w+/, /\buse\s+std::/, /\bimpl\s+\w+\s+for\s+\w+/] },
  { language: 'go',        weight: 3, patterns: [/^\s*package\s+\w+\s*$/m, /^\s*func\s+\w+\s*\(/m, /:=\s*\w+\s*$/m] },
  { language: 'java',      weight: 2, patterns: [/^\s*package\s+[\w.]+;\s*$/m, /\bpublic\s+(?:static\s+)?(?:class|void|int|String)\b/, /^\s*import\s+(?:java|javax)\.[\w.]+;/m, /\bSystem\.out\.print/] },
  { language: 'csharp',    weight: 3, patterns: [/^\s*using\s+System[\w.]*;/m, /^\s*namespace\s+\w+/m, /\bpublic\s+class\s+\w+\s*:/, /\bConsole\.Write(?:Line)?\(/] },
  { language: 'typescript',weight: 3, patterns: [/^\s*(?:export\s+)?(?:interface|type|enum)\s+\w+/m, /:\s*(?:string|number|boolean|any)\b/, /^\s*import\s+type\s+/m] },
  { language: 'javascript',weight: 2, patterns: [/\b(?:const|let)\s+\w+\s*=/, /=>\s*\{?\s*$/m, /\brequire\(['"][\w@/.-]+['"]\)/, /\bconsole\.log\(/, /\bfunction\s+\w+\s*\(/] },
  { language: 'cpp',       weight: 3, patterns: [/#include\s*[<"]/, /\bstd::/, /\b(?:int|void|char|float|double)\s+main\s*\(/, /\bcout\s*<</] },
  { language: 'sql',       weight: 3, patterns: [/^\s*SELECT\b[\s\S]*?\bFROM\b/im, /^\s*(?:INSERT|UPDATE|DELETE)\s+INTO\b/im, /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|INDEX|VIEW)\b/im, /^\s*ALTER\s+TABLE\b/im, /^\s*DROP\s+(?:TABLE|INDEX|VIEW)\b/im] },
];

/**
 * The content rule that matches the text most convincingly.
 *
 * Every rule is checked and scored. A rule scores the number of its
 * own patterns that matched, multiplied by its weight — a language
 * that trips two of its own patterns beats one that only trips a
 * single, looser pattern.
 *
 * `null` means nothing matched.
 *
 * @param {string} text
 * @returns {object|null} the winning rule
 */
const bestContentRule = (text) => {
  let best = null;
  let bestScore = 0;

  for (const rule of CONTENT_RULES) {
    const hits = rule.patterns.filter((p) => p.test(text)).length;
    if (hits === 0) continue;
    const score = hits * rule.weight;
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }

  return best;
};

/**
 * The label the scanner shows for a language id.
 *
 * @param {string} languageId
 * @returns {string}
 */
export const languageLabel = (languageId) => {
  const found = CODE_LANGUAGES.find((l) => l.id === languageId);
  return found ? found.label : 'Other';
};

/**
 * The SQL dialect that best fits a SQL file.
 *
 * The scanner's SQL mode covers MySQL, PostgreSQL, T-SQL, SQLite,
 * Oracle and generic SQL. The dialect only changes how the sample
 * fixes are written, so the guess never has to be perfect — when
 * nothing matches, generic SQL is the right answer.
 *
 * @param {string} code
 * @returns {string} a dialect id from `SQL_DIALECTS`
 */
export const detectSqlDialect = (code) => {
  const text = String(code || '');
  if (!text.trim()) return 'generic';

  // PostgreSQL: dollar-quoted blocks, `::` casts, `RETURNING`.
  if (/\$\d+/.test(text) || /::\s*(?:text|int|uuid|jsonb|boolean|timestamp)/i.test(text)) return 'postgres';
  if (/\$\$[\s\S]*?\$\$/.test(text) || /\bRETURNING\b/i.test(text)) return 'postgres';

  // T-SQL: `TOP n`, `NVARCHAR`, `GETDATE()`, `ISNULL(`.
  //
  // `TOP` is a row limiter, so it only appears next to a query:
  // `SELECT TOP 10 …` or `… TOP 10 FROM …`. Both shapes are matched —
  // requiring `TOP n` to sit directly against `SELECT`/`FROM` misses the
  // canonical `SELECT TOP 10 * FROM users`, where a column list sits
  // between the limiter and the table.
  if (/\bSELECT\s+TOP\s+\(?\d+\)?\b/i.test(text) ||
      /\bTOP\s+\(?\d+\)?\s+FROM\b/i.test(text) ||
      /\b(?:NVARCHAR|GETDATE|ISNULL)\s*\(/i.test(text)) return 'tsql';
  if (/\[[A-Za-z_][\w]*\]/.test(text) && /\bFROM\b/i.test(text)) return 'tsql';

  // SQLite: `AUTOINCREMENT`, `INTEGER PRIMARY KEY`, `sqlite_` prefix.
  if (/\bAUTOINCREMENT\b/i.test(text) || /\bINTEGER\s+PRIMARY\s+KEY\b/i.test(text) || /\bsqlite_/i.test(text)) return 'sqlite';

  // Oracle: `VARCHAR2`, `NUMBER(`, `NVL(`, `DUAL`.
  if (/\bVARCHAR2\b/i.test(text) || /\bNUMBER\s*\(\s*\d+/i.test(text) || /\bNVL\s*\(/i.test(text)) return 'oracle';
  if (/\bFROM\s+DUAL\b/i.test(text)) return 'oracle';

  // MySQL: backticks, `AUTO_INCREMENT`, `IFNULL(`, `NOW()`.
  if (/`[^`]+`/.test(text) || /\bAUTO_INCREMENT\b/i.test(text) || /\bIFNULL\s*\(/i.test(text)) return 'mysql';

  return 'generic';
};

/**
 * The file extension of a file name, lowercased and without the dot.
 *
 * @param {string} fileName
 * @returns {string}
 */
export const fileExtension = (fileName) => {
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  if (dot === -1 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
};

/**
 * Work out the scanner mode and language for an uploaded file.
 *
 * @param {string} fileName the original file name
 * @param {string} code     the file content
 * @returns {{
 *   mode: 'code' | 'sql',
 *   language: string,      // a code language id, or 'other'
 *   dialect: string,       // a SQL dialect id, used in sql mode
 *   label: string,         // what the UI shows
 *   confidence: 'extension' | 'content' | 'fallback',
 *   extension: string
 * }}
 */
export const detectFileLanguage = (fileName, code) => {
  const extension = fileExtension(fileName);
  const text = String(code || '');

  // ---- 1. The extension -------------------------------------------------
  if (extension && EXTENSION_MAP[extension]) {
    const mapped = EXTENSION_MAP[extension];

    if (mapped === 'sql') {
      const dialect = detectSqlDialect(text);
      const found = SQL_DIALECTS.find((d) => d.id === dialect);
      return {
        mode: 'sql',
        language: 'sql',
        dialect,
        label: found ? found.label : 'SQL',
        confidence: 'extension',
        extension,
      };
    }

    return {
      mode: 'code',
      language: mapped,
      dialect: 'generic',
      label: languageLabel(mapped),
      confidence: 'extension',
      extension,
    };
  }

  // ---- 2. The content ---------------------------------------------------
  // Only worth trying when the file looks like source code. A `.md` or
  // `.json` file would trip the `SELECT ... FROM` SQL rule easily.
  const looksLikeCode = !NON_CODE_EXTENSIONS.has(extension);

  if (looksLikeCode && text.trim()) {
    const rule = bestContentRule(text);
    if (rule) {
      if (rule.language === 'sql') {
        const dialect = detectSqlDialect(text);
        const found = SQL_DIALECTS.find((d) => d.id === dialect);
        return {
          mode: 'sql',
          language: 'sql',
          dialect,
          label: found ? found.label : 'SQL',
          confidence: 'content',
          extension,
        };
      }
      return {
        mode: 'code',
        language: rule.language,
        dialect: 'generic',
        label: languageLabel(rule.language),
        confidence: 'content',
        extension,
      };
    }
  }

  // ---- 3. Nothing conclusive --------------------------------------------
  return {
    mode: 'code',
    language: 'other',
    dialect: 'generic',
    label: languageLabel('other'),
    confidence: 'fallback',
    extension,
  };
};

/**
 * Work out the scanner mode and language from the code content alone.
 *
 * This is the path used when the user pastes code into the editor or
 * edits it by hand: there is no file name, so the extension lookup
 * cannot help and only the content heuristics can.
 *
 * The rules are the same ones `detectFileLanguage` uses for content
 * detection, but every rule is checked and the strongest match wins
 * instead of the first one that happens to hit. That matters for
 * pasted snippets, which often mix several signals — a Python file that
 * mentions `SELECT ... FROM` in a comment, for instance, would be
 * claimed by the SQL rule if it were tried first.
 *
 * @param {string} code
 * @returns {{
 *   mode: 'code' | 'sql',
 *   language: string,
 *   dialect: string,
 *   label: string,
 *   confidence: 'content' | 'fallback',
 *   extension: string
 * }}
 */
export const detectCodeLanguage = (code) => {
  const text = String(code || '');

  const fallback = {
    mode: 'code',
    language: 'other',
    dialect: 'generic',
    label: languageLabel('other'),
    confidence: 'fallback',
    extension: '',
  };

  if (!text.trim()) return fallback;

  // Score every rule and take the best one.
  let best = bestContentRule(text);

  if (!best) return fallback;

  if (best.language === 'sql') {
    const dialect = detectSqlDialect(text);
    const found = SQL_DIALECTS.find((d) => d.id === dialect);
    return {
      mode: 'sql',
      language: 'sql',
      dialect,
      label: found ? found.label : 'SQL',
      confidence: 'content',
      extension: '',
    };
  }

  return {
    mode: 'code',
    language: best.language,
    dialect: 'generic',
    label: languageLabel(best.language),
    confidence: 'content',
    extension: '',
  };
};

export default detectFileLanguage;
