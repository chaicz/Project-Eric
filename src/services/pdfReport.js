// ---------------------------------------------------------------------------
// pdfReport.js
//
// Builds the PDF security report for a scan.
//
// The report is generated in the browser, so the source code is never
// sent anywhere to create it. The user gets a document that:
//
//   • opens in any PDF reader (A4, standard fonts, no plugin needed)
//   • labels the offending code, so the reader can see *which* line the
//     detector flagged and why
//   • spells out the concrete actions that fix the issue
//
// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
// The document is built by hand rather than by a table helper, because
// the code blocks need to be drawn line by line (line numbers, a
// highlight band behind the offending line and a marker underneath it).
// A small cursor object (`layout`) keeps track of the vertical position
// and starts a new page when a section would run off the bottom.
//
// Page order:
//
//   1. Cover        — file, language, score, counts, expiry notice
//   2. How to read  — the legend for the labels used in the findings
//   3. Findings     — one block per category that failed or warned
//   4. Clean bill   — only when nothing was found
//
// ---------------------------------------------------------------------------
// Text encoding
// ---------------------------------------------------------------------------
// jsPDF's built-in fonts are WinAnsi encoded. A character outside that
// set (CJK, emoji, an arrow) would be written out as two bytes and
// render as garbage in the reader, so every string that goes into the
// document is passed through `toWinAnsi` first. That function maps the
// characters we actually use onto WinAnsi equivalents and replaces
// anything left over with a readable placeholder.
// ---------------------------------------------------------------------------

import { jsPDF } from 'jspdf';

// ---------------------------------------------------------------------------
// Page geometry (A4 portrait, in points)
// ---------------------------------------------------------------------------
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const COLOR = {
  ink:        [15, 23, 42],
  body:       [51, 65, 85],
  muted:      [113, 128, 150],
  faint:      [148, 163, 184],
  rule:       [226, 232, 240],
  panel:      [248, 250, 252],
  panelEdge:  [226, 232, 240],
  brand:      [4, 120, 87],
  brandSoft:  [209, 250, 229],
  fail:       [220, 38, 38],
  failSoft:   [254, 226, 226],
  warn:       [217, 119, 6],
  warnSoft:   [254, 243, 199],
  pass:       [22, 163, 74],
  passSoft:   [220, 252, 231],
  info:       [37, 99, 235],
  infoSoft:   [219, 234, 254],
  code:       [30, 41, 59],
  codeMuted:  [100, 116, 139],
  highlight:  [254, 226, 226],
  highlightEdge: [239, 68, 68],
};

// ---------------------------------------------------------------------------
// Per-category accent colours
// ---------------------------------------------------------------------------
//
// Each OWASP category keeps the same colour everywhere it appears in
// the document: on the cover, on the finding's heading bar, on the
// "How to fix" panel and in the priority table. A reader learns the
// colour once and can then find the same category again by colour
// alone, without reading the id.
//
// The colours are chosen to stay distinguishable in greyscale too —
// their brightness differs as well as their hue — so the document
// still reads when it is printed in black and white.
const CATEGORY_COLORS = {
  A01: { accent: [225, 29, 72],  soft: [255, 228, 230] },  // rose
  A02: { accent: [217, 119, 6],  soft: [254, 243, 199] },  // amber
  A03: { accent: [220, 38, 38],   soft: [254, 226, 226] },  // red
  A04: { accent: [124, 58, 237],  soft: [237, 233, 254] },  // violet
  A05: { accent: [71, 85, 105],   soft: [241, 245, 249] },  // slate
  A06: { accent: [234, 88, 12],   soft: [255, 237, 213] },  // orange
  A07: { accent: [219, 39, 119],  soft: [252, 231, 243] },  // pink
  A08: { accent: [8, 145, 178],   soft: [207, 250, 254] },  // cyan
  A09: { accent: [79, 70, 229],   soft: [224, 231, 255] },  // indigo
  A10: { accent: [5, 150, 105],   soft: [209, 250, 229] },  // emerald
};

/**
 * The accent colour of a category, falling back to the brand colour
 * for an id that is not in the table.
 *
 * @param {string} id
 * @returns {{accent: number[], soft: number[]}}
 */
const categoryColor = (id) => CATEGORY_COLORS[id] || { accent: COLOR.brand, soft: COLOR.brandSoft };

/**
 * The colour of a severity level.
 *
 * @param {string} severity
 * @returns {{accent: number[], soft: number[]}}
 */
const severityColor = (severity) => {
  switch (severity) {
    case 'critical': return { accent: COLOR.fail, soft: COLOR.failSoft };
    case 'high':     return { accent: [234, 88, 12], soft: [255, 237, 213] };
    case 'medium':   return { accent: COLOR.warn, soft: COLOR.warnSoft };
    case 'low':      return { accent: COLOR.info, soft: COLOR.infoSoft };
    default:         return { accent: COLOR.muted, soft: COLOR.panel };
  }
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
const FONT_TEXT = 'helvetica';
const FONT_BOLD = 'helvetica';
const FONT_CODE = 'courier';

const SIZE = {
  coverTitle: 26,
  h1: 16,
  h2: 12,
  body: 10,
  small: 8.5,
  tiny: 7.5,
  code: 8,
};

// ---------------------------------------------------------------------------
// Text encoding
// ---------------------------------------------------------------------------

// Characters outside WinAnsi that we want to keep, mapped onto ASCII
// fallbacks. A character is only looked up here when it is NOT in the
// WinAnsi set below, so anything whose glyph survives natively (middle
// dots, em dashes, bullets, smart quotes, …) is never replaced.
const WIN_ANSI_SUBSTITUTES = {
  '\u2192': '->',   // →
  '\u2190': '<-',   // ←
  '\u2191': '^',    // ↑
  '\u2193': 'v',    // ↓
  '\u25B2': '^',    // ▲
  '\u25BC': 'v',    // ▼
  '\u25CF': '*',    // ●
  '\u25CB': 'o',    // ○
  '\u25A0': '#',    // ■
  '\u25AA': '-',    // ▪
  '\u25B6': '>',    // ▶
  '\u2713': 'OK',   // ✓
  '\u2714': 'OK',   // ✔
  '\u2717': 'x',    // ✗
  '\u2718': 'x',    // ✘
  '\u26A0': '!',    // ⚠
  '\u2260': '!=',   // ≠
  '\u2264': '<=',   // ≤
  '\u2265': '>=',   // ≥
  '\u221A': 'sqrt', // √
  '\u00D7': 'x',    // ×
  '\u2212': '-',    // −
  '\u00AD': '',
  '\u200B': '',
  '\u200C': '',
  '\u200D': '',
  '\uFEFF': '',
  '\u202F': ' ',
  '\u2009': ' ',
  '\u200A': ' ',
};

// WinAnsi (CP1252) code points that jsPDF encodes correctly.
const WIN_ANSI_CODEPOINTS = new Set([
  ...Array.from({ length: 0x80 }, (_, i) => i),        // 0x00 - 0x7F
  ...Array.from({ length: 0x80 }, (_, i) => 0x80 + i),  // 0x80 - 0xFF
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
  0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017D, 0x2018,
  0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC,
  0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

/**
 * Make a string safe to write into a WinAnsi-encoded PDF.
 *
 * The substitutions run first (so a real arrow becomes `->` rather than
 * a placeholder), then anything still outside WinAnsi is replaced with
 * `?`, which reads as "unavailable" rather than as a broken glyph.
 *
 * @param {*} value
 * @returns {string}
 */
export const toWinAnsi = (value) => {
  if (value === null || value === undefined) return '';
  const raw = String(value);

  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0);

    // A character the WinAnsi font can draw keeps its own glyph. This
    // is checked first, so the middle dot, the em dash, the bullet and
    // the typographic quotes all survive as themselves.
    if (WIN_ANSI_CODEPOINTS.has(code)) {
      out += ch;
      continue;
    }

    // Otherwise fall back to an ASCII equivalent where we have one.
    const sub = WIN_ANSI_SUBSTITUTES[ch];
    if (sub !== undefined) {
      out += sub;
      continue;
    }

    // Characters that WinAnsi simply does not have. A placeholder keeps
    // the line length honest instead of silently dropping content.
    out += '?';
  }

  return out;
};

/**
 * Strip the control characters that would break a PDF text run.
 *
 * @param {*} value
 * @returns {string}
 */
const cleanText = (value) => toWinAnsi(value)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

/**
 * Format a timestamp for the report.
 *
 * The locale is deliberately ignored: `toLocaleString` produces
 * characters such as `年` or a narrow no-break space on some machines,
 * and the WinAnsi PDF font cannot draw those — they would come out as
 * `?` in the report. A fixed English format always renders.
 *
 * @param {Date} date
 * @returns {string} e.g. "2 Nov 2026, 21:30"
 */
const formatTimestamp = (date) => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Prepare a block of source code for the PDF.
 *
 * Tabs are expanded (a tab has no meaningful width in a PDF text run)
 * and the code is truncated per line so a single very long line cannot
 * push the layout off the page.
 *
 * @param {string} code
 * @returns {string[]}
 */
const prepareCodeLines = (code) => {
  const maxChars = 200;
  return String(code || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const expanded = line.replace(/\t/g, '  ').replace(/\s+$/, '');
      return expanded.length > maxChars ? `${expanded.slice(0, maxChars - 1)}…` : expanded;
    });
};

