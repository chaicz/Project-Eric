/**
 * Repair script for the code-server extension registry.
 *
 * Problem being fixed
 * -------------------
 * `Data/extensions/extensions.json` is the registry VS Code uses to know
 * which extensions are installed. Over time it accumulated entries whose
 * folders no longer exist on disk (the "disable" / "purge" scripts renamed
 * folders to `*.disabled` and later deleted them, but the registry was
 * never rewritten).
 *
 * VS Code scans the registry, finds an entry whose folder is missing, marks
 * the extension as *invalid* (`isValid: false`) and surfaces the yellow
 * "Invalid extensions detected. Review them." banner in the Extensions view.
 * The banner is a symptom — the actual problem is the stale registry.
 *
 * What this script does
 * ---------------------
 * 1. Drops registry entries whose `relativeLocation` folder is gone.
 * 2. Drops registry entries whose extension folder exists but whose
 *    `package.json` cannot be parsed / has no `main` or `browser` entry
 *    point on disk (VS Code marks those invalid too).
 * 3. Registers any extension folder present on disk that the registry does
 *    not know about yet.
 * 4. Rewrites `.obsolete` so it only lists folders that are really gone.
 *
 * Everything is written through a temp file + rename so a crash can never
 * leave a half-written registry behind.
 *
 * Usage:  node scripts/repair-extensions.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const EXTENSIONS_DIR =
  process.env.CODE_SERVER_EXTENSIONS_DIR ||
  path.join(process.env.LOCALAPPDATA || '', 'code-server', 'Data', 'extensions');

const REGISTRY = path.join(EXTENSIONS_DIR, 'extensions.json');
const OBSOLETE = path.join(EXTENSIONS_DIR, '.obsolete');

if (!fs.existsSync(EXTENSIONS_DIR)) {
  console.error(`Extensions dir not found: ${EXTENSIONS_DIR}`);
  process.exit(1);
}

/** Read a registry entry's installed folder. */
function entryDir(entry) {
  const rel = entry.relativeLocation || (entry.location && entry.location.path);
  if (!rel) return null;
  return path.isAbsolute(rel) ? rel : path.join(EXTENSIONS_DIR, rel);
}

/** True when the folder holds a readable package.json. */
function readManifest(dir) {
  const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(pj, 'utf8'));
    return m && typeof m === 'object' ? m : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an entry point the way Node's `require` does.
 *
 * Extensions commonly ship `main: "./dist/extension"` while the file on
 * disk is `dist/extension.js` — Node resolves that fine, and so does the
 * VS Code extension host. Checking the literal path only (as this script
 * used to) flagged perfectly good extensions as invalid and then dropped
 * their marketplace metadata, which is what produced the "Invalid
 * extensions detected" banner in the first place.
 */
function resolvesLikeNode(absPath) {
  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) return true;
  for (const ext of ['.js', '.json', '.node', '.cjs', '.mjs']) {
    if (fs.existsSync(absPath + ext)) return true;
  }
  try {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
      const index = path.join(absPath, 'index.js');
      if (fs.existsSync(index)) return true;
    }
  } catch {
    /* unreadable path - treat as missing */
  }
  return false;
}

/** Entry points VS Code actually needs on disk. */
function missingEntryPoints(dir, manifest) {
  const missing = [];
  for (const key of ['main', 'browser']) {
    const rel = manifest[key];
    if (typeof rel !== 'string') continue;
    if (!resolvesLikeNode(path.resolve(dir, rel))) missing.push(`${key} -> ${rel}`);
  }
  return missing;
}

