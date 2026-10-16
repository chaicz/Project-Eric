// ---------------------------------------------------------------------------
// syntaxHighlight.js — lightweight, dependency-free syntax highlighter
// ---------------------------------------------------------------------------
// Returns an HTML string with Tailwind text-colour classes wrapped around
// each token. Designed to be rendered as the background layer of a code
// editor where the foreground is a transparent <textarea>.
//
// Each language has a token pattern set. Patterns are combined into a single
// regex with alternation; alternation is left-to-right so we list the more
// specific patterns (comments, strings) first so they "win" over keywords.
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Colour palette — tuned for `bg-slate-950` (deep navy editor surface).
// Each token is bright enough to read clearly at 12.5px on the dark
// background, and bold weights are used for keywords so they pop.
const TOKEN_CLASS = {
  comment:  'text-slate-400 italic',
  string:   'text-amber-200',
  number:   'text-orange-300 font-semibold',
  keyword:  'text-fuchsia-300 font-semibold',
  builtin:  'text-cyan-200',
  function: 'text-sky-200 font-semibold',
  operator: 'text-pink-300',
  punct:    'text-slate-400',
  tag:      'text-rose-300',
  attr:     'text-yellow-200',
  default:  'text-slate-100',
};

// Whitespace-separated keyword lists per language. Trimmed/lowercased on use.
const KEYWORDS = {
  javascript:
    'await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null of return super switch this throw true try typeof undefined var void while with yield async from as',
  typescript:
    'abstract any as async await break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface is keyof let module namespace never new null of private protected public readonly return require set static super switch this throw true try type typeof undefined unique var void while with yield async',
  python:
    'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self',
  sql:
    'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE JOIN LEFT RIGHT INNER OUTER FULL CROSS ON AS AND OR NOT NULL IS IN LIKE BETWEEN EXISTS GROUP BY HAVING ORDER BY LIMIT OFFSET DISTINCT ALL UNION CASE WHEN THEN ELSE END CREATE TABLE DROP ALTER ADD COLUMN CONSTRAINT PRIMARY KEY FOREIGN REFERENCES INDEX VIEW WITH RETURNING INTO',
  java:
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends false final finally float for goto if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient true try void volatile while',
  cpp:
    'auto break case catch char class const continue default delete do double else enum extern false float for friend goto if inline int long mutable namespace new nullptr operator private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while',
  csharp:
    'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while',
  go:
    'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil',
  rust:
    'as async await break const continue crate dyn else enum extern false fn for if impl in let mod move mut pub ref return self Self static struct super trait true unsafe use where while loop match',
  ruby:
    'BEGIN END alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield',
  php:
    '__CLASS__ __DIR__ __FILE__ __FUNCTION__ __LINE__ __METHOD__ __NAMESPACE__ abstract and array as break callable case catch class const continue default die do echo else elseif empty endfor endforeach endif endswitch endwhile extends false finally for foreach function global goto if implements include include_once instanceof interface isset list namespace new null or print private protected public require require_once return static switch throw trait true try unset use var void while xor',
  generic:
    'class const function var return if else for while do break continue new delete this null true false try catch finally throw extends implements interface public private protected static final abstract',
};

const BUILTINS = {
  javascript:
    'Array Boolean console Date document Error fetch Function globalThis Infinity JSON Map Math NaN Number Object Promise Proxy Reflect RegExp Set String Symbol window undefined BigInt Proxy parseInt parseFloat isNaN isFinite',
  python:
    'abs all any bin bool bytearray bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip __import__',
  sql:
    'COUNT SUM AVG MIN MAX COALESCE NULLIF CAST CONVERT UPPER LOWER LENGTH SUBSTRING TRIM REPLACE CONCAT NOW CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP ROUND FLOOR CEIL ABS IFNULL GREATEST LEAST',
  java:
    'System String Integer Boolean Double Float Long ArrayList List Map HashMap HashSet Set Collection Collections Arrays Objects Math PrintStream println print',
  go: 'append cap close copy delete len make new panic recover print println real',
  generic: 'length size count',
};

