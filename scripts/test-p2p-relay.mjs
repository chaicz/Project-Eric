// test-p2p-relay.mjs
// ---------------------------------------------------------------------------
// End-to-end test for scripts/p2p-relay-server.mjs.
//
// It boots the relay on a free port and exercises the full P2P Live Share
// wire protocol against it:
//
//   • the `__update_peers__` membership push
//   • binary uplinks packed as [uint32 meta length][meta JSON][payload]
//   • plain JSON uplinks
//   • `targetPeers` routing
//   • peer-leave notifications
//
// Run with:  npm run relay:test
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { WebSocket } from 'ws'

const here = dirname(fileURLToPath(import.meta.url))
const relayScript = join(here, 'p2p-relay-server.mjs')
const ROOM = 'relay-test-room'
const UPDATE_PEERS_ACTION = '__update_peers__'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Ask the OS for a free TCP port. */
async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

// ---------------------------------------------------------------------------
// Protocol helpers — a Node port of the extension's `protocol.ts`.
// ---------------------------------------------------------------------------

function packTextAndBuffer(text, data) {
  const metadataBuffer = Buffer.from(text, 'utf8')
  const packed = Buffer.alloc(4 + metadataBuffer.byteLength + data.byteLength)
  packed.writeUInt32LE(metadataBuffer.byteLength, 0)
  metadataBuffer.copy(packed, 4)
  Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength)
    .copy(packed, 4 + metadataBuffer.byteLength)
  return packed
}

function unpackTextAndBuffer(packed) {
  const buffer = Buffer.isBuffer(packed) ? packed : Buffer.from(packed)
  const metadataLength = buffer.readUInt32LE(0)
  return {
    text: buffer.subarray(4, 4 + metadataLength).toString('utf8'),
    data: buffer.subarray(4 + metadataLength),
  }
}

function serializeUplink(content) {
  if (content.data instanceof Uint8Array) {
    return packTextAndBuffer(JSON.stringify({ ...content, data: undefined }), content.data)
  }
  return JSON.stringify(content)
}

function deserializeDownlink(input, isBinary) {
  if (isBinary) {
    const { text, data } = unpackTextAndBuffer(input)
    return { ...JSON.parse(text), data }
  }
  return JSON.parse(String(input))
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const failures = []
let checks = 0

function check(label, ok, extra = '') {
  checks++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures.push(label)
}

function createPeer(port, peerId) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/${ROOM}/${peerId}`)
  ws.binaryType = 'arraybuffer'
  const peer = { id: peerId, ws, peers: [], messages: [] }
  ws.on('message', (data, isBinary) => {
    const { action, data: payload, metadata, peerId: sender } =
      deserializeDownlink(data, isBinary)
    if (action === UPDATE_PEERS_ACTION) {
      peer.peers = payload.filter(id => id !== peerId)
      return
    }
    peer.messages.push({ action, data: payload, peerId: sender, metadata })
  })
  return peer
}

async function waitForOpen(peer) {
  if (peer.ws.readyState === peer.ws.OPEN) return
  await new Promise((resolve, reject) => {
    peer.ws.once('open', resolve)
    peer.ws.once('error', reject)
  })
}

async function waitFor(predicate, timeout = 3000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(25)
  }
  return false
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const port = await freePort()
const relay = spawn(process.execPath, [relayScript, '--port', String(port), '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let relayLog = ''
relay.stdout.on('data', d => { relayLog += d })
relay.stderr.on('data', d => { relayLog += d })

const cleanup = () => {
  try { relay.kill() } catch {}
}
process.on('exit', cleanup)

console.log(`p2p-relay-server test — relay on 127.0.0.1:${port}\n`)

// Wait for the relay to accept connections.
let ready = false
for (let i = 0; i < 60; i++) {
  try {
    const probe = new WebSocket(`ws://127.0.0.1:${port}/${ROOM}/probe`)
    await new Promise((resolve, reject) => {
      probe.once('open', resolve)
      probe.once('error', reject)
    })
    probe.close()
    ready = true
    break
  }
  catch {
    await sleep(100)
  }
}
if (!ready) {
  console.error('relay did not start:\n' + relayLog)
  process.exit(1)
}

