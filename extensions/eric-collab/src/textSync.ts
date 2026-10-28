// textSync.ts
// ---------------------------------------------------------------------------
// Helpers for keeping a VS Code TextDocument and a Y.Text in sync.
//
// The collaboration bridge has to translate between two very different
// representations of "the same text":
//
//   • a Y.Text, whose changes arrive as CRDT deltas (retain / insert /
//     delete), and
//   • a VS Code TextDocument, whose changes arrive as offset/length edits
//     relative to the document state *before* the change.
//
// Offsets are only meaningful when both sides hold exactly the same
// content. Once they drift apart, replaying a document offset against a
// Y.Text writes the wrong region — and because the wrong region is
// usually "the whole file", that is how a single mismatch turns into a
// document that contains thousands of copies of itself.
//
// The helpers below work from *content* rather than from raw positions:
//
//   • `diffHunks` finds the regions where two texts differ.
//   • `mapRange` translates a range in one text into the
//     corresponding range in another, using those hunks.
//
// That is what lets a local edit be applied to a Y.Text that has already
// received a remote change: the edit is expressed relative to the text
// the user was looking at, and then mapped onto the Y.Text's current
// content. Applying it verbatim would either land in the wrong place or
// silently discard the remote change.

/**
 * A region where two texts differ.
 *
 * `a[aStart, aEnd)` is replaced by `b[bStart, bEnd)`.
 */
export interface DiffHunk {
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

/**
 * Find the regions in which two texts differ.
 *
 * The common prefix and suffix are stripped first, so the expensive part
 * only ever runs over the region that actually changed. The remainder is
 * compared with a longest-common-subsequence pass, which yields the
 * smallest possible set of hunks.
 *
 * @param a The original text.
 * @param b The text it should become.
 */
export function diffHunks(a: string, b: string): DiffHunk[] {
  // Trim the common prefix.
  let prefix = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (
    prefix < maxPrefix &&
    a.charCodeAt(prefix) === b.charCodeAt(prefix)
  ) {
    prefix++;
  }

  // Trim the common suffix, without overlapping the prefix.
  const maxSuffix = Math.min(a.length - prefix, b.length - prefix);
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    a.charCodeAt(a.length - 1 - suffix) === b.charCodeAt(b.length - 1 - suffix)
  ) {
    suffix++;
  }

  const aMid = a.slice(prefix, a.length - suffix);
  const bMid = b.slice(prefix, b.length - suffix);

  if (aMid.length === 0 && bMid.length === 0) return [];

  // One side is empty — a single insert or delete.
  if (aMid.length === 0) {
    return [{
      aStart: prefix,
      aEnd: prefix,
      bStart: prefix,
      bEnd: prefix + bMid.length,
    }];
  }
  if (bMid.length === 0) {
    return [{
      aStart: prefix,
      aEnd: prefix + aMid.length,
      bStart: prefix,
      bEnd: prefix,
    }];
  }

  const n = aMid.length;
  const m = bMid.length;

  // Guard the quadratic LCS pass. The trimmed middle is small for
  // ordinary edits; when it isn't (two completely unrelated large
  // texts), fall back to a single replace hunk, which is still correct
  // — just less precise.
  const MAX_CELLS = 1_000_000;
  if (n * m > MAX_CELLS) {
    return [{
      aStart: prefix,
      aEnd: prefix + n,
      bStart: prefix,
      bEnd: prefix + m,
    }];
  }

