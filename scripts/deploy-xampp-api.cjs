#!/usr/bin/env node
/**
 * Deploy the Project Eric PHP API into the XAMPP htdocs folder.
 *
 * The React client talks to `http://localhost/project-eric-api/api/...`,
 * which Apache only serves if the API tree lives inside `htdocs`. This
 * script mirrors `xampp-backend/project-eric-api/` into the XAMPP install
 * and verifies that the copy actually landed.
 *
 * Usage:
 *   node scripts/deploy-xampp-api.cjs [--xampp D:\xampp] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'xampp-backend', 'project-eric-api');

const argv = process.argv.slice(2);
const getFlag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const dryRun = argv.includes('--dry-run');

// XAMPP is not always installed under C:\xampp, so fall back to probing the
// common locations when neither the flag nor the environment variable is set.
function detectXamppRoot() {
  const candidates = [
    'C:\\xampp',
    'D:\\xampp',
    'C:\\XAMPP',
    'D:\\XAMPP',
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'XAMPP'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'htdocs'))) return candidate;
  }
  return 'C:\\xampp';
}

const xamppRoot = getFlag('--xampp', process.env.XAMPP_ROOT || detectXamppRoot());
const target = path.join(xamppRoot, 'htdocs', 'project-eric-api');

// Files that must never be copied into a web-served folder.
const EXCLUDE = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db']);

function copyTree(from, to) {
  let copied = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(src, dst);
    } else if (entry.isFile()) {
      if (dryRun) {
        copied++;
        continue;
      }
      // Remove first so we never leave a stale file behind when a source
      // file was renamed or deleted.
      if (fs.existsSync(dst)) fs.unlinkSync(dst);
      fs.copyFileSync(src, dst);
      copied++;
    }
  }
  return copied;
}

function verify(targetDir) {
  const required = [
    'api/index.php',
    'api/.htaccess',
    'api/auth/login.php',
    'api/auth/register.php',
    'api/auth/validate.php',
    'api/auth/change-password.php',
    'api/profile-avatar.php',
    'api/landing.php',
    'api/dashboard.php',
    'api/features/index.php',
    'api/team/index.php',
    'api/projects/index.php',
    'api/vulnerabilities/index.php',
    'api/threats/index.php',
    'api/scans/index.php',
    'config/config.php',
    'includes/Database.php',
    'includes/JWTAuth.php',
    'includes/ResponseHelper.php',
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(targetDir, rel)));
  return missing;
}

if (!fs.existsSync(SOURCE)) {
  console.error(`[xampp-api] source not found: ${SOURCE}`);
  process.exit(1);
}

const htdocs = path.join(xamppRoot, 'htdocs');
if (!fs.existsSync(htdocs)) {
  console.error(`[xampp-api] XAMPP htdocs not found: ${htdocs}`);
  console.error('[xampp-api] pass the install path with --xampp <path>');
  process.exit(1);
}

console.log(`[xampp-api] source : ${SOURCE}`);
console.log(`[xampp-api] target : ${target}`);

if (dryRun) {
  console.log('[xampp-api] dry run — no files written');
} else {
  const copied = copyTree(SOURCE, target);
  console.log(`[xampp-api] copied ${copied} file(s)`);
}

const missing = verify(target);
if (missing.length) {
  console.error('[xampp-api] verification FAILED, missing:');
  missing.forEach((m) => console.error(`  - ${m}`));
  process.exit(1);
}

console.log('[xampp-api] verification OK');
console.log(`[xampp-api] API base: http://localhost/project-eric-api/api`);
