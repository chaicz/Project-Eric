// test-text-sync.cjs
// ---------------------------------------------------------------------------
// Headless test of the collaborative text-sync bridge.
//
// The bug this guards against: the old bridge wrote remote changes into
// the document by *replacing the entire file*, and the echo of that
// write was then pushed back into the Y.Text. The result was a
// document that grew a duplicate copy of itself on every remote
// change, and a Y.Text whose tombstone count exploded until the room's
// persisted state reached tens of megabytes.
//
// This harness drives the REAL algorithm from
// `extensions/eric-collab/src/textSync.ts` (compiled on the fly), with
// the VS Code-specific parts stubbed.
//
// Run: node scripts/test-text-sync.cjs

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extensions', 'eric-collab');
const Y = require(path.join(EXT, 'node_modules', 'yjs'));

// --- Compile the real textSync.ts so we test production code --------------

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textsync-'));

// Resolve the TypeScript compiler directly. Shelling out to `npx.cmd`
// fails on Windows with EINVAL, because .cmd wrappers need a shell.
const tscCandidates = [
  path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
  path.join(EXT, 'node_modules', 'typescript', 'bin', 'tsc'),
];
const tscPath = tscCandidates.find((p) => fs.existsSync(p));
if (!tscPath) {
  throw new Error('TypeScript compiler not found in ' + tscCandidates.join(' or '));
}

execFileSync(
  process.execPath,
  [tscPath, path.join(EXT, 'src', 'textSync.ts'),
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'ES2022',
    '--strict'],
  { stdio: 'inherit', cwd: EXT }
);
const {
  diffHunks,
  mapRange,
  planLocalEdit,
} = require(path.join(outDir, 'textSync.js'));

// --- A minimal stand-in for a VS Code TextDocument -------------------------

class FakeDoc {
  constructor(text = '') {
    this.text = text;
    this.listeners = [];
    this.version = 0;
    /** Total characters written into the document. */
    this.writeChars = 0;
  }
  getText() { return this.text; }
  onDidChange(cb) { this.listeners.push(cb); }
  /** Emulate VS Code applying an edit and firing a change event. */
  _apply(start, deleteCount, insert) {
    const before = this.text;
    this.text = before.slice(0, start) + insert + before.slice(start + deleteCount);
    this.version++;
    this.writeChars += deleteCount + insert.length;
    for (const cb of this.listeners) {
      cb({
        document: this,
        contentChanges: [{ rangeOffset: start, rangeLength: deleteCount, text: insert }],
        version: this.version,
      });
    }
  }
}

// --- The bridge under test (mirrors collabClient.ts) ----------------------

class Bridge {
  constructor(ydoc, key, doc, { readOnly = false } = {}) {
    this.ydoc = ydoc;
    this.key = key;
    this.doc = doc;
    this.yText = ydoc.getText('doc:' + key);
    this.readOnly = readOnly;
    this.lastDocText = doc.getText();
    this.writeQueue = Promise.resolve();
    this.echoes = 0;
    this.remoteApplies = 0;

    doc.onDidChange(() => this._onDocChange());
    this.yText.observe((event, tr) => {
      if (tr.local) return;
      this.remoteApplies++;
      this._enqueueSyncDoc();
    });

    // Mirror bindDocument()'s seeding behaviour.
    if (this.yText.length > 0) {
      this._enqueueSyncDoc();
    } else if (doc.getText().length > 0) {
      this.ydoc.transact(() => {
        this.yText.insert(0, doc.getText());
      }, 'local-init');
    }
  }

  _onDocChange() {
    const current = this.doc.getText();
    const previous = this.lastDocText;
    this.lastDocText = current;

    // Already in sync — this is our own write echoing back, or a
    // remote change already applied to the Y.Text.
    if (current === this.yText.toString()) {
      this.echoes++;
      return;
    }

    if (this.readOnly) {
      this._enqueueSyncDoc();
      return;
    }

    this._applyDocChangeToY(previous, current);
  }

