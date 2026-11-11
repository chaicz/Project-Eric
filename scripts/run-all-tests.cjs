#!/usr/bin/env node
// Runs every test suite in the repository and reports a single summary.
// Each suite is a separate process so a crash in one cannot mask another.

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const SUITES = [
  { name: 'unit (main app)', cwd: ROOT, cmd: 'npm', args: ['test'] },
  { name: 'route coverage', cwd: ROOT, cmd: 'node', args: ['scripts/check-route-coverage.cjs'] },
  { name: 'owasp 10-language fixtures', cwd: ROOT, cmd: 'node', args: ['scripts/test-owasp-10-languages.cjs'] },
  { name: 'owasp secure reference files', cwd: ROOT, cmd: 'node', args: ['scripts/test-owasp-secure-clean.cjs'] },
  { name: 'language packs (repo)', cwd: ROOT, cmd: 'node', args: ['scripts/test-language-packs.cjs'] },
  { name: 'language packs (installed)', cwd: ROOT, cmd: 'node', args: ['scripts/test-installed-language-packs.cjs'] },
  { name: 'text diff', cwd: ROOT, cmd: 'node', args: ['scripts/test-text-diff.cjs'] },
  { name: 'text sync', cwd: ROOT, cmd: 'node', args: ['scripts/test-text-sync.cjs'] },
  { name: 'sandbox asset inlining', cwd: ROOT, cmd: 'node', args: ['scripts/test-sandbox-asset-inlining.mjs'] },
  { name: 'sandbox preview runners', cwd: ROOT, cmd: 'node', args: ['scripts/test-sandbox-preview-runners.mjs'] },
  {
    name: 'owasp extension',
    cwd: path.join(ROOT, 'extensions/project-eric-owasp'),
    cmd: 'npm',
    args: ['test'],
  },
  {
    name: 'p2p-live-share extension',
    cwd: path.join(ROOT, 'extensions/p2p-live-share'),
    cmd: 'npm',
    args: ['test'],
  },
  {
    name: 'eric-collab text sync',
    cwd: path.join(ROOT, 'extensions/eric-collab'),
    cmd: 'node',
    args: ['scripts/test-textsync-regression.cjs'],
  },
]

// On Windows `npm` is a batch file, which cannot be executed directly.
// Rather than going through a shell (deprecated when arguments are passed
// separately), the npm CLI entry point is invoked through node itself.
const isWindows = process.platform === 'win32'

const npmEntry = (() => {
  if (!isWindows) return null
  const npmCli = path.join(
    path.dirname(process.execPath),
    'node_modules/npm/bin/npm-cli.js',
  )
  return fs.existsSync(npmCli) ? npmCli : null
})()

let failed = 0

for (const suite of SUITES) {
  let command = suite.cmd
  let args = suite.args

  if (suite.cmd === 'npm' && npmEntry) {
    command = process.execPath
    args = [npmEntry, ...suite.args]
  }

  const result = spawnSync(command, args, {
    cwd: suite.cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  })

  const output = `${result.stdout || ''}${result.stderr || ''}`
  const ok = result.status === 0

  // Pull the counters each suite prints, so the summary shows test counts
  // rather than just pass/fail.
  const counts = []
  const unitMatch = output.match(/tests\s+(\d+)[\s\S]*?pass\s+(\d+)[\s\S]*?fail\s+(\d+)/)
  if (unitMatch) counts.push(`${unitMatch[2]}/${unitMatch[1]} passed`)
  const customMatch = output.match(/(\d+)\s+passed\s+·\s+(\d+)\s+failed/)
  if (customMatch) counts.push(`${customMatch[1]}/${Number(customMatch[1]) + Number(customMatch[2])} passed`)
  const checksMatch = output.match(/all (\d+) checks passed/i)
  if (checksMatch) counts.push(`${checksMatch[1]} checks passed`)

  // ASCII separator only: an em dash renders as mojibake in the Windows
  // console unless the code page is UTF-8.
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${suite.name}${counts.length ? `  - ${counts.join(', ')}` : ''}`)
  if (!ok) {
    failed += 1
    const tail = output.trim().split('\n').slice(-25).join('\n')
    console.log(tail)
  }
}

console.log(`\n${SUITES.length - failed}/${SUITES.length} suites passed`)
process.exitCode = failed === 0 ? 0 : 1
