// test-text-diff.cjs
// ---------------------------------------------------------------------------
// Checks the browser-side diff helper (`src/utils/textDiff.js`) against
// the extension-side one (`extensions/eric-collab/src/textSync.ts`).
//
// The two files are deliberate copies of each other — the web app
// cannot import from `extensions/`, so the helper exists twice. This
// harness makes sure they do not drift apart, and that both of them
// satisfy the properties the collaboration bridge depends on:
//
//   1. a diff reproduces the target text exactly;
//   2. a local edit on an in-sync shared text reproduces the document
//      exactly;
//   3. a local edit on a shared text that has drifted keeps both the
//      remote change and the local edit.
//
// Run: node scripts/test-text-diff.cjs

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extensions', 'eric-collab');

// --- The extension implementation (compiled from TypeScript) -------------

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textdiff-'));
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
const ext = require(path.join(outDir, 'textSync.js'));

// --- The web implementation -----------------------------------------------

async function loadWeb() {
  const url = pathToFileURL(path.join(ROOT, 'src', 'utils', 'textDiff.js')).href;
  return import(url);
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

/** Apply a set of ops to a string, back to front. */
function applyOps(text, ops) {
  let out = text;
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    out = out.slice(0, op.start) + op.text + out.slice(op.start + op.deleteCount);
  }
  return out;
}

function makeRandom(seedRef) {
  return () => {
    seedRef.value = (seedRef.value * 1103515245 + 12345) & 0x7fffffff;
    return seedRef.value / 0x7fffffff;
  };
}