// ---------------------------------------------------------------------------
// Layout cursor
// ---------------------------------------------------------------------------
//
// A tiny helper that owns the vertical cursor and knows how to start a
// new page. Every drawing helper takes it as its first argument.
// ---------------------------------------------------------------------------
class Layout {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN;
    this.page = 1;
  }

  /** True when `height` more points still fit on the current page. */
  fits(height) {
    return this.y + height <= PAGE_H - MARGIN - 18;
  }

  /** Reserve `height` points, starting a new page when it does not fit. */
  reserve(height) {
    if (!this.fits(height)) this.newPage();
  }

  /** Start a new page and reset the cursor. */
  newPage() {
    this.doc.addPage();
    this.page += 1;
    this.y = MARGIN;
    return this;
  }

  /** Move the cursor down. */
  down(points) {
    this.y += points;
    return this;
  }

  /** Draw a filled rectangle at the cursor position. */
  band(x, width, height, color) {
    this.doc.setFillColor(color[0], color[1], color[2]);
    this.doc.rect(x, this.y, width, height, 'F');
    return this;
  }

  /** Draw a horizontal rule at the cursor position. */
  rule(x, width, color = COLOR.rule, thickness = 0.7) {
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(thickness);
    this.doc.line(x, this.y, x + width, this.y);
    return this;
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/**
 * Draw a wrapped paragraph of body text.
 *
 * @param {Layout} layout
 * @param {string} text
 * @param {object} [opts]
 */
const drawParagraph = (layout, text, opts = {}) => {
  const {
    font = FONT_TEXT,
    style = 'normal',
    size = SIZE.body,
    color = COLOR.body,
    indent = 0,
    lineHeight = 1.32,
    gapAfter = 0,
  } = opts;

  const content = cleanText(text);
  if (!content) {
    layout.down(gapAfter);
    return;
  }

  const doc = layout.doc;
  doc.setFont(font, style === 'bold' ? 'bold' : style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);

  // jsPDF measures the width of a line with its own font metrics, which
  // can be a fraction of a point wider than the reader draws it. A small
  // safety margin keeps the last character of a line off the margin.
  const width = CONTENT_W - indent - 4;
  const lines = doc.splitTextToSize(content, width);

  // Widow control. A paragraph that splits over a page break must
  // leave at least two lines on each side of the break: a single line
  // stranded at the top of a page reads as a mistake.
  const rowHeight = size * lineHeight;
  const remaining = lines.length;

  let startIndex = 0;

  while (startIndex < remaining) {
    // How many of the lines still to draw fit on this page?
    let fitCount = 0;
    let probe = layout.y;
    while (startIndex + fitCount < remaining) {
      if (probe + rowHeight > PAGE_H - MARGIN - 18) break;
      probe += rowHeight;
      fitCount += 1;
    }

    // Not everything fits: reserve what is left of the page.
    if (fitCount < remaining - startIndex) {
      if (fitCount <= 1) {
        // Only one line would stay behind, so the whole paragraph moves
        // to the next page rather than leaving an orphan.
        layout.newPage();
        fitCount = Math.min(
          remaining - startIndex,
          Math.floor((PAGE_H - MARGIN * 2 - 18) / rowHeight)
        );
      } else if (fitCount === remaining - startIndex - 1) {
        // One line would be pushed to the next page on its own, so one
        // more line is taken along to keep it company.
        fitCount -= 1;
      }
    }

    for (let i = 0; i < fitCount; i += 1) {
      const line = lines[startIndex + i];
      doc.text(line, MARGIN + indent, layout.y + size);
      layout.down(rowHeight);
    }

    startIndex += fitCount;

    if (startIndex < remaining) {
      layout.newPage();
    }
  }

  layout.down(gapAfter);
};

/**
 * Draw a heading with a coloured accent bar on the left.
 *
 * @param {Layout} layout
 * @param {string} text
 * @param {object} [opts]
 */
const drawHeading = (layout, text, opts = {}) => {
  const { color = COLOR.brand, size = SIZE.h1, gapBefore = 8, gapAfter = 6 } = opts;

  layout.reserve(size + gapBefore + gapAfter + 6);
  layout.down(gapBefore);

  const doc = layout.doc;
  const barHeight = size + 2;

  doc.setFillColor(color[0], color[1], color[2]);
  // The bar spans the height of the heading's glyphs.
  doc.rect(MARGIN - 10, layout.y + 2, 3.5, size, 'F');

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(size);
  doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
  // The baseline sits a full font size below the cursor, so the glyphs
  // start at the cursor instead of reaching up into the block above.
  doc.text(cleanText(text), MARGIN, layout.y + size);

  layout.down(barHeight + gapAfter - 2);
};

/**
 * Draw a small pill (a status chip) on the current line.
 *
 * @param {Layout} layout
 * @param {string} text
 * @param {object} [opts]
 */
const drawChip = (layout, text, opts = {}) => {
  const { fg = COLOR.brand, bg = COLOR.brandSoft, size = SIZE.tiny } = opts;
  const doc = layout.doc;

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(size);
  const label = cleanText(text).toUpperCase();
  const width = doc.getTextWidth(label) + 12;

  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(MARGIN, layout.y - size + 1, width, size + 6, 3, 3, 'F');
  doc.setTextColor(fg[0], fg[1], fg[2]);
  doc.text(label, MARGIN + 6, layout.y + 2);

  layout.y = layout.y; // the chip sits on the current line
  return width;
};

/**
 * Draw a pill that is aligned to the right edge of the content area.
 *
 * The status and severity chips on a finding's heading both use this,
 * so they line up with each other no matter how long the title is.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {number} y       the top of the pill
 * @param {string} text
 * @param {{fg: number[], bg: number[]}} style
 * @param {number} [size]
 * @returns {number} the width of the pill
 */
const drawRightChip = (doc, y, text, style, size = SIZE.tiny) => {
  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(size);
  const label = cleanText(text).toUpperCase();
  const width = doc.getTextWidth(label) + 12;

  doc.setFillColor(style.bg[0], style.bg[1], style.bg[2]);
  doc.roundedRect(PAGE_W - MARGIN - width, y, width, size + 6, 3, 3, 'F');
  doc.setTextColor(style.fg[0], style.fg[1], style.fg[2]);
  doc.text(label, PAGE_W - MARGIN - width + 6, y + size + 1);

  return width;
};

/**
 * Draw a key/value row.
 *
 * @param {Layout} layout
 * @param {string} label
 * @param {string} value
 */
const drawMetaRow = (layout, label, value) => {
  const doc = layout.doc;
  const rowHeight = 15;

  layout.reserve(rowHeight);
  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.small);
  doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
  doc.text(cleanText(label), MARGIN, layout.y + SIZE.small);

  doc.setFont(FONT_BOLD, 'bold');
  doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
  const lines = doc.splitTextToSize(cleanText(value), CONTENT_W - 150);
  doc.text(lines[0], MARGIN + 150, layout.y + SIZE.small);

  layout.down(rowHeight);
};

// ---------------------------------------------------------------------------
// Code block
// ---------------------------------------------------------------------------

const CODE_GUTTER = 34;      // width of the line-number column
const CODE_LEFT = MARGIN + CODE_GUTTER + 8;
const CODE_LINE_H = 10.6;
const CODE_FONT_SIZE = SIZE.code;

/**
 * Split one logical source line into the physical rows it needs.
 *
 * A line longer than the code column is wrapped instead of truncated —
 * the whole line stays visible, which matters when the flagged part of
 * a long statement sits past the right edge.
 *
 * @param {string} line
 * @param {number} maxChars
 * @returns {string[]}
 */
const wrapCodeLine = (line, maxChars) => {
  if (line.length <= maxChars) return [line];

  const rows = [];
  let rest = line;
  while (rest.length > maxChars) {
    // Prefer to break at a space so the wrapped part reads naturally.
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    rows.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest.length) rows.push(rest);
  return rows;
};