  _applyDocChangeToY(previousDocText, currentDocText) {
    const yContent = this.yText.toString();
    if (currentDocText === yContent) return;

    const ops = planLocalEdit(yContent, previousDocText, currentDocText);
    if (ops.length === 0) return;

    this.ydoc.transact(() => {
      // Reverse order — later ops first, so earlier offsets stay valid.
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        if (op.deleteCount > 0) this.yText.delete(op.start, op.deleteCount);
        if (op.text.length > 0) this.yText.insert(op.start, op.text);
      }
    }, 'local-edit');

    this._enqueueSyncDoc();
  }

  _enqueueSyncDoc() {
    this.writeQueue = this.writeQueue.then(() => this._syncDocNow()).catch(() => {});
  }

  async _syncDocNow() {
    const target = this.yText.toString();
    const current = this.doc.getText();
    if (current === target) return;

    const hunks = diffHunks(current, target);
    if (hunks.length === 0) return;

    // Apply the hunks back-to-front, like VS Code does.
    for (let i = hunks.length - 1; i >= 0; i--) {
      const hunk = hunks[i];
      this.doc._apply(
        hunk.aStart,
        hunk.aEnd - hunk.aStart,
        target.slice(hunk.bStart, hunk.bEnd)
      );
    }
  }

  flush() { return this.writeQueue; }
}

// --- The OLD bridge (mirrors the pre-fix collabClient.ts) -----------------
//
// Reproduced faithfully so the regression test compares against the
// real previous behaviour rather than a strawman:
//
//   • a local edit replays VS Code's raw `rangeOffset` / `rangeLength`
//     straight into the Y.Text, with no mapping onto the shared text;
//   • a remote change replaces the *entire* document with the Y.Text
//     content;
//   • the echo of that write is suppressed by a `pendingApplies`
//     counter.
//
// The counter is the weak point: VS Code coalesces the change events
// that `applyEdit` produces, so the counter can drift and the echo of
// a write ends up being replayed into the Y.Text as if it were a user
// edit. That is what made the document grow a duplicate copy of
// itself and the room state reach tens of megabytes.
//
// The document write is asynchronous, exactly like
// `vscode.workspace.applyEdit`, so the shared text is briefly ahead of
// the document — which is precisely the window in which the raw
// offset replay writes to the wrong place.

class OldBridge {
  constructor(ydoc, key, doc) {
    this.ydoc = ydoc;
    this.key = key;
    this.doc = doc;
    this.yText = ydoc.getText('doc:' + key);
    this.pendingApplies = 0;
    this.swallowed = 0;

    doc.onDidChange((e) => this._onDocChange(e));
    this.yText.observe((event, tr) => {
      if (tr.local) return;
      this._schedulePush();
    });

    if (this.yText.length > 0) {
      this._schedulePush();
    } else if (doc.getText().length > 0) {
      this.ydoc.transact(() => {
        this.yText.insert(0, doc.getText());
      }, 'local-init');
    }
  }

  _onDocChange(e) {
    // The echo of our own applyEdit is ignored — and so is any user
    // edit that happened to be batched into the same event.
    if (this.pendingApplies > 0) {
      this.pendingApplies--;
      this.swallowed++;
      return;
    }

    const sorted = [...e.contentChanges].sort(
      (a, b) => (b.rangeOffset + b.rangeLength) - (a.rangeOffset + a.rangeLength)
    );
    this.ydoc.transact(() => {
      for (const change of sorted) {
        const retain = change.rangeOffset;
        if (retain > this.yText.length) continue;
        if (change.rangeLength > 0) {
          this.yText.delete(retain, change.rangeLength);
        }
        if (change.text.length > 0) {
          this.yText.insert(retain, change.text);
        }
      }
    }, 'local-edit');
  }

  _schedulePush() {
    // vscode.workspace.applyEdit resolves asynchronously, so the
    // shared text leads the document for a moment.
    setTimeout(() => {
      const yContent = this.yText.toString();
      if (yContent === this.doc.getText()) return;
      this.pendingApplies++;
      this.doc._apply(0, this.doc.getText().length, yContent);
    }, 0);
  }

  settle() {
    return new Promise((r) => setTimeout(r, 30));
  }
}

