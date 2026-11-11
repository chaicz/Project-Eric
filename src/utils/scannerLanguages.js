// ---------------------------------------------------------------------------
// Scanner language / SQL dialect tables.
//
// These live in their own module because the OWASP Scanner needs the ids and
// file extensions, while the Dashboard needs the human-readable labels — the
// label is what gets persisted to MySQL and rendered on the project card, so
// both pages have to agree on it.
// ---------------------------------------------------------------------------

export const CODE_LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', ext: 'js',  hint: 'Node / Express / React / Vue' },
  { id: 'typescript', label: 'TypeScript', ext: 'ts',  hint: 'TS apps · React / Angular' },
  { id: 'python',     label: 'Python',     ext: 'py',  hint: 'Django / Flask / FastAPI' },
  { id: 'java',       label: 'Java',       ext: 'java',hint: 'Spring / JEE / Quarkus' },
  { id: 'csharp',     label: 'C#',         ext: 'cs',  hint: '.NET / ASP.NET / Blazor' },
  { id: 'go',         label: 'Go',         ext: 'go',  hint: 'net/http · Gin / Echo' },
  { id: 'php',        label: 'PHP',        ext: 'php', hint: 'Laravel / Symfony / raw' },
  { id: 'ruby',       label: 'Ruby',       ext: 'rb',  hint: 'Rails / Sinatra' },
  { id: 'rust',       label: 'Rust',       ext: 'rs',  hint: 'actix-web / axum' },
  { id: 'cpp',        label: 'C / C++',    ext: 'cpp', hint: 'system / embedded' },
  { id: 'other',      label: 'Other',      ext: 'txt', hint: 'mixed / unknown' },
];

export const SQL_DIALECTS = [
  { id: 'mysql',      label: 'MySQL / MariaDB', hint: 'Most web stacks' },
  { id: 'postgres',   label: 'PostgreSQL',      hint: 'Includes $$ blocks' },
  { id: 'tsql',       label: 'T-SQL (SQL Server)', hint: 'Microsoft stack' },
  { id: 'sqlite',     label: 'SQLite',          hint: 'Embedded / mobile' },
  { id: 'oracle',     label: 'Oracle PL/SQL',   hint: 'BEGIN … END blocks' },
  { id: 'generic',    label: 'Generic SQL',     hint: 'ANSI / portable' },
];

/**
 * Turn a scanner language id into the label shown in the UI and stored in
 * MySQL. The scanner keeps raw ids internally (`javascript`, `mysql`), but
 * the database column is a display field, so it stores `JavaScript` /
 * `MySQL / MariaDB` like the seeded projects do.
 *
 * Unknown ids fall back to the raw value rather than `Unknown`, so a
 * language added later still shows something meaningful.
 */
export const scannerLanguageLabel = (mode, languageId, dialectId) => {
  if (mode === 'sql') {
    const found = SQL_DIALECTS.find((d) => d.id === dialectId);
    return found ? found.label : (dialectId || 'SQL');
  }
  const found = CODE_LANGUAGES.find((l) => l.id === languageId);
  return found ? found.label : (languageId || 'Unknown');
};