/**
 * Render a labelled code excerpt.
 *
 * The excerpt shows the source lines around the evidence hits. A line
 * the detector flagged is highlighted and a marker is printed directly
 * underneath it, so the reader can connect the finding to the code
 * without hunting for line numbers.
 *
 * Several hits that fall inside the same window are drawn as one
 * block, with a marker under each of them — printing the same source
 * lines twice would only waste space and confuse the reader.
 *
 * @param {Layout} layout
 * @param {object} opts
 * @param {string[]} opts.lines       the prepared source lines
 * @param {number} opts.startLine     the source line number of lines[0]
 * @param {Map<number, string>} opts.markers  line number -> marker text
 * @param {string} opts.note          an optional caption above the block
 */
const drawCodeBlock = (layout, opts) => {
  const { lines, startLine, markers, note } = opts;
  const doc = layout.doc;

  const maxChars = Math.floor((CONTENT_W - CODE_GUTTER - 14) / (CODE_FONT_SIZE * 0.6));

  // ---- Build the physical rows -----------------------------------------
  const rows = [];
  lines.forEach((text, index) => {
    const absolute = startLine + index;
    const marker = markers.get(absolute);
    const isFlagged = marker !== undefined;
    const pieces = wrapCodeLine(text, maxChars);
    pieces.forEach((piece, pieceIndex) => {
      rows.push({
        text: piece,
        absolute,
        isFlagged,
        isFirst: pieceIndex === 0,
      });
    });
    if (isFlagged) {
      rows.push({ marker, isFlagged: false, isMarker: true });
    }
  });

  if (!rows.length) return;

  // ---- Reserve the whole block ------------------------------------------
  const blockHeight = rows.length * CODE_LINE_H + 14;

  // A block that is taller than a page is split: the code is drawn in
  // chunks that each fit on the page.
  let index = 0;
  while (index < rows.length) {
    layout.reserve(CODE_LINE_H * 3 + 20);

    // How much room is left on the current page? The budget is what
    // is left below the cursor, not the whole page — a block that
    // starts half-way down only gets the rest of the page, and would
    // otherwise run past the bottom margin.
    const available = () => PAGE_H - MARGIN - 18 - layout.y - 14;

    const chunk = [];
    while (index < rows.length) {
      const row = rows[index];
      // Keep the highlighted line together with its marker.
      const chunkHeight = (chunk.length + 1) * CODE_LINE_H + 14;
      if (chunk.length > 0 && chunkHeight > available()) break;
      chunk.push(row);
      index += 1;
      if (chunk.length > 60) break;
    }

    // A single row that does not fit even on an empty page is drawn
    // anyway, rather than looping forever.
    if (!chunk.length) {
      chunk.push(rows[index]);
      index += 1;
    }

    const height = chunk.length * CODE_LINE_H + 12;

    // ---- Panel background ------------------------------------------------
    doc.setFillColor(COLOR.panel[0], COLOR.panel[1], COLOR.panel[2]);
    doc.setDrawColor(COLOR.panelEdge[0], COLOR.panelEdge[1], COLOR.panelEdge[2]);
    doc.setLineWidth(0.6);
    doc.roundedRect(MARGIN, layout.y, CONTENT_W, height, 4, 4, 'FD');

    const top = layout.y;
    let cursorY = layout.y + CODE_LINE_H + 1;

    chunk.forEach((row, rowIndex) => {
      if (row.isMarker) {
        // The marker that points at the flagged line.
        doc.setFont(FONT_TEXT, 'bold');
        doc.setFontSize(SIZE.tiny);
        doc.setTextColor(COLOR.highlightEdge[0], COLOR.highlightEdge[1], COLOR.highlightEdge[2]);
        doc.text(cleanText(row.marker), CODE_LEFT, cursorY);
        cursorY += CODE_LINE_H;
        return;
      }

      if (row.isFlagged) {
        // The band behind the offending line.
        doc.setFillColor(COLOR.highlight[0], COLOR.highlight[1], COLOR.highlight[2]);
        doc.rect(MARGIN + 1, cursorY - CODE_FONT_SIZE - 2.5, CONTENT_W - 2, CODE_LINE_H, 'F');
        doc.setFillColor(COLOR.highlightEdge[0], COLOR.highlightEdge[1], COLOR.highlightEdge[2]);
        doc.rect(MARGIN + 1, cursorY - CODE_FONT_SIZE - 2.5, 2.5, CODE_LINE_H, 'F');
      }

      if (row.isFirst) {
        // The line number, in the gutter.
        doc.setFont(FONT_CODE, 'normal');
        doc.setFontSize(SIZE.tiny);
        doc.setTextColor(
          row.isFlagged ? COLOR.highlightEdge[0] : COLOR.codeMuted[0],
          row.isFlagged ? COLOR.highlightEdge[1] : COLOR.codeMuted[1],
          row.isFlagged ? COLOR.highlightEdge[2] : COLOR.codeMuted[2]
        );
        const number = String(row.absolute);
        doc.text(number, MARGIN + CODE_GUTTER - doc.getTextWidth(number), cursorY);
      }

      doc.setFont(FONT_CODE, row.isFlagged ? 'bold' : 'normal');
      doc.setFontSize(CODE_FONT_SIZE);
      doc.setTextColor(
        row.isFlagged ? COLOR.ink[0] : COLOR.code[0],
        row.isFlagged ? COLOR.ink[1] : COLOR.code[1],
        row.isFlagged ? COLOR.ink[2] : COLOR.code[2]
      );
      doc.text(cleanText(row.text), CODE_LEFT, cursorY);

      cursorY += CODE_LINE_H;
    });

    layout.y = top + height + 6;

    if (index < rows.length) {
      layout.newPage();
      // Repeat the caption when the block continues on the next page.
      if (note) {
        doc.setFont(FONT_TEXT, 'italic');
        doc.setFontSize(SIZE.tiny);
        doc.setTextColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
        doc.text(cleanText(`${note} (continued)`), MARGIN, layout.y + SIZE.tiny);
        layout.down(CODE_LINE_H + 2);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Priority table
// ---------------------------------------------------------------------------

/**
 * The rank of a severity, so the most urgent issue can be sorted to
 * the top of the priority table.
 */
const SEVERITY_RANK = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Draw the "fix these first" table.
 *
 * A report that lists thirteen issues in detector order leaves the
 * reader to work out which one matters. This table sorts the findings
 * by severity and puts the top few in the order they should be
 * tackled, each with its category colour.
 *
 * @param {Layout} layout
 * @param {object[]} findings
 */
const drawPriorityTable = (layout, findings) => {
  const doc = layout.doc;

  const ranked = [...findings]
    .filter((f) => f.status === 'fail' || f.status === 'warning')
    .sort((a, b) => {
      const rank = (SEVERITY_RANK[a.severity] ?? 5) - (SEVERITY_RANK[b.severity] ?? 5);
      if (rank !== 0) return rank;
      return (b.count || 0) - (a.count || 0);
    });

  if (!ranked.length) return;

  // Only the top issues fit on the cover; the rest are documented in
  // full further into the report. The note under the title says so.
  const MAX_ROWS = 6;
  const shown = ranked.slice(0, MAX_ROWS);
  const hidden = ranked.length - shown.length;

  const ROW_H = 20;
  const PANEL_PAD = 11;

  const panelH = PANEL_PAD * 2 + 18 + shown.length * ROW_H + (hidden > 0 ? 14 : 0);
  layout.reserve(panelH + 8);
  layout.down(2);

  const top = layout.y;

  doc.setFillColor(COLOR.panel[0], COLOR.panel[1], COLOR.panel[2]);
  doc.setDrawColor(COLOR.panelEdge[0], COLOR.panelEdge[1], COLOR.panelEdge[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(MARGIN, top, CONTENT_W, panelH, 5, 5, 'FD');

  // The panel title.
  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.small);
  doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
  doc.text('Fix these first', MARGIN + PANEL_PAD, top + PANEL_PAD + 8);

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.tiny);
  doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
  doc.text(
    cleanText(
      hidden > 0
        ? `Top ${shown.length} of ${ranked.length}, worst first`
        : `${ranked.length} issue${ranked.length === 1 ? '' : 's'}, worst first`
    ),
    PAGE_W - MARGIN - PANEL_PAD,
    top + PANEL_PAD + 8,
    { align: 'right' }
  );

  let rowY = top + PANEL_PAD + 22;

  shown.forEach((finding, index) => {
    const colors = categoryColor(finding.id);
    const severity = SEVERITY_LABEL[finding.severity] || finding.severity || 'Info';

    // A colour bar on the left of the row, in the category's colour.
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.rect(MARGIN + PANEL_PAD, rowY + 1, 3, ROW_H - 8, 'F');

    // The rank number.
    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(SIZE.tiny);
    doc.setTextColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
    doc.text(String(index + 1), MARGIN + PANEL_PAD + 10, rowY + 10);

    // The category id and name.
    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(SIZE.small);
    doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.text(cleanText(finding.id || ''), MARGIN + PANEL_PAD + 24, rowY + 10);

    doc.setFont(FONT_TEXT, 'normal');
    doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
    // The name stops before the hit count and the severity pill, so
    // the three columns never run into each other.
    const nameWidth = CONTENT_W - PANEL_PAD * 2 - 24 - 190;
    const nameLines = doc.splitTextToSize(cleanText(finding.name || ''), nameWidth);
    doc.text(nameLines[0], MARGIN + PANEL_PAD + 62, rowY + 10);

    // The severity pill, right-aligned.
    const sev = severityColor(finding.severity);
    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(SIZE.tiny);
    const sevLabel = cleanText(severity).toUpperCase();
    const sevWidth = doc.getTextWidth(sevLabel) + 12;
    const sevX = PAGE_W - MARGIN - PANEL_PAD - sevWidth;
    doc.setFillColor(sev.accent[0], sev.accent[1], sev.accent[2]);
    doc.roundedRect(sevX, rowY + 1, sevWidth, SIZE.tiny + 5, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(sevLabel, sevX + 6, rowY + SIZE.tiny + 2);

    // The number of hits sits to the left of the severity pill, on
    // the same line. Putting it underneath used to overlap the pill.
    if (finding.count > 0) {
      doc.setFont(FONT_TEXT, 'normal');
      doc.setFontSize(SIZE.tiny);
      doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
      const hitsText = cleanText(`${finding.count} hit${finding.count === 1 ? '' : 's'}`);
      doc.text(hitsText, sevX - 8, rowY + SIZE.tiny + 2, { align: 'right' });
    }

    rowY += ROW_H;
  });

  // A note about the issues that did not fit on the cover.
  if (hidden > 0) {
    doc.setFont(FONT_TEXT, 'italic');
    doc.setFontSize(SIZE.tiny);
    doc.setTextColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
    doc.text(
      cleanText(
        `${hidden} more issue${hidden === 1 ? '' : 's'} — all of them are documented in this report.`
      ),
      MARGIN + PANEL_PAD,
      rowY + 4
    );
  }

  layout.y = top + panelH + 8;
};

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

/**
 * A titled sub-section, e.g. "How to fix".
 *
 * `keepWith` is the amount of content that has to fit below the
 * heading for it to stay on the same page. Without it a heading can
 * end up alone at the bottom of a page with its content on the next
 * one, which reads badly.
 *
 * @param {Layout} layout
 * @param {string} title
 * @param {number[]} [color]
 * @param {number} [keepWith]
 */
const drawSubHeading = (layout, title, color = COLOR.ink, keepWith = 0) => {
  const doc = layout.doc;
  layout.reserve(24 + keepWith);
  layout.down(6);

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.h2);
  doc.setTextColor(color[0], color[1], color[2]);
  // The baseline sits a full font size below the cursor, so the glyphs
  // start at the cursor instead of reaching up into the block above.
  doc.text(cleanText(title), MARGIN, layout.y + SIZE.h2);

  layout.down(6);
  layout.rule(MARGIN, CONTENT_W);
  layout.down(10);
};

/**
 * The height a paragraph needs, so the caller can reserve it before
 * drawing the heading that goes with it.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {string} text
 * @param {number} width
 * @param {number} size
 * @returns {number}
 */
const measureParagraph = (doc, text, width, size) => {
  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(size);

  const lines = doc.splitTextToSize(cleanText(text), width - 4);
  return lines.length * (size * 1.32);
};

/**
 * The height a list of items needs, so the caller can reserve it
 * before drawing the heading that goes with the list.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {string[]} items
 * @param {number} width
 * @returns {number}
 */
const measureList = (doc, items, width) => {
  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.body);

  return items.reduce((sum, item) => {
    const lines = doc.splitTextToSize(cleanText(item), width);
    return sum + lines.length * (SIZE.body * 1.3) + 3;
  }, 0);
};

/**
 * A numbered list.
 *
 * Each item is kept together on one page: the full height of the item
 * is reserved before its first line is drawn, so a step can never be
 * cut in half across a page break.
 *
 * @param {Layout} layout
 * @param {string[]} items
 * @param {{accent: number[]}} [colors] the colour of the step numbers
 */
const drawNumberedList = (layout, items, colors = null) => {
  const doc = layout.doc;
  const indent = 22;
  const accent = colors?.accent || COLOR.brand;

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.body);

  // Keep the whole list on one page when it fits: reserving the total
  // height first moves the section to a fresh page instead of leaving
  // one step stranded at the bottom of this one.
  const totalHeight = items.reduce((sum, item) => {
    const lines = doc.splitTextToSize(cleanText(item), CONTENT_W - indent);
    return sum + lines.length * (SIZE.body * 1.3) + 3;
  }, 0);
  layout.reserve(totalHeight + 4);

  items.forEach((item, index) => {
    doc.setFont(FONT_BOLD, 'bold');
    doc.setTextColor(accent[0], accent[1], accent[2]);
    const label = `${index + 1}.`;

    doc.setFont(FONT_TEXT, 'normal');
    doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
    const lines = doc.splitTextToSize(cleanText(item), CONTENT_W - indent);

    layout.reserve(lines.length * (SIZE.body * 1.3) + 6);

    lines.forEach((line, lineIndex) => {
      if (lineIndex === 0) {
        doc.setFont(FONT_BOLD, 'bold');
        doc.setTextColor(accent[0], accent[1], accent[2]);
        doc.text(label, MARGIN, layout.y + SIZE.body);
        doc.setFont(FONT_TEXT, 'normal');
        doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
      }
      doc.text(line, MARGIN + indent, layout.y + SIZE.body);
      layout.down(SIZE.body * 1.3);
    });

    layout.down(3);
  });
};

/**
 * A checklist with a small square in front of every entry.
 *
 * Like the numbered list, each entry is drawn on a single page.
 *
 * @param {Layout} layout
 * @param {string[]} items
 */
const drawChecklist = (layout, items) => {
  const doc = layout.doc;
  const indent = 20;

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.body);

  // As with the numbered list, the whole checklist is kept together.
  const totalHeight = items.reduce((sum, item) => {
    const lines = doc.splitTextToSize(cleanText(item), CONTENT_W - indent);
    return sum + lines.length * (SIZE.body * 1.3) + 2;
  }, 0);
  layout.reserve(totalHeight + 4);

  items.forEach((item) => {
    doc.setFont(FONT_TEXT, 'normal');
    doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
    const lines = doc.splitTextToSize(cleanText(item), CONTENT_W - indent);

    layout.reserve(lines.length * (SIZE.body * 1.3) + 5);

    lines.forEach((line, lineIndex) => {
      if (lineIndex === 0) {
        doc.setDrawColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
        doc.setLineWidth(0.8);
        doc.rect(MARGIN + 2, layout.y + 1.5, 8, 8);
      }
      doc.text(line, MARGIN + indent, layout.y + SIZE.body);
      layout.down(SIZE.body * 1.3);
    });

    layout.down(2);
  });
};

/**
 * A list of reference links.
 *
 * @param {Layout} layout
 * @param {Array<{title: string, url: string}>} refs
 */
const drawReferences = (layout, refs) => {
  const doc = layout.doc;

  refs.forEach((ref) => {
    layout.reserve(14);
    doc.setFont(FONT_TEXT, 'normal');
    doc.setFontSize(SIZE.small);
    doc.setTextColor(COLOR.info[0], COLOR.info[1], COLOR.info[2]);

    const title = cleanText(ref.title || ref.url);
    doc.text(title, MARGIN + 14, layout.y + SIZE.small);

    doc.setFillColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
    doc.circle(MARGIN + 5, layout.y + SIZE.small - 3, 2, 'F');

    if (ref.url) {
      doc.link(MARGIN + 14, layout.y, doc.getTextWidth(title), SIZE.small + 2, {
        url: ref.url,
      });
    }

    layout.down(14);
  });
};

/**
 * A panel with a tinted background, used for the callouts.
 *
 * @param {Layout} layout
 * @param {string} title
 * @param {string} body
 * @param {object} [opts]
 */
const drawCallout = (layout, title, body, opts = {}) => {
  const { accent = COLOR.info, bg = COLOR.infoSoft, icon = 'i' } = opts;
  const doc = layout.doc;

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.body);
  const titleLines = doc.splitTextToSize(cleanText(title), CONTENT_W - 60);

  doc.setFont(FONT_TEXT, 'normal');
  const bodyLines = doc.splitTextToSize(cleanText(body), CONTENT_W - 60);

  const height =
    titleLines.length * (SIZE.body * 1.3) +
    bodyLines.length * (SIZE.body * 1.3) +
    24;

  layout.reserve(height + 8);
  layout.down(4);

  const top = layout.y;
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(MARGIN, top, CONTENT_W, height, 5, 5, 'F');
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.roundedRect(MARGIN, top, 3.5, height, 2, 2, 'F');

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.body);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(cleanText(icon), MARGIN + 14, top + 17);

  let cursorY = top + 12;
  doc.setTextColor(accent[0], accent[1], accent[2]);
  titleLines.forEach((line) => {
    doc.text(line, MARGIN + 30, cursorY + SIZE.body);
    cursorY += SIZE.body * 1.3;
  });

  cursorY += 3;
  doc.setFont(FONT_TEXT, 'normal');
  doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
  bodyLines.forEach((line) => {
    doc.text(line, MARGIN + 30, cursorY + SIZE.body);
    cursorY += SIZE.body * 1.3;
  });

  layout.y = top + height + 8;
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_STYLE = {
  fail:    { label: 'Fail',    fg: COLOR.fail, bg: COLOR.failSoft },
  warning: { label: 'Warning', fg: COLOR.warn, bg: COLOR.warnSoft },
  pass:    { label: 'Pass',    fg: COLOR.pass, bg: COLOR.passSoft },
};