// --- Assertions ------------------------------------------------------------

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log('  PASS  ' + name);
  } else {
    failures++;
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function section(title) {
  console.log('\n' + title);
  console.log('-'.repeat(title.length));
}

async function main() {

section('1. Local edit reaches the Y.Text');
{
  const ydoc = new Y.Doc();
  const doc = new FakeDoc('const a = 1;\n');
  const bridge = new Bridge(ydoc, 'k1', doc);
  // The '1' lives at offset 10 in "const a = 1;\n".
  doc._apply(10, 1, '2');
  check('Y.Text received the edit', ydoc.getText('doc:k1').toString() === 'const a = 2;\n',
    JSON.stringify(ydoc.getText('doc:k1').toString()));
  check('document unchanged by the round trip', doc.getText() === 'const a = 2;\n');
  check('the edit was not echoed back', bridge.echoes === 0);
}

section('2. Remote edit propagates to the document');
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  docA.on('update', (u) => Y.applyUpdate(docB, u));
  docB.on('update', (u) => Y.applyUpdate(docA, u));

  const fileA = new FakeDoc('hello world\n');
  const fileB = new FakeDoc('hello world\n');
  new Bridge(docA, 'k', fileA);
  new Bridge(docB, 'k', fileB);
  await new Promise((r) => setTimeout(r, 20));

  fileA._apply(11, 0, '!');
  await new Promise((r) => setTimeout(r, 20));

  check('guest document shows the host edit', fileB.getText() === 'hello world!\n',
    JSON.stringify(fileB.getText()));
  check('shared text is consistent', docB.getText('doc:k').toString() === 'hello world!\n',
    JSON.stringify(docB.getText('doc:k').toString()));
  check('no content drift', fileA.getText() === docA.getText('doc:k').toString());
}

section('3. Remote edits do not duplicate the document (the original bug)');
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  docA.on('update', (u) => Y.applyUpdate(docB, u));
  docB.on('update', (u) => Y.applyUpdate(docA, u));

  const original = 'line one\nline two\nline three\n';
  const fileA = new FakeDoc(original);
  const fileB = new FakeDoc(original);
  new Bridge(docA, 'k', fileA);
  new Bridge(docB, 'k', fileB);
  await new Promise((r) => setTimeout(r, 20));

  // The host appends 50 lines, one remote change at a time.
  for (let i = 0; i < 50; i++) {
    fileA._apply(fileA.getText().length, 0, 'appended ' + i + '\n');
    await new Promise((r) => setTimeout(r, 2));
  }
  await new Promise((r) => setTimeout(r, 50));

  const expected = original + Array.from({ length: 50 }, (_, i) => 'appended ' + i + '\n').join('');
  check('guest document has exactly the expected content', fileB.getText() === expected,
    'length ' + fileB.getText().length + ' vs expected ' + expected.length);
  check('guest document did not grow beyond the expected size',
    fileB.getText().length === expected.length);
  check('no duplicated tail', !fileB.getText().includes('line three\nline three'));
  check('host document matches the shared text',
    fileA.getText() === docA.getText('doc:k').toString());
}

