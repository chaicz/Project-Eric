// ---------------------------------------------------------------------------
// sourceDownload.js
//
// Shared helpers for downloading scanner source files.
//
// The scanner reads uploaded files locally, so the same source and the
// generated fix can be handed back to the browser without a server round
// trip. Keeping the filename and extension logic here makes the source
// download and the fixed-file download behave consistently.
// ---------------------------------------------------------------------------

const SOURCE_MIME_TYPES = {
  javascript: 'text/javascript;charset=utf-8',
  typescript: 'text/typescript;charset=utf-8',
  python: 'text/x-python;charset=utf-8',
  java: 'text/x-java-source;charset=utf-8',
  csharp: 'text/x-csharp;charset=utf-8',
  go: 'text/x-go;charset=utf-8',
  php: 'text/x-php;charset=utf-8',
  ruby: 'text/x-ruby;charset=utf-8',
  rust: 'text/x-rust;charset=utf-8',
  cpp: 'text/x-c++src;charset=utf-8',
  sql: 'application/sql;charset=utf-8',
  mysql: 'application/sql;charset=utf-8',
  postgres: 'application/sql;charset=utf-8',
  tsql: 'application/sql;charset=utf-8',
  sqlite: 'application/sql;charset=utf-8',
  oracle: 'application/sql;charset=utf-8',
  generic: 'application/sql;charset=utf-8',
  other: 'text/plain;charset=utf-8',
};

const LANGUAGE_EXTENSIONS = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  csharp: 'cs',
  go: 'go',
  php: 'php',
  ruby: 'rb',
  rust: 'rs',
  cpp: 'cpp',
  sql: 'sql',
  other: 'txt',
};

const safeSegment = (value, fallback = 'file') => {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned || fallback;
};

/**
 * Keep the original uploaded file name where possible.
 *
 * A fixed download is named `name.fixed.ext`, so opening it does not
 * overwrite the vulnerable source file already in the downloads folder.
 */
export const buildFixedFileName = (originalName, fallbackName = 'scanned-file') => {
  const safeName = safeSegment(originalName, safeSegment(fallbackName));
  const dot = safeName.lastIndexOf('.');
  if (dot > 0) {
    const base = safeName.slice(0, dot);
    const extension = safeName.slice(dot + 1);
    return `${base}.fixed.${extension}`;
  }
  return `${safeName}.fixed.txt`;
};

export const sourceMimeType = (language, mode = 'code') => {
  if (mode === 'sql') return SOURCE_MIME_TYPES.sql;
  return SOURCE_MIME_TYPES[language] || SOURCE_MIME_TYPES.other;
};

/**
 * Download text as a local file.
 *
 * The browser creates the download from a Blob URL, so the file never
 * has to be uploaded to the application server.
 */
export const downloadTextFile = ({
  content,
  fileName,
  mimeType = 'text/plain;charset=utf-8',
}) => {
  const text = String(content ?? '');
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeSegment(fileName, 'download.txt');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const languageExtension = (language, mode = 'code') => {
  if (mode === 'sql') return 'sql';
  return LANGUAGE_EXTENSIONS[language] || LANGUAGE_EXTENSIONS.other;
};