const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

const drawCover = (layout, meta) => {
  const doc = layout.doc;
  const { fileName, languageLabel, mode, score, summary, totalIssues, counts, generatedAt, expiresAt } = meta;

  // ---- Header band -------------------------------------------------------
  const bandHeight = 168;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, bandHeight, 'F');
  doc.setFillColor(4, 120, 87);
  doc.rect(0, bandHeight - 5, PAGE_W, 5, 'F');

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.coverTitle);
  doc.setTextColor(255, 255, 255);
  doc.text('OWASP Top 10 (2026)', MARGIN, 62);

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(15);
  doc.setTextColor(209, 250, 229);
  doc.text('Security Report', MARGIN, 86);

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.small);
  doc.setTextColor(148, 163, 184);
  doc.text(
    cleanText(
      `Generated ${generatedAt}  ·  Static analysis, ${mode === 'sql' ? 'SQL' : 'source code'} mode`
    ),
    MARGIN,
    116
  );

  // ---- Score -------------------------------------------------------------
  const scoreColor =
    score >= 85 ? COLOR.pass : score >= 65 ? COLOR.warn : COLOR.fail;

  const boxY = bandHeight + 26;
  const boxW = 150;
  const boxH = 92;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(COLOR.rule[0], COLOR.rule[1], COLOR.rule[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(MARGIN, boxY, boxW, boxH, 8, 8, 'FD');

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.tiny);
  doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
  doc.text('SECURITY SCORE', MARGIN + 16, boxY + 22);

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(36);
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.text(String(score), MARGIN + 16, boxY + 62);

  // The width of the score has to be measured with the large font still
  // active, otherwise "/ 100" is placed on top of the digits.
  const scoreWidth = doc.getTextWidth(String(score));

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.small);
  doc.setTextColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
  doc.text('/ 100', MARGIN + 16 + scoreWidth + 8, boxY + 62);

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.small);
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.text(cleanText(summary), MARGIN + 16, boxY + 84);

  // ---- Counts ------------------------------------------------------------
  const countX = MARGIN + boxW + 24;
  const countW = (CONTENT_W - boxW - 24) / 3;

  const countItems = [
    { label: 'Failed', value: counts.fail, color: COLOR.fail, soft: COLOR.failSoft },
    { label: 'Warnings', value: counts.warn, color: COLOR.warn, soft: COLOR.warnSoft },
    { label: 'Passed', value: counts.pass, color: COLOR.pass, soft: COLOR.passSoft },
  ];

  countItems.forEach((item, index) => {
    const x = countX + index * countW;
    doc.setFillColor(item.soft[0], item.soft[1], item.soft[2]);
    doc.roundedRect(x, boxY, countW - 10, boxH, 8, 8, 'F');

    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(30);
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(String(item.value), x + 16, boxY + 50);

    doc.setFont(FONT_TEXT, 'normal');
    doc.setFontSize(SIZE.small);
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.label, x + 16, boxY + 72);

    doc.setFont(FONT_TEXT, 'normal');
    doc.setFontSize(SIZE.tiny);
    doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
    doc.text(
      `${item.value === 1 ? 'category' : 'categories'}`,
      x + 16,
      boxY + 84
    );
  });

  layout.y = boxY + boxH + 24;

  // ---- What to do first -------------------------------------------------
  // The priority table comes before the file details and the notices,
  // because it is the part of the cover a reader acts on. It is the
  // one thing on the page that tells them where to start.
  if (Array.isArray(meta.findings)) {
    drawPriorityTable(layout, meta.findings);
  }

  // ---- File details ------------------------------------------------------
  // The heading sits below the priority panel, with enough clearance
  // that its glyphs do not touch the panel's bottom edge.
  layout.reserve(24);
  layout.down(10);

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.h2);
  doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
  doc.text('Scanned file', MARGIN, layout.y + SIZE.h2);
  layout.down(18);

  drawMetaRow(layout, 'File name', fileName || 'pasted snippet');
  drawMetaRow(layout, 'Language', languageLabel || 'Unknown');
  drawMetaRow(layout, 'Issues found', String(totalIssues));
  layout.down(18);

  // ---- Expiry notice -----------------------------------------------------
  // The notices stay on the cover page. Sending them to a page of
  // their own left that page almost empty, because two callouts are
  // far too little to fill a sheet.
  drawCallout(
    layout,
    'This report is deleted 24 hours after it was generated',
    `The report contains excerpts of your source code. The stored copy is removed from the server automatically${
      expiresAt ? ` on ${expiresAt}` : ''
    }, and the download link stops working at that moment. Download the file to keep it, or delete the stored copy straight away.`,
    { accent: COLOR.warn, bg: COLOR.warnSoft, icon: '!' }
  );

  drawCallout(
    layout,
    'How to read this report',
    'Every finding has three parts: the labelled source code that triggered it, the actions that fix it, and the references that explain the weakness class. The next page is a short legend for the labels used.',
    { accent: COLOR.info, bg: COLOR.infoSoft, icon: 'i' }
  );
};