  // dp[i * width + j] = length of the LCS of aMid[i..] and bMid[j..].
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        aMid[i] === bMid[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  // Walk the LCS, grouping consecutive deletions/insertions into a
  // single replace hunk.
  const hunks: DiffHunk[] = [];
  let i = 0;
  let j = 0;
  let pendingAStart = -1;
  let pendingBStart = -1;

  const flush = (aEnd: number, bEnd: number) => {
    if (pendingAStart < 0) return;
    hunks.push({
      aStart: pendingAStart,
      aEnd,
      bStart: pendingBStart,
      bEnd,
    });
    pendingAStart = -1;
    pendingBStart = -1;
  };

  while (i < n && j < m) {
    if (aMid[i] === bMid[j]) {
      flush(prefix + i, prefix + j);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      // `a` has an extra character here.
      if (pendingAStart < 0) {
        pendingAStart = prefix + i;
        pendingBStart = prefix + j;
      }
      i++;
    } else {
      // `b` has an extra character here.
      if (pendingAStart < 0) {
        pendingAStart = prefix + i;
        pendingBStart = prefix + j;
      }
      j++;
    }
  }

  // The walk stops as soon as one side is exhausted, so whatever is
  // left in either middle is part of the difference and has to be
  // included in the final hunk. Without this the replacement text of
  // the last hunk would be truncated — turning "1" into "2" into a
  // hunk that *deletes* the "1" and inserts nothing.
  if (pendingAStart >= 0) {
    // A difference is still open: it spans the rest of both middles.
    hunks.push({
      aStart: pendingAStart,
      aEnd: prefix + n,
      bStart: pendingBStart,
      bEnd: prefix + m,
    });
    pendingAStart = -1;
    pendingBStart = -1;
  } else if (i < n || j < m) {
    // The last difference was closed by a match, but text remains on
    // one side — that remainder is a pure insertion or deletion.
    hunks.push({
      aStart: prefix + i,
      aEnd: prefix + n,
      bStart: prefix + j,
      bEnd: prefix + m,
    });
  }

  return hunks;
}

/**
 * Translate a range in `a` into the corresponding range in `b`.
 *
 * The `hunks` must be the diff between `a` and `b`.
 *
 * A range is mapped as a whole rather than as two independent points,
 * and that distinction matters at the boundary of a remote insertion.
 * Text a peer inserted exactly at the start of a local edit belongs to
 * the peer, so the local edit steps over it instead of swallowing it;
 * text inserted exactly at the end survives as well. Mapping the two
 * ends separately would let the local edit consume the peer's text.
 *
 * @param aStart Start of the range in `a`.
 * @param aEnd End of the range in `a`.
 * @returns The corresponding range in `b`.
 */
export function mapRange(
  hunks: readonly DiffHunk[],
  aStart: number,
  aEnd: number
): { start: number; end: number } {
  let start = aStart;
  let end = aEnd;

  for (const hunk of hunks) {
    if (hunk.aStart === hunk.aEnd) {
      // A pure insertion in `b`.
      const len = hunk.bEnd - hunk.bStart;
      if (hunk.aStart <= start) {
        // The insertion sits at or before the start of the range — the
        // range's content sits after it, so step over it.
        start += len;
        end += len;
      } else if (hunk.aStart < end) {
        // The insertion sits inside the range — the range grows to
        // cover it.
        end += len;
      }
      continue;
    }

    // A replaced (or deleted) region.
    const delta = (hunk.bEnd - hunk.bStart) - (hunk.aEnd - hunk.aStart);
    if (hunk.aEnd <= start) {
      // Entirely before the range.
      start += delta;
      end += delta;
      continue;
    }
    if (hunk.aStart >= end) {
      // Entirely after the range.
      continue;
    }
    // The remote change overlaps the local edit. Both cannot be kept:
    // the local edit takes over the overlapping region.
    start = Math.min(start, hunk.bStart);
    end = Math.max(end, hunk.bEnd);
  }

  return { start, end };
}

/**
 * A single edit to apply to a buffer: remove `deleteCount` characters
 * at `start` and insert `text` there.
 */
export interface EditOp {
  start: number;
  deleteCount: number;
  text: string;
}

/**
 * Apply a set of edit operations to a string.
 *
 * The operations are applied from last to first, so that each
 * operation's offsets remain valid while the earlier ones are applied.
 */
export function applyOpsToString(
  text: string,
  ops: readonly EditOp[]
): string {
  let result = text;
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    result =
      result.slice(0, op.start) +
      op.text +
      result.slice(op.start + op.deleteCount);
  }
  return result;
}

/**
 * Compute the changes that must be applied to the shared text so that
 * it reflects a local document edit.
 *
 * This is the heart of the collaboration bridge. The local edit is
 * expressed as a diff between the document content before the edit and
 * after it. The shared text, however, may already have received a
 * remote change that the document has not caught up with yet — so the
 * edit's offsets are relative to a version of the document that no
 * longer matches the shared text.
 *
 * The edit is therefore *mapped* through the diff between the
 * pre-edit document and the shared text before it is applied. That
 * keeps a remote edit made elsewhere in the file intact, instead of
 * overwriting it with a whole-text replacement.
 *
 * @param yContent The shared text's current content.
 * @param previousDocText The document content before the local edit.
 * @param currentDocText The document content after the local edit.
 * @returns Edit operations in `yContent` coordinates. An empty array
 *          means the shared text already reflects the edit.
 */
export function planLocalEdit(
  yContent: string,
  previousDocText: string,
  currentDocText: string
): EditOp[] {
  if (currentDocText === previousDocText) return [];

  const localHunks = diffHunks(previousDocText, currentDocText);
  if (localHunks.length === 0) return [];

  // What changed in the shared text since the document was last in
  // sync with it.
  const remoteHunks = diffHunks(previousDocText, yContent);

  // Express the local edit in shared-text coordinates, keeping the
  // replacement text that the diff produced.
  const mapped: EditOp[] = localHunks.map((hunk) => {
    const range = mapRange(remoteHunks, hunk.aStart, hunk.aEnd);
    return {
      start: range.start,
      deleteCount: Math.max(0, range.end - range.start),
      text: currentDocText.slice(hunk.bStart, hunk.bEnd),
    };
  });

  // Compute the resulting shared-text content and diff it against the
  // current content. Going through the content means an edit that is
  // already present (because the shared text was updated first) turns
  // into a no-op instead of a redundant delete-and-insert — which
  // would otherwise grow the CRDT history on every keystroke.
  const desired = applyOpsToString(yContent, mapped);
  if (desired === yContent) return [];

  return diffHunks(yContent, desired).map((hunk) => ({
    start: hunk.aStart,
    deleteCount: hunk.aEnd - hunk.aStart,
    text: desired.slice(hunk.bStart, hunk.bEnd),
  }));
}