section('4. The room state does not grow with the number of remote changes');
{
  // The room's persisted size is what actually blew up: every remote
  // change used to be pushed into the document by replacing the whole
  // file, and the echo of that write was replayed back into the
  // Y.Text — a full delete plus a full re-insert. The tombstone count
  // and the encoded state therefore grew by one copy of the file per
  // remote change, until the persisted room reached tens of megabytes.
  const base = Array.from({ length: 40 }, (_, i) => 'line ' + i).join('\n') + '\n';
  // The old bridge's growth is exponential (every round roughly doubles
  // the shared text), so it is compared over a handful of edits; the
  // new bridge is additionally checked over a long run.
  const EDITS = 12;

  function tombstoneCount(ydoc) {
    let n = 0;
    // In this Yjs version `store.clients` maps a client id straight to
    // that client's array of structs.
    ydoc.store.clients.forEach((structs) => {
      for (const s of structs) {
        if (s.deleted === true) n += s.length;
        else if (Array.isArray(s.deleted)) n += s.deleted.filter(Boolean).length;
      }
    });
    return n;
  }

  /** The peer keeps appending lines; the local side receives them. */
  async function runScenario(makeBridge, edits) {
    const peerY = new Y.Doc();
    const localY = new Y.Doc();
    peerY.on('update', (u) => Y.applyUpdate(localY, u));
    localY.on('update', (u) => Y.applyUpdate(peerY, u));

    const peerDoc = new FakeDoc(base);
    const localDoc = new FakeDoc(base);
    const peerBridge = makeBridge(peerY, 'k', peerDoc);
    const localBridge = makeBridge(localY, 'k', localDoc);

    for (let i = 0; i < edits; i++) {
      peerDoc._apply(peerDoc.getText().length, 0, 'appended ' + i + '\n');
      await new Promise((r) => setTimeout(r, 2));
    }
    await new Promise((r) => setTimeout(r, 80));

    const expected =
      base + Array.from({ length: edits }, (_, i) => 'appended ' + i + '\n').join('');

    return {
      stateBytes: Buffer.byteLength(Y.encodeStateAsUpdate(localY)),
      tombstones: tombstoneCount(localY),
      sharedLength: localY.getText('doc:k').length,
      docText: localDoc.getText(),
      writeChars: localDoc.writeChars,
      expected,
      contentBytes: Buffer.byteLength(expected),
    };
  }

  const oldResult = await runScenario((y, k, d) => new OldBridge(y, k, d), EDITS);
  const newResult = await runScenario((y, k, d) => new Bridge(y, k, d), EDITS);
  const longResult = await runScenario((y, k, d) => new Bridge(y, k, d), 60);

  console.log('    old bridge: state bytes ' + oldResult.stateBytes +
    ', tombstones ' + oldResult.tombstones +
    ', shared length ' + oldResult.sharedLength +
    ' (content is ' + oldResult.expected.length + ')' +
    ', document rewrites ' + oldResult.writeChars + ' chars');
  console.log('    new bridge: state bytes ' + newResult.stateBytes +
    ', tombstones ' + newResult.tombstones +
    ', shared length ' + newResult.sharedLength +
    ' (content is ' + newResult.expected.length + ')' +
    ', document rewrites ' + newResult.writeChars + ' chars');
  console.log('    new bridge, 60 edits: state bytes ' + longResult.stateBytes +
    ', tombstones ' + longResult.tombstones);

  check('the new bridge keeps the visible content correct',
    newResult.docText === newResult.expected,
    'length ' + newResult.docText.length + ' vs expected ' + newResult.expected.length);
  check('the new bridge does not duplicate the content',
    newResult.sharedLength === newResult.expected.length,
    newResult.sharedLength + ' vs ' + newResult.expected.length);
  check('the new bridge leaves no tombstones behind',
    newResult.tombstones === 0, String(newResult.tombstones));
  check('the new bridge rewrites far less of the document',
    newResult.writeChars < oldResult.writeChars / 4,
    newResult.writeChars + ' vs ' + oldResult.writeChars);
  check('the new bridge state stays close to the content size',
    newResult.stateBytes < newResult.contentBytes * 3,
    newResult.stateBytes + ' vs content ' + newResult.contentBytes);

  // 60 remote edits must cost roughly what 12 did — linear in the
  // content, not exponential in the number of edits.
  check('the room state grows linearly with the number of edits',
    longResult.stateBytes < newResult.stateBytes * 3,
    longResult.stateBytes + ' vs ' + newResult.stateBytes);
  check('60 remote edits leave the content intact',
    longResult.docText === longResult.expected,
    'length ' + longResult.docText.length + ' vs expected ' + longResult.expected.length);
  check('60 remote edits leave no tombstones behind',
    longResult.tombstones === 0, String(longResult.tombstones));
}

section('5. Viewer edits are reverted, not published');
{
  const ydoc = new Y.Doc();
  const doc = new FakeDoc('shared content\n');
  const bridge = new Bridge(ydoc, 'k', doc, { readOnly: true });
  await bridge.flush();
  doc._apply(0, 0, 'nope ');
  await bridge.flush();
  check('viewer edit was reverted', doc.getText() === 'shared content\n',
    JSON.stringify(doc.getText()));
  check('viewer edit never reached the shared text',
    ydoc.getText('doc:k').toString() === 'shared content\n',
    JSON.stringify(ydoc.getText('doc:k').toString()));
}