// ---------------------------------------------------------------------------
// Legend page
// ---------------------------------------------------------------------------

const drawLegend = (layout) => {
  const doc = layout.doc;

  layout.newPage();
  drawHeading(layout, 'How to read this report', { color: COLOR.brand });

  drawParagraph(
    layout,
    'The scanner checks the submitted code against all ten OWASP Top 10 (2026) categories. Categories that failed or produced a warning are documented below with the evidence that caused them.',
    { gapAfter: 12 }
  );

  // ---- Labels ------------------------------------------------------------
  // The panel is sized from the rows it holds, so the cursor always
  // ends up clear of the panel's bottom edge. A heading that started
  // inside the panel would have its text drawn on the panel border.
  const legendRows = [
    ['A03 · Injection', 'The OWASP category, its name, and the severity of the hit.'],
    ['CWE-89', 'The weakness identifier the category maps to.'],
    ['line 42', 'The source line the detector flagged. It is highlighted in the code block.'],
    ['>> A03 Injection', 'A marker printed under the flagged line, so the code and the finding line up.'],
    ['FIX', 'The coloured panel that states, in one line, what the fix is.'],
  ];

  const LEGEND_TITLE_H = 18;
  const LEGEND_ROW_H = 16;
  const LEGEND_PAD_TOP = 16;
  const LEGEND_PAD_BOTTOM = 14;

  const legendPanelH =
    LEGEND_PAD_TOP + LEGEND_TITLE_H + legendRows.length * LEGEND_ROW_H + LEGEND_PAD_BOTTOM;

  layout.reserve(legendPanelH + 8);

  const panelTop = layout.y;
  doc.setFillColor(COLOR.panel[0], COLOR.panel[1], COLOR.panel[2]);
  doc.setDrawColor(COLOR.panelEdge[0], COLOR.panelEdge[1], COLOR.panelEdge[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(MARGIN, panelTop, CONTENT_W, legendPanelH, 5, 5, 'FD');

  const legendTop = panelTop + LEGEND_PAD_TOP;
  const legendX = MARGIN + 16;

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.small);
  doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
  doc.text('The labels used in a finding', legendX, legendTop);

  let legendY = legendTop + LEGEND_TITLE_H;
  legendRows.forEach(([label, meaning]) => {
    doc.setFont(FONT_CODE, 'bold');
    doc.setFontSize(SIZE.tiny);
    doc.setTextColor(COLOR.brand[0], COLOR.brand[1], COLOR.brand[2]);
    doc.text(cleanText(label), legendX, legendY);

    doc.setFont(FONT_TEXT, 'normal');
    doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
    doc.text(cleanText(meaning), legendX + 128, legendY);

    legendY += LEGEND_ROW_H;
  });

  // The cursor moves past the whole panel, not just past the last
  // row, so the next block starts below the panel's bottom edge.
  layout.y = panelTop + legendPanelH + 14;

  // ---- Severity ----------------------------------------------------------
  drawSubHeading(layout, 'Severity levels');

  const severities = [
    ['Critical', 'Exploitable right now with serious impact. Fix before anything else.', COLOR.fail],
    ['High', 'A real weakness that an attacker can reach. Fix in this sprint.', COLOR.warn],
    ['Medium', 'A weakness that needs a specific condition to become dangerous.', COLOR.info],
    ['Low', 'Hardening advice. Schedule it, but it is not urgent.', COLOR.faint],
  ];

  severities.forEach(([label, meaning, color]) => {
    layout.reserve(16);
    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(SIZE.small);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(cleanText(label), MARGIN, layout.y + SIZE.small);

    doc.setFont(FONT_TEXT, 'normal');
    doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
    doc.text(cleanText(meaning), MARGIN + 74, layout.y + SIZE.small);
    layout.down(16);
  });

  layout.down(6);

  // ---- Category colours --------------------------------------------------
  // Each category keeps one colour for the whole document. This table
  // is the key that lets a reader recognise a category by its colour.
  drawSubHeading(layout, 'Category colours', COLOR.ink, 20);

  const colorRows = [
    ['A01', 'Broken Access Control'],
    ['A02', 'Cryptographic Failures'],
    ['A03', 'Injection'],
    ['A04', 'Insecure Design'],
    ['A05', 'Security Misconfiguration'],
    ['A06', 'Vulnerable Components'],
    ['A07', 'Authentication Failures'],
    ['A08', 'Data Integrity Failures'],
    ['A09', 'Logging Failures'],
    ['A10', 'SSRF'],
  ];

  // Two columns of five, so the list fits in one short block.
  const COL_W = (CONTENT_W - 20) / 2;
  const COLOR_ROW_H = 16;

  layout.reserve(colorRows.length / 2 * COLOR_ROW_H + 8);

  colorRows.forEach(([id, name], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + col * (COL_W + 20);
    const y = layout.y + row * COLOR_ROW_H;

    const colors = categoryColor(id);

    // The colour swatch.
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.roundedRect(x, y + 1, 14, 9, 2, 2, 'F');

    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(SIZE.small);
    doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.text(cleanText(id), x + 22, y + SIZE.small);

    doc.setFont(FONT_TEXT, 'normal');
    doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
    doc.text(cleanText(name), x + 52, y + SIZE.small);
  });

  layout.down(Math.ceil(colorRows.length / 2) * COLOR_ROW_H + 10);

  drawParagraph(
    layout,
    'The suggestions in this report are language-specific: the before-and-after snippets use the same language and framework as the scanned file, so they can be pasted straight into the editor.',
    { gapAfter: 4 }
  );
};

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * Draw the summary of a fix in a tinted panel.
 *
 * The panel carries the category's colour, so the "what to do" block
 * of every finding looks the same and is recognisable at a glance.
 *
 * @param {Layout} layout
 * @param {string} text
 * @param {{accent: number[], soft: number[]}} colors
 */
const drawFixSummary = (layout, text, colors) => {
  const doc = layout.doc;
  const content = cleanText(text);
  if (!content) return;

  const PAD = 14;
  const lines = doc.splitTextToSize(content, CONTENT_W - PAD * 2 - 14);
  const height = lines.length * (SIZE.body * 1.32) + PAD * 2;

  layout.reserve(height + 10);
  layout.down(2);

  const top = layout.y;

  doc.setFillColor(colors.soft[0], colors.soft[1], colors.soft[2]);
  doc.roundedRect(MARGIN, top, CONTENT_W, height, 5, 5, 'F');

  // A solid bar on the left edge, in the category's colour.
  doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
  doc.roundedRect(MARGIN, top, 4, height, 2, 2, 'F');

  // A small "fix" marker in the bar.
  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.tiny);
  doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
  doc.text('FIX', MARGIN + 12, top + PAD + 3);

  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.body);
  doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);

  let cursorY = top + PAD + 10;
  lines.forEach((line) => {
    doc.text(line, MARGIN + PAD + 14, cursorY);
    cursorY += SIZE.body * 1.32;
  });

  layout.y = top + height + 10;
};