try {
  // --- membership ----------------------------------------------------------
  const host = createPeer(port, 'host-peer')
  await waitForOpen(host)
  const guest = createPeer(port, 'guest-peer')
  await waitForOpen(guest)
  const third = createPeer(port, 'third-peer')
  await waitForOpen(third)

  check('guest learns about the host', await waitFor(() => guest.peers.includes('host-peer')),
    JSON.stringify(guest.peers))
  check('host learns about the guest', await waitFor(() => host.peers.includes('guest-peer')),
    JSON.stringify(host.peers))

  // --- binary uplink -------------------------------------------------------
  const payload = new Uint8Array([1, 2, 3, 4, 5])
  host.ws.send(serializeUplink({ action: 'init', data: payload }))
  check('binary uplink reaches the guest',
    await waitFor(() => guest.messages.some(m => m.action === 'init')))
  const init = guest.messages.find(m => m.action === 'init')
  check('binary payload survives the relay',
    !!init && Buffer.compare(Buffer.from(init.data), Buffer.from(payload)) === 0)
  check('downlink carries the sender peerId', init?.peerId === 'host-peer', String(init?.peerId))

  // --- JSON uplink ---------------------------------------------------------
  guest.ws.send(serializeUplink({
    action: 'ack',
    data: { ok: true },
    metadata: { seq: 7 },
  }))
  check('JSON uplink reaches the host',
    await waitFor(() => host.messages.some(m => m.action === 'ack')))
  const ack = host.messages.find(m => m.action === 'ack')
  check('JSON data survives the relay', JSON.stringify(ack?.data) === '{"ok":true}',
    JSON.stringify(ack?.data))
  check('metadata survives the relay', JSON.stringify(ack?.metadata) === '{"seq":7}',
    JSON.stringify(ack?.metadata))
  check('downlink carries the sender peerId (JSON)', ack?.peerId === 'guest-peer',
    String(ack?.peerId))

  // --- targeted routing ----------------------------------------------------
  host.ws.send(serializeUplink({
    action: 'secret',
    data: 'x',
    targetPeers: ['guest-peer'],
  }))
  check('targeted message reaches its target',
    await waitFor(() => guest.messages.some(m => m.action === 'secret')))
  check('targeted message does not reach other peers',
    !third.messages.some(m => m.action === 'secret'))

  // --- the sender never receives its own message ---------------------------
  check('sender does not receive its own broadcast',
    !host.messages.some(m => m.action === 'secret'))

  // --- a large binary payload ----------------------------------------------
  const big = Buffer.alloc(1024 * 1024)
  for (let i = 0; i < big.length; i++) big[i] = i % 251
  host.ws.send(packTextAndBuffer(
    JSON.stringify({ action: 'big', data: undefined, metadata: { note: 'ünïcodé ✓' } }),
    big,
  ))
  check('1 MiB payload arrives',
    await waitFor(() => guest.messages.some(m => m.action === 'big'), 5000))
  const bigMsg = guest.messages.find(m => m.action === 'big')
  check('1 MiB payload is byte-identical',
    !!bigMsg && Buffer.compare(Buffer.from(bigMsg.data), big) === 0)
  check('non-ASCII metadata survives',
    bigMsg?.metadata?.note === 'ünïcodé ✓', JSON.stringify(bigMsg?.metadata))

  // --- a malformed frame must not take the relay down ----------------------
  host.ws.send('this is not json')
  host.ws.send(JSON.stringify({ action: 'after-garbage', data: 'ok' }))
  check('relay survives a malformed frame',
    await waitFor(() => guest.messages.some(m => m.action === 'after-garbage')))

  // --- leave notification --------------------------------------------------
  host.ws.close()
  check('peers are notified when someone leaves',
    await waitFor(() => !guest.peers.includes('host-peer')), JSON.stringify(guest.peers))

  third.ws.close()
  guest.ws.close()
}
catch (error) {
  console.error('\nunexpected error:', error)
  failures.push(String(error?.message || error))
}
finally {
  cleanup()
}

console.log('')
if (failures.length) {
  console.error(`${failures.length} of ${checks} check(s) failed:`)
  failures.forEach(f => console.error(`  - ${f}`))
  process.exit(1)
}
console.log(`all ${checks} checks passed`)
process.exit(0)