/** Every extension folder on disk, keyed by `publisher.name`. */
function scanDisk() {
  const found = new Map();
  for (const name of fs.readdirSync(EXTENSIONS_DIR)) {
    if (name === 'extensions.json' || name === '.obsolete') continue;
    const dir = path.join(EXTENSIONS_DIR, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const manifest = readManifest(dir);
    if (!manifest || !manifest.publisher || !manifest.name) continue;
    found.set(`${manifest.publisher}.${manifest.name}`, { dir, name, manifest });
  }
  return found;
}

const registry = fs.existsSync(REGISTRY)
  ? JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
  : [];

const onDisk = scanDisk();
const kept = [];
const removed = [];
const repaired = [];

for (const entry of registry) {
  const dir = entryDir(entry);
  const id = entry.identifier && entry.identifier.id;

  if (!dir || !fs.existsSync(dir)) {
    removed.push(`${id}@${entry.version} (folder missing: ${path.basename(dir || '?')})`);
    continue;
  }

  const manifest = readManifest(dir);
  if (!manifest) {
    removed.push(`${id}@${entry.version} (unreadable package.json)`);
    continue;
  }

  const missing = missingEntryPoints(dir, manifest);
  if (missing.length) {
    removed.push(`${id}@${entry.version} (${missing.join(', ')} not found)`);
    continue;
  }

  // The folder was renamed/reinstalled under a different version. Point the
  // registry at the version that is actually on disk.
  const currentVersion = manifest.version;
  if (currentVersion && entry.version !== currentVersion) {
    repaired.push(`${id}: ${entry.version} -> ${currentVersion}`);
    entry.version = currentVersion;
    const rel = path.basename(dir);
    entry.relativeLocation = rel;
    entry.location = {
      $mid: 1,
      path: '/' + dir.replace(/\\/g, '/'),
      scheme: 'file',
    };
  }

  kept.push(entry);
}

// Register extensions that exist on disk but are unknown to the registry.
for (const [id, info] of onDisk) {
  if (kept.some((e) => e.identifier && e.identifier.id === id)) continue;
  const entry = {
    identifier: { id },
    version: info.manifest.version,
    location: { $mid: 1, path: '/' + info.dir.replace(/\\/g, '/'), scheme: 'file' },
    relativeLocation: info.name,
    metadata: {
      isApplicationScoped: false,
      isMachineScoped: false,
      isBuiltin: false,
      installedTimestamp: Date.now(),
      pinned: false,
      // We only know the folder exists - we do not know which gallery it
      // came from, so do not fabricate marketplace metadata. The CLI
      // rewrites this on the next install anyway.
      source: 'vsix',
      publisherDisplayName: info.manifest.publisher,
      updated: true,
      private: false,
      isPreReleaseVersion: false,
      hasPreReleaseVersion: false,
      preRelease: false,
    },
  };
  kept.push(entry);
  repaired.push(`${id}@${info.manifest.version} (registered from disk)`);
}

// .obsolete must only reference folders that really are gone.
const obsolete = fs.existsSync(OBSOLETE)
  ? JSON.parse(fs.readFileSync(OBSOLETE, 'utf8'))
  : {};
const nextObsolete = {};
for (const [name, value] of Object.entries(obsolete)) {
  if (!fs.existsSync(path.join(EXTENSIONS_DIR, name))) nextObsolete[name] = value;
}

// Write atomically.
function writeAtomic(file, contents) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

writeAtomic(REGISTRY, JSON.stringify(kept));

if (Object.keys(nextObsolete).length) {
  writeAtomic(OBSOLETE, JSON.stringify(nextObsolete));
} else if (fs.existsSync(OBSOLETE)) {
  fs.writeFileSync(OBSOLETE, '{}');
}

console.log(`Extensions dir: ${EXTENSIONS_DIR}`);
console.log(`Registry entries kept: ${kept.length}`);
if (removed.length) {
  console.log('\nRemoved invalid entries:');
  for (const r of removed) console.log(`  - ${r}`);
}
if (repaired.length) {
  console.log('\nRepaired / added:');
  for (const r of repaired) console.log(`  * ${r}`);
}
if (!removed.length && !repaired.length) {
  console.log('\nNo changes were necessary.');
}
console.log('\nInstalled now:');
for (const [id, info] of onDisk) console.log(`  ${id}@${info.manifest.version}`);