/**
 * Draw the closing "Next steps" page.
 *
 * The report ends with a page that turns the findings into a plan:
 * what to fix first, how to verify each fix, and where the raw data
 * is if the reader wants to work in a spreadsheet instead.
 *
 * @param {Layout} layout
 * @param {object[]} findings
 * @param {object[]} actionable
 */
const drawNextSteps = (layout, findings, actionable) => {
  const doc = layout.doc;

  layout.newPage();
  drawHeading(layout, 'Next steps', { color: COLOR.brand });

  if (!actionable.length) {
    drawParagraph(
      layout,
      'No category failed and none produced a warning, so there is nothing to fix from this scan. The scanner only reports on the code it was given, so keep scanning the rest of the project and re-run this scan whenever the code changes.',
      { gapAfter: 12 }
    );
  } else {
    drawParagraph(
      layout,
      `This scan found ${actionable.length} categor${actionable.length === 1 ? 'y' : 'ies'} that need attention. Work through them in this order.`,
      { gapAfter: 12 }
    );

    // ---- The plan --------------------------------------------------------
    const steps = [
      'Start with the highest-severity finding. Critical and high findings are reachable by an attacker today, so they come before everything else.',
      'Apply the fix from the "How to fix" section of that finding. The before/after reference shows the change in the same language as your file.',
      'Work through the "Verify the fix" checklist for the finding. It lists the specific behaviour to confirm, not just "re-test it".',
      'Re-run the scanner on the file once the change is in. The finding should move from Fail or Warning to Pass.',
      'Move on to the next finding. Fixing one category often touches code that another finding points at, so re-scan before you continue.',
    ];

    drawSubHeading(layout, 'How to work through this report', COLOR.ink, 40);
    drawNumberedList(layout, steps);

    layout.down(8);

    // ---- A reminder about what a scan can and cannot see ---------------
    drawCallout(
      layout,
      'This is a static scan, not a proof of safety',
      'The scanner reads the code you gave it. It matches known weakness patterns, so it cannot see a flaw that has no recognisable pattern, a mistake in a business rule, or a problem that only appears at runtime. Treat the passing categories as "not detected", not as "verified safe".',
      { accent: COLOR.info, bg: COLOR.infoSoft, icon: 'i' }
    );
  }

  // ---- Working with the data --------------------------------------------
  // The CSV export carries the same findings in a spreadsheet shape.
  layout.reserve(120);
  layout.down(4);

  drawSubHeading(layout, 'Working with the data', COLOR.ink, 30);

  drawParagraph(
    layout,
    'The same findings are available as a CSV file: one row per category with its status, severity, CWE and fix guidance, followed by one row per individual hit with the source line. Open it in a spreadsheet to sort the findings by severity, filter them by category, or paste them into a ticket.',
    { gapAfter: 8 }
  );

  drawParagraph(
    layout,
    'The findings are also stored with your account, so you can come back to them from the Reports page and compare this scan with a later one.',
    { size: SIZE.small, color: COLOR.muted, gapAfter: 4 }
  );
};

/**
 * Render one finding.
 *
 * @param {Layout} layout
 * @param {object} finding
 * @param {string[]} allLines
 * @param {number} index
 * @param {number} total
 */