section('6. Concurrent edits at different positions both survive');
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  docA.on('update', (u) => Y.applyUpdate(docB, u));
  docB.on('update', (u) => Y.applyUpdate(docA, u));

  const base = 'AAAA\nBBBB\nCCCC\n';
  const fileA = new FakeDoc(base);
  const fileB = new FakeDoc(base);
  new Bridge(docA, 'k', fileA);
  new Bridge(docB, 'k', fileB);
  await new Promise((r) => setTimeout(r, 20));

  // Both edit different lines at the same time.
  fileA._apply(0, 0, 'host: ');
  fileB._apply(10, 0, 'guest: ');
  await new Promise((r) => setTimeout(r, 50));

  const text = docA.getText('doc:k').toString();
  check('host edit survived', text.includes('host: '), JSON.stringify(text));
  check('guest edit survived', text.includes('guest: '), JSON.stringify(text));
  check('shared text has no duplication', (text.match(/AAAA/g) || []).length === 1, JSON.stringify(text));
  check('shared text has no duplication of BBBB', (text.match(/BBBB/g) || []).length === 1, JSON.stringify(text));
}

section('7. diffHunks / mapRange behave correctly');
{
  const hunks = diffHunks('hello world', 'hello brave world');
  check('diffHunks found one hunk', hunks.length === 1, JSON.stringify(hunks));
  check('hunk points at the insertion', hunks[0].aStart === 6 && hunks[0].aEnd === 6,
    JSON.stringify(hunks[0]));
  check('hunk carries the inserted text',
    'hello brave world'.slice(hunks[0].bStart, hunks[0].bEnd) === 'brave ',
    JSON.stringify(hunks[0]));

  // A replacement must keep the replacement text — a hunk that lost
  // it would delete the character without inserting the new one.
  const replaced = diffHunks('const a = 1;\n', 'const a = 2;\n');
  check('a replacement yields one hunk', replaced.length === 1, JSON.stringify(replaced));
  check('the replacement hunk carries the new character',
    'const a = 2;\n'.slice(replaced[0].bStart, replaced[0].bEnd) === '2',
    JSON.stringify(replaced[0]));

  // A range after a remote insertion is shifted by the inserted text.
  const inserted = [{ aStart: 0, aEnd: 0, bStart: 0, bEnd: 5 }];
  const shifted = mapRange(inserted, 10, 10);
  check('a range after an insertion is shifted',
    shifted.start === 15 && shifted.end === 15,
    JSON.stringify(shifted));

  // A range that starts exactly at the insertion point steps over the
  // inserted text instead of swallowing it.
  const atBoundary = mapRange(inserted, 0, 1);
  check('a range starting at the insertion point steps over it',
    atBoundary.start === 5 && atBoundary.end === 6,
    JSON.stringify(atBoundary));

  // A pure insertion at the same point is placed after the inserted
  // text — the deterministic tie-break for two edits at one spot.
  const endsAt = mapRange(inserted, 0, 0);
  check('an insertion at the insertion point is placed after it',
    endsAt.start === 5 && endsAt.end === 5,
    JSON.stringify(endsAt));

  // A range that ends at the insertion point leaves the inserted text
  // alone.
  const later = [{ aStart: 5, aEnd: 5, bStart: 5, bEnd: 10 }];
  const beforeIt = mapRange(later, 0, 5);
  check('a range ending at the insertion point is untouched',
    beforeIt.start === 0 && beforeIt.end === 5,
    JSON.stringify(beforeIt));

  check('mapRange is identity with no hunks',
    JSON.stringify(mapRange([], 10, 12)) === JSON.stringify({ start: 10, end: 12 }));
}

