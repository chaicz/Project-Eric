// ---------------------------------------------------------------------------
// sourceUpload.js
//
// The "upload source code" feature as a standalone, reusable function.
//
// This used to live inside the OWASP Scanner page as `handleFileUpload`,
// wired straight to the page's React state. That made it impossible to
// reuse: any other screen that wanted "drop a file in, get the code and
// the language back" had to copy the reader, the size guard and the
// detection call.
//
// Everything here is plain JavaScript with no React dependency, so it can
// be called from a page, from a hook, or from a test:
//
//   import { readSourceFile } from '../utils/sourceUpload';
//
//   const result = await readSourceFile(file);
//   if (result.ok) {
//     result.code          // the file content as text
//     result.detection     // { mode, language, dialect, label, confidence }
//     result.fileName
//     result.size
//   }
// ---------------------------------------------------------------------------

import { detectFileLanguage } from './fileLanguage';

// The largest file the scanner will read.
//
// Anything bigger than this is almost certainly not source code — it is
// an archive, a video, or a data dump — and reading it would freeze the
// browser tab.
export const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Read a dropped/picked file and work out what language it is.
 *
 * The function never throws: every failure comes back as
 * `{ ok: false, error }` so the caller can show a message without a
 * try/catch of its own.
 *
 * @param {File|Blob} file        the file the user picked
 * @param {object}   [options]
 * @param {string}   [options.fileName]  override the name (used for pasted text)
 * @param {number}   [options.maxBytes]  override the size limit
 * @returns {Promise<{
 *   ok: true,
 *   code: string,
 *   fileName: string,
 *   size: number,
 *   detection: {
 *     mode: 'code' | 'sql',
 *     language: string,
 *     dialect: string,
 *     label: string,
 *     confidence: 'extension' | 'content' | 'fallback',
 *     extension: string,
 *   }
 * } | { ok: false, error: string, fileName: string, size: number }>}
 */
export const readSourceFile = async (file, options = {}) => {
  const {
    fileName = file?.name || '',
    maxBytes = MAX_SOURCE_FILE_BYTES,
  } = options;

  const name = fileName;
  const size = Number(file?.size ?? 0);

  if (!file) {
    return { ok: false, error: 'No file was provided.', fileName: name, size };
  }

  if (size > maxBytes) {
    const limitMb = (maxBytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '');
    return {
      ok: false,
      error: `That file is larger than ${limitMb} MB — please upload a smaller source file.`,
      fileName: name,
      size,
    };
  }

  try {
    const text = await file.text();
    const detection = detectFileLanguage(name, text);

    return {
      ok: true,
      code: text,
      fileName: name,
      size,
      detection,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Could not read the file: ${error?.message || String(error)}`,
      fileName: name,
      size,
    };
  }
};

/**
 * Read a file straight from a `<input type="file">` change event.
 *
 * The input is reset afterwards so the same file can be picked again
 * after an edit elsewhere in the app.
 *
 * @param {Event} event
 * @param {object} [options] passed through to `readSourceFile`
 * @returns {Promise<ReturnType<typeof readSourceFile> | null>} null when
 *   nothing was picked.
 */
export const readSourceFileFromEvent = async (event, options = {}) => {
  const input = event?.target;
  const file = input?.files?.[0];

  // Reset the input so the same file can be picked again.
  if (input) input.value = '';

  if (!file) return null;
  return readSourceFile(file, options);
};

/**
 * Turn raw pasted/typed text into something the scanner understands.
 *
 * This is the "no file involved" path: the user pastes code into the
 * editor and the scanner works out the language from the content alone.
 *
 * @param {string} code
 * @param {object} [options]
 * @param {string} [options.fileName] a name to use for the extension lookup
 * @returns {ReturnType<typeof readSourceFile> extends Promise<infer T> ? T : never}
 */
export const readSourceText = (code, options = {}) => {
  const text = String(code ?? '');
  const fileName = options.fileName || '';
  const detection = detectFileLanguage(fileName, text);

  return {
    ok: true,
    code: text,
    fileName,
    size: text.length,
    detection,
  };
};

/**
 * The file types the scanner's picker accepts.
 *
 * Exported so the picker and any other consumer stay in step.
 */
export const SOURCE_FILE_ACCEPT = [
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.mts', '.cts',
  '.py', '.pyw', '.pyi',
  '.java',
  '.cs', '.csx',
  '.go',
  '.php', '.php3', '.php4', '.php5', '.phtml',
  '.rb', '.rake', '.erb',
  '.rs',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh',
  '.sql',
  '.txt', '.md',
  '.json', '.yml', '.yaml', '.xml',
  '.html', '.htm', '.css', '.vue', '.svelte',
  '.sh', '.bash', '.zsh', '.env',
  'text/*',
].join(',');

export default readSourceFile;