const drawFinding = (layout, finding, allLines, index, total) => {
  const doc = layout.doc;
  const style = STATUS_STYLE[finding.status] || STATUS_STYLE.warning;

  // ---- Heading -----------------------------------------------------------
  // A finding needs room for its heading, its meta line and at least
  // the start of the description — otherwise the heading would sit
  // alone at the bottom of a page.
  layout.reserve(78);
  layout.down(6);

  const title = `${finding.id} · ${finding.name}`;
  const colors = categoryColor(finding.id);

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.h1);
  // The id is drawn in the category's own colour, so the same category
  // is recognisable at a glance wherever it appears in the document.
  doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);

  // The title gets its own line so it never collides with the chip.
  const titleLines = doc.splitTextToSize(cleanText(title), CONTENT_W - 110);
  // The baseline sits a full font size below the cursor, so the glyphs
  // start at the cursor instead of reaching up into the block above.
  doc.text(titleLines[0], MARGIN, layout.y + SIZE.h1);
  layout.down(SIZE.h1 * 1.15);

  if (titleLines.length > 1) {
    titleLines.slice(1).forEach((line) => {
      doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
      doc.text(line, MARGIN, layout.y + SIZE.h1);
      layout.down(SIZE.h1 * 1.15);
    });
  }

  // The status chip sits to the right of the title.
  const chipLabel = finding.status === 'warning' ? 'Warning' : style.label;
  const chipY = layout.y - SIZE.h1 * 1.15 - 2;
  const chipWidth = drawRightChip(doc, chipY, chipLabel, {
    fg: style.fg,
    bg: style.bg,
  });

  // The severity pill sits to the left of the status chip. Both are
  // drawn at the same height, so they read as one row of labels.
  const severity = SEVERITY_LABEL[finding.severity] || finding.severity || 'Info';
  const sevStyle = severityColor(finding.severity);

  doc.setFont(FONT_BOLD, 'bold');
  doc.setFontSize(SIZE.tiny);
  const sevLabel = cleanText(severity).toUpperCase();
  const sevWidth = doc.getTextWidth(sevLabel) + 12;

  doc.setFillColor(sevStyle.accent[0], sevStyle.accent[1], sevStyle.accent[2]);
  doc.roundedRect(
    PAGE_W - MARGIN - chipWidth - sevWidth - 6,
    chipY,
    sevWidth,
    SIZE.tiny + 6,
    3,
    3,
    'F'
  );
  doc.setTextColor(255, 255, 255);
  doc.text(
    sevLabel,
    PAGE_W - MARGIN - chipWidth - sevWidth - 6 + 6,
    chipY + SIZE.tiny + 1
  );

  layout.down(4);

  // ---- Meta line ---------------------------------------------------------
  doc.setFont(FONT_TEXT, 'normal');
  doc.setFontSize(SIZE.small);
  doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
  const metaLeft = cleanText(finding.cwe || '');
  doc.text(metaLeft, MARGIN, layout.y + SIZE.small);

  const severityX = MARGIN + doc.getTextWidth(metaLeft) + 12;
  doc.setFont(FONT_BOLD, 'bold');
  doc.setTextColor(sevStyle.accent[0], sevStyle.accent[1], sevStyle.accent[2]);
  doc.text(cleanText(severity), severityX, layout.y + SIZE.small);

  const countX = severityX + doc.getTextWidth(cleanText(severity)) + 14;
  doc.setFont(FONT_TEXT, 'normal');
  doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
  const hits = finding.count > 0 ? `${finding.count} hit${finding.count === 1 ? '' : 's'}` : '';
  doc.text(cleanText(hits), countX, layout.y + SIZE.small);

  layout.down(16);

  // ---- Description -------------------------------------------------------
  drawParagraph(layout, finding.description || '', { gapAfter: 8 });

  // ---- Labelled code -----------------------------------------------------
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
  const withLines = evidence.filter((e) => e && Number(e.line) > 0);

  if (withLines.length) {
    drawSubHeading(layout, 'Labelled code', COLOR.ink);

    // The evidence hits are grouped into windows of surrounding source
    // code. Two hits that fall into the same window are drawn once,
    // each with its own marker, so the same source lines are never
    // printed twice.
    const hits = [...new Set(withLines.map((e) => Number(e.line)))].sort((a, b) => a - b);
    const CONTEXT = 4;
    const windows = [];

    hits.forEach((lineNumber) => {
      const from = Math.max(1, lineNumber - CONTEXT);
      const to = Math.min(allLines.length, lineNumber + CONTEXT);

      const last = windows[windows.length - 1];
      if (last && from <= last.to + 1) {
        // Overlaps or touches the previous window — extend it.
        last.to = Math.max(last.to, to);
        last.hits.push(lineNumber);
      } else {
        windows.push({ from, to, hits: [lineNumber] });
      }
    });

    // At most three windows are printed, so a file with dozens of hits
    // still produces a readable report.
    windows.slice(0, 3).forEach((window) => {
      const markers = new Map();
      window.hits.forEach((lineNumber) => {
        markers.set(lineNumber, `>> ${finding.id} ${finding.name} - line ${lineNumber}`);
      });

      drawCodeBlock(layout, {
        lines: allLines.slice(window.from - 1, window.to),
        startLine: window.from,
        markers,
        note: `${finding.id} · ${finding.name}`,
      });
    });

    if (windows.length > 3) {
      layout.reserve(16);
      doc.setFont(FONT_TEXT, 'italic');
      doc.setFontSize(SIZE.tiny);
      doc.setTextColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
      doc.text(
        cleanText(
          `${windows.length - 3} further location${windows.length - 3 === 1 ? '' : 's'} not shown — see the finding count above.`
        ),
        MARGIN,
        layout.y + SIZE.tiny
      );
      layout.down(16);
    }

    // Evidence that has no line number (a pattern-level warning) is
    // still worth listing.
    const withoutLines = evidence.filter((e) => e && !Number(e.line));
    if (withoutLines.length) {
      layout.reserve(withoutLines.length * 16 + 10);
      doc.setFont(FONT_BOLD, 'bold');
      doc.setFontSize(SIZE.small);
      doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
      doc.text('What the detector saw', MARGIN, layout.y + SIZE.small);
      layout.down(14);

      withoutLines.slice(0, 6).forEach((hit) => {
        doc.setFont(FONT_TEXT, 'normal');
        doc.setFontSize(SIZE.small);
        doc.setTextColor(COLOR.body[0], COLOR.body[1], COLOR.body[2]);
        const lines = doc.splitTextToSize(cleanText(hit.snippet || ''), CONTENT_W - 16);
        lines.forEach((line) => {
          layout.reserve(13);
          doc.setFillColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
          doc.circle(MARGIN + 4, layout.y + 6, 2, 'F');
          doc.text(line, MARGIN + 16, layout.y + SIZE.small);
          layout.down(13);
        });
      });
      layout.down(4);
    }
  }

  // ---- How to fix --------------------------------------------------------
  const suggestion = finding.suggestion || {};

  const hasChanges = Array.isArray(suggestion.changes) && suggestion.changes.length;
  const hasChecklist = Array.isArray(suggestion.checklist) && suggestion.checklist.length;

  // The heading, the summary paragraph and the list below it are
  // reserved as one block. Without this the heading and its summary
  // can stay behind on the previous page while the list it introduces
  // starts on the next one.
  const summaryHeight = suggestion.summary
    ? measureParagraph(doc, suggestion.summary, CONTENT_W, SIZE.body) + 10
    : 0;

  const changesHeight = hasChanges
    ? 18 + measureList(doc, suggestion.changes, CONTENT_W - 22) + 8
    : 0;

  const checklistHeight = hasChecklist
    ? 18 + measureList(doc, suggestion.checklist, CONTENT_W - 20) + 8
    : 0;

  layout.reserve(34 + summaryHeight + changesHeight + checklistHeight);

  // The "How to fix" heading carries the category's colour, so a
  // reader can find the fix section by colour when scanning a long
  // document.
  drawSubHeading(layout, 'How to fix', colors.accent, 40);

  if (suggestion.summary) {
    // The summary is what the fix boils down to, so it is given a
    // tinted panel in the category's colour rather than being left as
    // an ordinary paragraph.
    drawFixSummary(layout, suggestion.summary, colors);
  }

  if (hasChanges) {
    // The heading and the list are reserved together, so the list can
    // never end up on the next page while its heading stays behind.
    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(SIZE.small);
    doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.text('Actions to take', MARGIN, layout.y + SIZE.small);
    layout.down(16);
    drawNumberedList(layout, suggestion.changes, colors);
    layout.down(4);
  }

  if (hasChecklist) {
    doc.setFont(FONT_BOLD, 'bold');
    doc.setFontSize(SIZE.small);
    doc.setTextColor(COLOR.pass[0], COLOR.pass[1], COLOR.pass[2]);
    doc.text('Verify the fix', MARGIN, layout.y + SIZE.small);
    layout.down(16);
    drawChecklist(layout, suggestion.checklist);
    layout.down(4);
  }
  // ---- Reference implementation -----------------------------------------
  if (suggestion.before && suggestion.after) {
    // The "before" chip sits on its own row below the heading, so the
    // chip can never overlap the heading text. `keepWith` reserves room
    // for the heading, its rule and the first chip together.
    drawSubHeading(layout, 'Reference implementation', COLOR.ink, 44);

    const block = (label, code, accent) => {
      const prepared = prepareCodeLines(code);

      // The label and the code are reserved together, so the label is
      // never left alone at the bottom of a page while its code starts
      // on the next one.
      layout.reserve(14 + prepared.length * CODE_LINE_H + 16);

      // The label is printed on a coloured bar rather than as plain
      // text, so "before" (red) and "after" (green) are told apart at
      // a glance instead of by reading the words.
      doc.setFont(FONT_BOLD, 'bold');
      doc.setFontSize(SIZE.tiny);
      const chipText = cleanText(label).toUpperCase();
      const chipWidth = doc.getTextWidth(chipText) + 12;

      // The chip is drawn below the heading's rule, on a row of its
      // own. The chip's top edge is the cursor, and its text baseline
      // sits one font size below it, so the chip never reaches up
      // into the heading above.
      const chipTop = layout.y + 2;
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.roundedRect(MARGIN, chipTop, chipWidth, SIZE.tiny + 6, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(chipText, MARGIN + 6, chipTop + SIZE.tiny);

      layout.down(SIZE.tiny + 12);

      drawCodeBlock(layout, {
        lines: prepared,
        startLine: 1,
        markers: new Map(),
        note: label,
      });
      layout.down(4);
    };

    block(suggestion.beforeLabel || 'Before', suggestion.before, COLOR.fail);
    block(suggestion.afterLabel || 'After', suggestion.after, COLOR.pass);
  }

  // ---- References --------------------------------------------------------
  if (Array.isArray(suggestion.refs) && suggestion.refs.length) {
    drawSubHeading(layout, 'References', COLOR.ink);
    drawReferences(layout, suggestion.refs);
  }

  // ---- One-line remediation from the detector ---------------------------
  if (finding.remediation) {
    layout.down(6);
    layout.reserve(30);
    layout.down(2);
    doc.setFillColor(COLOR.panel[0], COLOR.panel[1], COLOR.panel[2]);
    doc.roundedRect(MARGIN, layout.y, CONTENT_W, 2, 1, 1, 'F');
    layout.down(6);
    drawParagraph(layout, finding.remediation, {
      size: SIZE.small,
      color: COLOR.muted,
      gapAfter: 6,
    });
  }

  layout.down(10);

  // ---- Separator between findings ---------------------------------------
  if (index < total - 1) {
    layout.reserve(16);
    layout.rule(MARGIN, CONTENT_W);
    layout.down(10);
  }
};