// Build a per-language pattern list. Order matters: comments > strings >
// numbers > keywords > builtins > function-calls > operators > punctuation.
const buildPatterns = (lang) => {
  const kw = (KEYWORDS[lang] || KEYWORDS.generic).split(/\s+/).filter(Boolean);
  const bi = (BUILTINS[lang] || '').split(/\s+/).filter(Boolean);

  const list = [
    // HTML/XML comments + C-style block + line comments + shell/python
    { type: 'comment', re: /<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g },
    { type: 'comment', re: /--[^\n]*/g },
    { type: 'comment', re: /#[^\n]*/g },
    { type: 'comment', re: /\/\/[^\n]*/g },
    // Triple-quoted + double/single-quoted strings (with escapes)
    { type: 'string', re: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g },
    // Template literals (JS/TS) — minimal handling of ${} blocks
    { type: 'string', re: /`(?:\\.|[^`\\])*`/g },
    // Numbers
    { type: 'number', re: /\b0x[0-9a-fA-F]+\b|\b0b[01]+\b|\b0o[0-7]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g },
  ];

  if (kw.length) {
    list.push({
      type: 'keyword',
      re: new RegExp(`\\b(?:${kw.join('|')})\\b`, 'gi'),
    });
  }
  if (bi.length) {
    list.push({
      type: 'builtin',
      re: new RegExp(`\\b(?:${bi.join('|')})\\b`, 'gi'),
    });
  }
  // Function calls / definitions: identifier followed by `(`
  list.push({ type: 'function', re: /\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()/g });
  // Operators
  list.push({
    type: 'operator',
    re: /\.\.\.|=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%=<>!&|^~?:]/g,
  });
  // Punctuation
  list.push({ type: 'punct', re: /[{}()[\];,.]/g });

  return list;
};

// Combine many pattern objects into a single alternation regex with capture
// groups; remember which index corresponds to which token type so we can look
// it up after each match. We use CAPTURING groups (not non-capturing) so the
// `m[i]` access in the match loop can identify which alternative fired.
const combinePatterns = (patterns) => {
  const sources = patterns.map((p) => `(${p.re.source})`);
  const flags = patterns[0].re.flags.includes('g')
    ? patterns[0].re.flags
    : patterns[0].re.flags + 'g';
  return {
    re: new RegExp(sources.join('|'), flags),
    types: patterns.map((p) => p.type),
  };
};

// Build once per language — small memo.
const cache = new Map();
const getCombined = (lang) => {
  if (!cache.has(lang)) cache.set(lang, combinePatterns(buildPatterns(lang)));
  return cache.get(lang);
};

// Map our editor's `language` state onto a highlighter key.
export const highlightLanguage = (language, mode, dialect) => {
  if (mode === 'sql') return 'sql';
  if (language === 'other') return 'generic';
  return language || 'generic';
};

// Render `code` for `language` to an HTML string with span wrappers.
export const highlight = (code, language) => {
  if (!code) return '';
  const { re, types } = getCombined(highlightLanguage(language));
  // Force the global flag
  const rx = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g');

  let out = '';
  let last = 0;
  // Reset lastIndex to be safe across calls
  rx.lastIndex = 0;
  let m;
  while ((m = rx.exec(code)) !== null) {
    if (m.index > last) {
      out += escapeHtml(code.slice(last, m.index));
    }
    const matched = m[0];
    // Find which group captured
    let tokenType = 'default';
    for (let i = 1; i < m.length; i++) {
      if (m[i] !== undefined) {
        tokenType = types[i - 1] || 'default';
        break;
      }
    }
    const cls = TOKEN_CLASS[tokenType] || TOKEN_CLASS.default;
    out += `<span class="${cls}">${escapeHtml(matched)}</span>`;
    last = m.index + matched.length;
    // Defend against zero-width matches (shouldn't happen but just in case)
    if (matched.length === 0) rx.lastIndex += 1;
  }
  if (last < code.length) {
    out += escapeHtml(code.slice(last));
  }
  return out;
};
