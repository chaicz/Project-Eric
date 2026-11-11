#!/usr/bin/env node
// Repairs persisted Yjs room state that still contains the pre-fix
// "duplicated document content" garbage.
//
// Before commit 135c228 the Eric Collab bridge replaced the whole document
// when applying a remote change and then replayed that write back into the
// Y.Text. Every remote change therefore appended another copy of the file to
// the shared text, and the room's persisted state grew until it was tens of
// megabytes. The bridge is fixed, but rooms that were corrupted keep their
// bloated Y.Text on disk and would push it straight back into the editor the
// next time the room is opened.
//
// For each persisted room this script rewrites the shared text of every
// document that has a counterpart on disk, so the room matches the file the
// user actually sees. Text that was bloated is replaced by the on-disk
// content; the deleted spans are garbage-collected when the room is
// re-encoded, so the room file shrinks back to its real size.
//
//   node scripts/repair-collaboration-state.cjs            -> report only
//   node scripts/repair-collaboration-state.cjs --write    -> repair on disk

const fs = require('fs');
const path = require('path');
const Y = require('yjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, '.yjs-data');
const WORKSPACE = 'C:\\Users\\Public\\project-eric-ide';
const WRITE = process.argv.includes('--write');

/** `doc:file:///c%3A/Users/...` -> `C:\Users\...` */
function docKeyToPath(key) {
  if (!key.startsWith('doc:file:///')) return null;
  let uri = 'file:///' + key.slice('doc:'.length + 'file:///'.length);
  try {
    uri = decodeURIComponent(uri);
  } catch {
    /* keep the raw form */
  }
  if (!/^file:\/\/\/[A-Za-z]:/.test(uri)) return null;
  return decodeURIComponent(uri.slice('file:///'.length)).replace(/\//g, '\\');
}

function readRoom(file) {
  const raw = fs.readFileSync(file);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(raw));
  return doc;
}

if (!fs.existsSync(DATA_DIR)) {
  console.log('no data dir at ' + DATA_DIR);
  process.exit(0);
}

const rooms = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith('.bin'))
  .map((f) => path.join(DATA_DIR, f));

let changedRooms = 0;
for (const room of rooms) {
  const before = fs.statSync(room).size;
  let doc;
  try {
    doc = readRoom(room);
  } catch (e) {
    console.log('skip ' + path.basename(room) + ' (unreadable: ' + e.message + ')');
    continue;
  }

  const edits = [];
  for (const key of doc.share.keys()) {
    if (!key.startsWith('doc:')) continue;
    const filePath = docKeyToPath(key);
    if (!filePath || !fs.existsSync(filePath)) continue;

    const text = doc.getText(key);
    const current = text.toString();
    const onDisk = fs.readFileSync(filePath, 'utf8');
    if (current === onDisk) continue;

    const isRepeat = current.length > onDisk.length && current === onDisk.repeat(
      Math.ceil(current.length / Math.max(onDisk.length, 1)),
    );
    if (!isRepeat) continue;
    edits.push({ key, text, current, onDisk, isRepeat });
  }

  if (edits.length === 0) continue;

  console.log(
    path.basename(room) +
      ': ' +
      (before / 1048576).toFixed(1) +
      'MB, ' +
      edits.length +
      ' doc(s) to repair',
  );
  for (const e of edits) {
    console.log(
      '   ' +
        e.key.split('/').pop() +
        '  ' +
        e.current.length +
        ' chars in room vs ' +
        e.onDisk.length +
        ' on disk' +
        (e.isRepeat ? '  (duplicated content)' : ''),
    );
  }

  if (!WRITE) continue;

  doc.transact(() => {
    for (const e of edits) {
      if (e.text.length > 0) e.text.delete(0, e.text.length);
      if (e.onDisk.length > 0) e.text.insert(0, e.onDisk);
    }
  });

  const state = Y.encodeStateAsUpdate(doc);
  fs.writeFileSync(room, Buffer.from(state));
  const after = fs.statSync(room).size;
  console.log(
    '   repaired: ' +
      (before / 1048576).toFixed(1) +
      'MB -> ' +
      (after / 1048576).toFixed(1) +
      'MB',
  );
  changedRooms++;
}

console.log(
  '\n' +
    (WRITE ? 'repaired ' : 'would repair ') +
    changedRooms +
    ' room(s).' +
    (WRITE ? '' : ' Re-run with --write to apply.'),
);