// ---------------------------------------------------------------------------
// Clean report
// ---------------------------------------------------------------------------

const drawCleanBill = (layout, meta) => {
  const doc = layout.doc;

  layout.newPage();
  drawHeading(layout, 'No issues detected', { color: COLOR.pass });

  drawParagraph(
    layout,
    'None of the ten OWASP Top 10 (2026) detectors matched a weakness pattern in this file. The categories that were checked and their results are listed below.',
    { gapAfter: 14 }
  );

  const doc2 = layout.doc;
  meta.categoryRows.forEach((row) => {
    layout.reserve(20);
    doc2.setFont(FONT_BOLD, 'bold');
    doc2.setFontSize(SIZE.small);
    doc2.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
    doc2.text(cleanText(`${row.id} · ${row.name}`), MARGIN, layout.y + SIZE.small);

    doc2.setFont(FONT_CODE, 'normal');
    doc2.setFontSize(SIZE.tiny);
    doc2.setTextColor(COLOR.codeMuted[0], COLOR.codeMuted[1], COLOR.codeMuted[2]);
    doc2.text(cleanText(row.cwe || ''), MARGIN + 190, layout.y + SIZE.small);

    doc2.setFont(FONT_BOLD, 'bold');
    doc2.setTextColor(COLOR.pass[0], COLOR.pass[1], COLOR.pass[2]);
    doc2.text('PASS', PAGE_W - MARGIN - 28, layout.y + SIZE.small);

    layout.down(6);
    layout.rule(MARGIN, CONTENT_W);
    layout.down(10);
  });
};

// ---------------------------------------------------------------------------
// Page footers
// ---------------------------------------------------------------------------

const drawFooters = (doc, meta) => {
  const total = doc.getNumberOfPages();

  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);

    const y = PAGE_H - 34;
    doc.setDrawColor(COLOR.rule[0], COLOR.rule[1], COLOR.rule[2]);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y - 12, PAGE_W - MARGIN, y - 12);

    doc.setFont(FONT_TEXT, 'normal');
    doc.setFontSize(SIZE.tiny);
    doc.setTextColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
    doc.text(cleanText(meta.fileName || 'Security report'), MARGIN, y);

    doc.text(cleanText(meta.footerRight || 'Project Eric · OWASP Scanner'), PAGE_W - MARGIN, y, {
      align: 'right',
    });

    doc.setFont(FONT_BOLD, 'bold');
    doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
    const label = `Page ${page} of ${total}`;
    doc.text(label, PAGE_W / 2, y, { align: 'center' });
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the PDF security report for a scan.
 *
 * @param {object} params
 * @param {string} params.fileName      the name of the scanned file
 * @param {string} params.languageLabel the language shown on the cover
 * @param {'code'|'sql'} params.mode    the scanner mode
 * @param {string} params.code          the scanned source code
 * @param {object} params.results       the scan result ({ score, summary, findings, ... })
 * @param {number} [params.ttlHours]    how long the stored copy survives
 * @returns {{
 *   doc: import('jspdf').jsPDF,
 *   blob: Blob,
 *   fileName: string,
 *   pageCount: number,
 *   sizeBytes: number
 * }}
 */
export const buildScanReportPdf = (params) => {
  const {
    fileName = 'scanned-snippet',
    languageLabel = 'Unknown',
    mode = 'code',
    code = '',
    results = {},
    ttlHours = 24,
  } = params || {};

  const findings = Array.isArray(results.findings) ? results.findings : [];
  const score = typeof results.score === 'number' ? results.score : 0;
  const summary = results.summary || (score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk');
  const totalIssues = typeof results.totalIssues === 'number'
    ? results.totalIssues
    : findings.reduce((sum, f) => sum + (f.count || 0), 0);

  const counts = {
    fail: findings.filter((f) => f.status === 'fail').length,
    warn: findings.filter((f) => f.status === 'warning').length,
    pass: findings.filter((f) => f.status === 'pass').length,
  };

  const now = new Date();
  const generatedAt = formatTimestamp(now);
  const expiresAt = formatTimestamp(new Date(now.getTime() + ttlHours * 3600 * 1000));

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  doc.setProperties({
    title: `OWASP Top 10 (2026) Security Report - ${fileName}`,
    subject: 'Static analysis security report',
    author: 'Project Eric OWASP Scanner',
    creator: 'Project Eric',
  });

  const layout = new Layout(doc);
  const allLines = prepareCodeLines(code);

  drawCover(layout, {
    fileName,
    languageLabel,
    mode,
    score,
    summary,
    totalIssues,
    counts,
    generatedAt,
    expiresAt,
    findings,
  });

  drawLegend(layout);

  // Only the categories that need attention are documented in detail.
  const actionable = findings.filter((f) => f.status === 'fail' || f.status === 'warning');

  if (actionable.length) {
    // The findings start on a fresh page. Continuing straight after the
    // legend left the first finding squeezed into whatever space was
    // left over, with its heading separated from its content.
    layout.newPage();
    actionable.forEach((finding, index) => {
      drawFinding(layout, finding, allLines, index, actionable.length);
    });
  } else {
    drawCleanBill(layout, {
      categoryRows: findings.map((f) => ({
        id: f.id,
        name: f.name,
        cwe: f.cwe,
      })),
    });
  }

  // A closing page for the passing categories, so the report shows the
  // full picture and not only the problems.
  const passing = findings.filter((f) => f.status === 'pass');
  if (passing.length) {
    layout.newPage();
    drawHeading(layout, 'Categories that passed', { color: COLOR.pass });
    drawParagraph(
      layout,
      'These categories were checked and no weakness pattern was found. They are listed so the report covers the whole OWASP Top 10 (2026) and not only the failures.',
      { gapAfter: 12 }
    );

    passing.forEach((f) => {
      layout.reserve(34);
      doc.setFont(FONT_BOLD, 'bold');
      doc.setFontSize(SIZE.small);
      const colors = categoryColor(f.id);
      doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
      doc.text(cleanText(`${f.id} · ${f.name}`), MARGIN, layout.y + SIZE.small);

      doc.setFont(FONT_CODE, 'normal');
      doc.setFontSize(SIZE.tiny);
      doc.setTextColor(COLOR.codeMuted[0], COLOR.codeMuted[1], COLOR.codeMuted[2]);
      doc.text(cleanText(f.cwe || ''), MARGIN + 190, layout.y + SIZE.small);

      doc.setFont(FONT_BOLD, 'bold');
      doc.setTextColor(COLOR.pass[0], COLOR.pass[1], COLOR.pass[2]);
      doc.text('PASS', PAGE_W - MARGIN - 28, layout.y + SIZE.small);

      layout.down(14);
      drawParagraph(layout, f.description || '', {
        size: SIZE.small,
        color: COLOR.muted,
        indent: 0,
        gapAfter: 8,
      });
    });
  }

  // ---- Next steps --------------------------------------------------------
  // The last page tells the reader what to do with the report: how to
  // work through the findings, and how to confirm the fixes landed.
  drawNextSteps(layout, findings, actionable);

  drawFooters(doc, { fileName });

  const pageCount = doc.getNumberOfPages();
  const blob = doc.output('blob');

  const safeName = String(fileName || 'security-report')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    doc,
    blob,
    fileName: `owasp-report-${safeName || 'security-report'}.pdf`,
    pageCount,
    sizeBytes: blob.size,
  };
};

export default buildScanReportPdf;