section('8. planLocalEdit maps a local edit onto a drifted shared text');
{
  // The shared text already received a remote insertion at the top.
  const yContent = 'REMOTE:AAAA\nBBBB\n';
  const previous = 'AAAA\nBBBB\n';
  const current = 'AAAA\nBBBB\n'; // no local change
  check('no local change produces no ops',
    planLocalEdit(yContent, previous, current).length === 0);

  // A local edit at the bottom, with a remote insertion at the top.
  const current2 = 'AAAA\nBBBB\nLOCAL\n';
  const ops = planLocalEdit(yContent, previous, current2);
  check('a local edit produces ops', ops.length > 0, JSON.stringify(ops));
  const applied = ops.slice().reverse().reduce(
    (acc, op) => acc.slice(0, op.start) + op.text + acc.slice(op.start + op.deleteCount),
    yContent
  );
  check('the remote insertion is preserved', applied.includes('REMOTE:AAAA'), JSON.stringify(applied));
  check('the local edit is applied', applied.includes('LOCAL'), JSON.stringify(applied));
}

section('9. A local edit made while a remote change is in flight');
{
  // The shared text has already received the host's change, but the
  // document has not — the write is still in flight. The local user
  // types into the document in that window.
  //
  // The old bridge replayed the document offset straight into the
  // shared text, so the character landed in the wrong place. The new
  // bridge maps the edit through the diff between the document and
  // the shared text, so both edits survive.
  const base = 'base text\n';
  const remoteHead = 'HOST\n';

  const oldY = new Y.Doc();
  const oldDoc = new FakeDoc(base);
  const oldBridge = new OldBridge(oldY, 'k', oldDoc);
  // Put the shared text ahead of the document, as it is while the
  // remote write is still in flight: the host inserted a line at the
  // top, the document has not received it yet.
  oldY.transact(() => { oldY.getText('doc:k').insert(0, remoteHead); }, 'remote');
  oldDoc._apply(base.length, 0, 'X');
  await oldBridge.settle();

  const newY = new Y.Doc();
  const newDoc = new FakeDoc(base);
  const newBridge = new Bridge(newY, 'k', newDoc);
  newY.transact(() => { newY.getText('doc:k').insert(0, remoteHead); }, 'remote');
  newDoc._apply(base.length, 0, 'X');
  await newBridge.flush();
  await new Promise((r) => setTimeout(r, 20));

  const remote = remoteHead + base;

  console.log('    old bridge shared text: ' + JSON.stringify(oldY.getText('doc:k').toString()));
  console.log('    new bridge shared text: ' + JSON.stringify(newY.getText('doc:k').toString()));

  check('the old bridge put the character in the wrong place',
    oldY.getText('doc:k').toString() !== remote + 'X',
    JSON.stringify(oldY.getText('doc:k').toString()));
  check('the new bridge kept the host change',
    newY.getText('doc:k').toString().startsWith('HOST\n'),
    JSON.stringify(newY.getText('doc:k').toString()));
  check('the new bridge kept the local character',
    newY.getText('doc:k').toString().endsWith('X'),
    JSON.stringify(newY.getText('doc:k').toString()));
  check('the new bridge kept the original text intact',
    newY.getText('doc:k').toString() === remote + 'X',
    JSON.stringify(newY.getText('doc:k').toString()));
  check('the new bridge converged the document with the shared text',
    newDoc.getText() === newY.getText('doc:k').toString(),
    JSON.stringify(newDoc.getText()));
}

section('10. diffHunks is consistent for random inputs (fuzz)');
{
  // The property that matters: applying the hunks to `a` must
  // reproduce `b` exactly. A single mismatched hunk means a character
  // is silently dropped or duplicated in the editor.
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const alphabet = 'abc \n';
  const randomText = (maxLen) => {
    const len = Math.floor(rnd() * maxLen);
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    return s;
  };

  let mismatches = 0;
  let checked = 0;
  for (let i = 0; i < 3000; i++) {
    const a = randomText(40);
    const b = randomText(40);
    const hunks = diffHunks(a, b);

    // Apply the hunks to `a`, back to front.
    let out = a;
    for (let h = hunks.length - 1; h >= 0; h--) {
      const hunk = hunks[h];
      out = out.slice(0, hunk.aStart) + b.slice(hunk.bStart, hunk.bEnd) +
        out.slice(hunk.aEnd);
    }
    checked++;
    if (out !== b) {
      if (mismatches === 0) {
        console.log('    first mismatch: a=' + JSON.stringify(a) +
          ' b=' + JSON.stringify(b) + ' hunks=' + JSON.stringify(hunks));
      }
      mismatches++;
    }
  }
  check('every diff reproduces the target text', mismatches === 0,
    mismatches + ' of ' + checked + ' pairs mismatched');
  check('the fuzz run actually exercised the diff', checked === 3000, String(checked));
}