async function main() {
  const web = await loadWeb();

  section('1. The two implementations expose the same API');
  {
    for (const name of ['diffHunks', 'mapRange', 'planLocalEdit']) {
      check('the web module exports ' + name, typeof web[name] === 'function');
      check('the extension module exports ' + name, typeof ext[name] === 'function');
    }
  }

  section('2. Both implementations agree on every diff (parity)');
  {
    const seed = { value: 4242 };
    const rnd = makeRandom(seed);
    const alphabet = 'abc \n';
    const randomText = (maxLen) => {
      const len = Math.floor(rnd() * maxLen);
      let s = '';
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      return s;
    };

    let mismatches = 0;
    let brokenWeb = 0;
    let brokenExt = 0;
    const samples = 4000;
    for (let i = 0; i < samples; i++) {
      const a = randomText(40);
      const b = randomText(40);

      const webHunks = web.diffHunks(a, b);
      const extHunks = ext.diffHunks(a, b);
      if (JSON.stringify(webHunks) !== JSON.stringify(extHunks)) {
        if (mismatches === 0) {
          console.log('    first difference: a=' + JSON.stringify(a) +
            ' b=' + JSON.stringify(b));
          console.log('      web=' + JSON.stringify(webHunks));
          console.log('      ext=' + JSON.stringify(extHunks));
        }
        mismatches++;
      }

      // Both diffs must reproduce the target text.
      if (applyOps(a, webHunks.map((h) => ({
        start: h.aStart, deleteCount: h.aEnd - h.aStart,
        text: b.slice(h.bStart, h.bEnd),
      }))) !== b) brokenWeb++;
      if (applyOps(a, extHunks.map((h) => ({
        start: h.aStart, deleteCount: h.aEnd - h.aStart,
        text: b.slice(h.bStart, h.bEnd),
      }))) !== b) brokenExt++;
    }
    check('the two implementations produce identical diffs',
      mismatches === 0, mismatches + ' of ' + samples + ' differ');
    check('the web diff always reproduces the target text',
      brokenWeb === 0, brokenWeb + ' of ' + samples + ' broken');
    check('the extension diff always reproduces the target text',
      brokenExt === 0, brokenExt + ' of ' + samples + ' broken');
  }

  section('3. A single character replacement keeps the character');
  {
    // The bug that the first version of the diff had: the replacement
    // text of the last hunk was truncated, so "1" became "2" by
    // deleting the "1" and inserting nothing.
    for (const [name, mod] of [['web', web], ['extension', ext]]) {
      const hunks = mod.diffHunks('const a = 1;\n', 'const a = 2;\n');
      const text = 'const a = 2;\n'.slice(hunks[0].bStart, hunks[0].bEnd);
      check(name + ': the replacement hunk carries the new character',
        text === '2', JSON.stringify(hunks));
    }
  }

  section('4. A local edit on an in-sync shared text reproduces the document');
  {
    const seed = { value: 777 };
    const rnd = makeRandom(seed);
    const alphabet = 'abc \n';
    const randomText = (maxLen) => {
      const len = Math.floor(rnd() * maxLen);
      let s = '';
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      return s;
    };
    const randomEdit = (text) => {
      const pos = Math.floor(rnd() * (text.length + 1));
      const len = Math.min(text.length - pos, Math.floor(rnd() * 4));
      return text.slice(0, pos) + randomText(3) + text.slice(pos + len);
    };

    let webFailures = 0;
    let extFailures = 0;
    const samples = 3000;
    for (let i = 0; i < samples; i++) {
      const previous = randomText(30);
      const current = randomEdit(previous);

      const webOps = web.planLocalEdit(previous, previous, current);
      const extOps = ext.planLocalEdit(previous, previous, current);
      if (applyOps(previous, webOps) !== current) webFailures++;
      if (applyOps(previous, extOps) !== current) extFailures++;
    }
    check('the web planner reproduces the document exactly',
      webFailures === 0, webFailures + ' of ' + samples + ' wrong');
    check('the extension planner reproduces the document exactly',
      extFailures === 0, extFailures + ' of ' + samples + ' wrong');
  }

  section('5. A local edit on a drifted shared text keeps both changes');
  {
    const seed = { value: 31337 };
    const rnd = makeRandom(seed);
    const alphabet = 'abc \n';
    const randomText = (maxLen) => {
      const len = Math.floor(rnd() * maxLen);
      let s = '';
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      return s;
    };

    const remoteMark = '<<remote>>';
    const localMark = '<<local>>';
    let webFailures = 0;
    let extFailures = 0;
    let checked = 0;
    for (let i = 0; i < 3000; i++) {
      const previous = randomText(30);
      const localAt = Math.floor(rnd() * (previous.length + 1));
      const current = previous.slice(0, localAt) + localMark + previous.slice(localAt);

      // The remote change must not overlap the local edit.
      const covered = new Set();
      for (const hunk of web.diffHunks(previous, current)) {
        for (let p = hunk.aStart; p <= hunk.aEnd; p++) covered.add(p);
      }
      const free = [];
      for (let p = 0; p <= previous.length; p++) if (!covered.has(p)) free.push(p);
      if (free.length === 0) continue;

      const remoteAt = free[Math.floor(rnd() * free.length)];
      const drifted = previous.slice(0, remoteAt) + remoteMark + previous.slice(remoteAt);

      const webOut = applyOps(drifted, web.planLocalEdit(drifted, previous, current));
      const extOut = applyOps(drifted, ext.planLocalEdit(drifted, previous, current));
      checked++;
      if (!webOut.includes(remoteMark) || !webOut.includes(localMark)) webFailures++;
      if (!extOut.includes(remoteMark) || !extOut.includes(localMark)) extFailures++;
    }
    check('the web planner keeps both changes',
      webFailures === 0, webFailures + ' of ' + checked + ' wrong');
    check('the extension planner keeps both changes',
      extFailures === 0, extFailures + ' of ' + checked + ' wrong');
  }

  section('6. The Lite Viewer scenario: an edit against a stale editor');
  {
    // The editor shows "abc", a peer inserted "REMOTE\n" at the top and
    // the shared text is now "REMOTE\nabc", but the editor has not been
    // re-rendered yet. The user types "X" at the end.
    //
    // The old behaviour computed the patch against the *shared* text,
    // which deleted the peer's line. The new behaviour plans the edit
    // against what the editor was showing.
    const shown = 'abc';
    const shared = 'REMOTE\nabc';
    const typed = 'abcX';

    for (const [name, mod] of [['web', web], ['extension', ext]]) {
      const ops = mod.planLocalEdit(shared, shown, typed);
      const result = applyOps(shared, ops);
      check(name + ": the peer's line survives the local edit",
        result.includes('REMOTE'), JSON.stringify(result));
      check(name + ': the local character is kept',
        result.includes('X'), JSON.stringify(result));
      check(name + ': the merged text is exactly what is expected',
        result === 'REMOTE\nabcX', JSON.stringify(result));
    }
  }

  section('7. The old behaviour would have destroyed the peer change');
  {
    // This is the regression the Lite Viewer had: the patch was
    // computed between the *shared* text and the editor's new value,
    // so the difference spanned the peer's line and deleted it.
    const shown = 'abc';
    const shared = 'REMOTE\nabc';
    const typed = 'abcX';

    // What the old code did: replace everything from the first
    // difference to the end with the editor's new value.
    const prefix = (() => {
      let i = 0;
      while (i < shared.length && i < typed.length && shared[i] === typed[i]) i++;
      return i;
    })();
    const oldResult = typed;

    check('the old approach loses the peer change',
      !oldResult.includes('REMOTE'), JSON.stringify(oldResult));
    check('the old approach replaced the whole shared text',
      oldResult !== shared && oldResult.length < shared.length,
      JSON.stringify(oldResult));

    // The new approach keeps it.
    const newResult = applyOps(shared, web.planLocalEdit(shared, shown, typed));
    check('the new approach keeps the peer change',
      newResult.includes('REMOTE') && newResult.includes('X'),
      JSON.stringify(newResult));
    void prefix;
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
