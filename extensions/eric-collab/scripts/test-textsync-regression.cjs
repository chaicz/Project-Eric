// Reproduce the shared-text duplication bug in the Eric Collab bridge.
//
// The scenario mirrors what happens in code-server:
//   1. The host binds a document whose content is *already* present in
//      the shared Y.Text (a late joiner, or a re-bind after `sync`).
//   2. The document and the Y.Text agree.
//   3. A remote peer (or the host's own sync step) touches the Y.Text.
//
// The bridge must never make the Y.Text *longer* than the document it
// mirrors. This script asserts that invariant.

const fs = require('fs');
const path = require('path');
const Y = require('yjs');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

async function loadHelpers() {
  const out = path.join(root, 'out-test', 'textsync-bundle.cjs');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'textSync.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: out,
    logLevel: 'error',
  });
  return require(out);
}

(async () => {
  const { planLocalEdit, diffHunks, applyOpsToString } = await loadHelpers();

  let failures = 0;
  const check = (name, cond, extra = '') => {
    if (cond) {
      console.log(`  PASS  ${name}`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${name} ${extra}`);
    }
  };

  // ---- Test 1: an edit that appends must not duplicate the file ------
  console.log('\nTest 1 — local append with an in-sync shared text');
  {
    const doc = 'line1\nline2\n';
    const yContent = doc;
    const current = 'line1\nline2\nline3\n';
    const ops = planLocalEdit(yContent, doc, current);
    const desired = applyOpsToString(yContent, ops);
    check('append does not duplicate', desired === current, JSON.stringify(desired));
    check('append stays the same length', desired.length === current.length);
  }

  // ---- Test 2: an edit at the very end of a large file ------
  console.log('\nTest 2 — append at the end of a large, repetitive file');
  {
    const block = 'function foo() {\n  return 1;\n}\n';
    const doc = block.repeat(200);
    const yContent = doc;
    const current = doc + '// tail\n';
    const ops = planLocalEdit(yContent, doc, current);
    const desired = applyOpsToString(yContent, ops);
    check(
      'large append does not duplicate',
      desired === current,
      `len=${desired.length} expected=${current.length}`
    );
  }

  // ---- Test 3: the real-world duplication shape ------------------------
  // The document and the Y.Text drift apart (the Y.Text holds *more*
  // content than the document). A local edit then gets planned against
  // the shared text. The result must not grow without bound.
  console.log('\nTest 3 — shared text already longer than the document');
  {
    const doc = 'a\nb\nc\n';
    const yContent = doc.repeat(5); // drifted / duplicated shared text
    const current = 'a\nb\nc\nd\n';
    const ops = planLocalEdit(yContent, doc, current);
    const desired = applyOpsToString(yContent, ops);
    check(
      'result does not grow past the shared text',
      desired.length <= yContent.length + 64,
      `yContent=${yContent.length} desired=${desired.length}`
    );
  }

  // ---- Test 4: diffHunks on a duplicated buffer ------------------------
  console.log('\nTest 4 — diffHunks must not report a giant insertion');
  {
    const a = 'x\n';
    const b = 'x\n'.repeat(100);
    const hunks = diffHunks(a, b);
    const total = hunks.reduce((n, h) => n + (h.bEnd - h.bStart), 0);
    check('single insertion hunk', hunks.length === 1, `hunks=${hunks.length}`);
    // The hunk covers only the region that actually differs: the common
    // prefix ('x\n') is trimmed off before the diff, so the insertion is
    // b.length - a.length, not b.length.
    check('insertion covers the whole addition', total === b.length - a.length, `total=${total}`);
  }

  // ---- Test 5: the full round-trip through Y.Text ---------------------
  console.log('\nTest 5 — round trip through a real Y.Text');
  {
    const ydoc = new Y.Doc();
    const yText = ydoc.getText('doc:x');
    const original = 'const a = 1;\nconst b = 2;\n';
    yText.insert(0, original);

    // Simulate the host's doc→Y push of a small edit.
    const previous = original;
    const current = 'const a = 1;\nconst b = 22;\n';
    const ops = planLocalEdit(yText.toString(), previous, current);
    ydoc.transact(() => {
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        if (op.deleteCount > 0) yText.delete(op.start, op.deleteCount);
        if (op.text.length > 0) yText.insert(op.start, op.text);
      }
    });
    check(
      'yText matches the document after the edit',
      yText.toString() === current,
      JSON.stringify(yText.toString())
    );

    // Now simulate a *remote* change landing, then a second local edit.
    yText.insert(yText.length, '// remote\n');
    const afterRemote = yText.toString();
    const previous2 = current;
    const current2 = 'const a = 1;\nconst b = 22;\nconst c = 3;\n';
    const ops2 = planLocalEdit(afterRemote, previous2, current2);
    const desired2 = applyOpsToString(afterRemote, ops2);
    check(
      'remote change is preserved',
      desired2.includes('// remote'),
      JSON.stringify(desired2)
    );
    check(
      'remote change is not duplicated',
      desired2.split('// remote').length - 1 === 1,
      `count=${desired2.split('// remote').length - 1}`
    );
  }

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