section('11. planLocalEdit is consistent for random inputs (fuzz)');
{
  let seed = 987654;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const alphabet = 'abc \n';
  const randomText = (maxLen) => {
    const len = Math.floor(rnd() * maxLen);
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    return s;
  };
  /** A realistic edit: replace a few characters somewhere. */
  const randomEdit = (text) => {
    const pos = Math.floor(rnd() * (text.length + 1));
    const len = Math.min(text.length - pos, Math.floor(rnd() * 4));
    return text.slice(0, pos) + randomText(3) + text.slice(pos + len);
  };

  let inSyncFailures = 0;
  let divergedFailures = 0;
  let checked = 0;
  for (let i = 0; i < 2000; i++) {
    const previous = randomText(30);
    const current = randomEdit(previous);

    // (a) The shared text is exactly what the document held before
    //     the edit. The planned edit must turn it into the document's
    //     new content, exactly.
    const ops = planLocalEdit(previous, previous, current);
    let out = previous;
    for (let k = ops.length - 1; k >= 0; k--) {
      const op = ops[k];
      out = out.slice(0, op.start) + op.text + out.slice(op.start + op.deleteCount);
    }
    checked++;
    if (out !== current) {
      if (inSyncFailures === 0) {
        console.log('    first in-sync mismatch: previous=' + JSON.stringify(previous) +
          ' current=' + JSON.stringify(current) + ' ops=' + JSON.stringify(ops) +
          ' out=' + JSON.stringify(out));
      }
      inSyncFailures++;
    }

    // (b) A remote change has landed in the shared text but not in
    //     the document yet. Neither the remote change nor the local
    //     edit may be lost.
    //
    //     The remote insertion is placed away from the local edit —
    //     when the two overlap, the local edit legitimately takes over
    //     the overlapping region, which is a conflict resolution
    //     rather than a bug.
    const remoteMark = '<<remote>>';
    const localMark = '<<local>>';

    // The local edit: insert a marker at a random position.
    const localAt = Math.floor(rnd() * (previous.length + 1));
    const currentWithMark =
      previous.slice(0, localAt) + localMark + previous.slice(localAt);

    // Positions covered by the local edit — the remote insertion must
    // avoid them.
    const covered = new Set();
    for (const hunk of diffHunks(previous, currentWithMark)) {
      for (let p = hunk.aStart; p <= hunk.aEnd; p++) covered.add(p);
    }
    const free = [];
    for (let p = 0; p <= previous.length; p++) if (!covered.has(p)) free.push(p);
    if (free.length === 0) continue;

    const remoteAt = free[Math.floor(rnd() * free.length)];
    const drifted = previous.slice(0, remoteAt) + remoteMark + previous.slice(remoteAt);

    const ops2 = planLocalEdit(drifted, previous, currentWithMark);
    let out2 = drifted;
    for (let k = ops2.length - 1; k >= 0; k--) {
      const op = ops2[k];
      out2 = out2.slice(0, op.start) + op.text + out2.slice(op.start + op.deleteCount);
    }
    checked++;
    if (!out2.includes(remoteMark) || !out2.includes(localMark)) {
      if (divergedFailures === 0) {
        console.log('    first diverged mismatch: previous=' + JSON.stringify(previous) +
          ' localAt=' + localAt + ' remoteAt=' + remoteAt +
          ' ops=' + JSON.stringify(ops2) + ' out=' + JSON.stringify(out2));
      }
      divergedFailures++;
    }
  }
  check('an edit on an in-sync shared text reproduces the document exactly',
    inSyncFailures === 0, inSyncFailures + ' of ' + checked + ' edits wrong');
  check('an edit on a drifted shared text keeps both changes',
    divergedFailures === 0, divergedFailures + ' of ' + checked + ' edits wrong');
  check('the fuzz run actually exercised the planner', checked > 3500, String(checked));
}

console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log('ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log(failures + ' TEST(S) FAILED');
  process.exit(1);
}

}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
