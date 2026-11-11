// test-p2p-live-share-4up.mts
// ---------------------------------------------------------------------------
// Four-user end-to-end test for the P2P Live Share signalling path.
//
// `scripts/test-p2p-relay.mjs` proves the relay's wire format against a
// hand-written serialiser. `scripts/test-p2p-live-share-e2e.mts` drives the
// LIVE relay with the extension's OWN serialiser but only ever models three
// peers that exchange opaque blobs.
//
// This harness is the one that exercises the actual product behaviour with
// four participants:
//
//   • It uses the extension's real `protocol.ts` serialiser, so any drift
//     between the extension and the relay fails here.
//   • It uses real Yjs documents, so the assertions are about *document
//     convergence*, not about "a message arrived".
//   • It reproduces the host handshake from `session/host.ts`: when the host
//     sees a new peer it sends `init` with `Y.encodeStateAsUpdateV2(doc)`.
//   • It reproduces `sync/doc.ts`: local edits broadcast under the `doc`
//     action, remote edits are applied with `Y.applyUpdateV2(doc, msg,
//     { peerId })` so they are not echoed back.
//
// Participants
// ------------
//   host   the session owner
//   g1     guest
//   g2     guest
//   g3     guest
//
// Two transports are exercised for each scenario:
//
//   direct  ws://127.0.0.1:1235/<room>/<peer>    the host's own relay
//   proxy   ws://127.0.0.1:5173/p2p-ws/<room>/<peer>  what a remote guest
//            reaches through the Cloudflare tunnel
//
// Run:
//   extensions/p2p-live-share/node_modules/.bin/tsx \
//     scripts/test-p2p-live-share-4up.mts
// ---------------------------------------------------------------------------

import { WebSocket } from 'ws'
import * as Y from 'yjs'
import {
  deserializeDownlink,
  serializeUplink,
  UpdatePeersAction,
} from '../extensions/p2p-live-share/src/sync/ws/protocol.ts'

const DIRECT = process.env.P2P_RELAY || 'ws://127.0.0.1:1235'
const PROXY = process.env.P2P_PROXY || 'ws://127.0.0.1:5173/p2p-ws'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------

const results: { label: string, ok: boolean, group: string }[] = []
let currentGroup = 'general'

function record(label: string, ok: boolean, detail = '') {
  results.push({ label, ok, group: currentGroup })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

function group(name: string) {
  currentGroup = name
  console.log(`\n--- ${name} ---`)
}

// ---------------------------------------------------------------------------
// Peer harness
// ---------------------------------------------------------------------------

type Role = 'host' | 'guest'

interface Downlink {
  action: string
  data?: any
  peerId: string
  metadata?: any
}

interface Peer {
  id: string
  name: string
  role: Role
  ws: WebSocket
  doc: Y.Doc
  /** Peers the relay currently reports, minus ourselves. */
  peers: string[]
  /** Non-protocol traffic, used by the routing assertions. */
  messages: Downlink[]
  /** Host handshake payloads this peer received. */
  inits: Uint8Array[]
  /**
   * While true, locally generated document updates are buffered instead of
   * sent. This is how the test manufactures genuinely concurrent edits.
   */
  holdUpdates: boolean
  pendingUpdates: Uint8Array[]
  /** Peer ids the host has already sent `init` to. */
  initialised: Set<string>
  closed: boolean
}

function createPeer(base: string, room: string, id: string, name: string, role: Role): Peer {
  const ws = new WebSocket(`${base}/${room}/${id}`)
  ws.binaryType = 'arraybuffer'

  const doc = new Y.Doc()
  const peer: Peer = {
    id,
    name,
    role,
    ws,
    doc,
    peers: [],
    messages: [],
    inits: [],
    holdUpdates: false,
    pendingUpdates: [],
    initialised: new Set(),
    closed: false,
  }

  // --- document sync (mirrors sync/doc.ts) --------------------------------
  doc.on('updateV2', async (update: Uint8Array, origin: any) => {
    // Updates that came from the network carry a peerId origin and must
    // not be echoed back, or the session would loop forever.
    if (origin?.peerId)
      return
    if (peer.holdUpdates) {
      peer.pendingUpdates.push(update)
      return
    }
    send(peer, 'doc', update)
  })

  ws.on('message', (raw: any, isBinary: boolean) => {
    // `ws` hands text frames over as Buffers, but the extension's
    // deserialiser only understands `string` and `ArrayBuffer`.
    const frame = isBinary ? raw : String(raw)
    let downlink: Downlink
    try {
      downlink = deserializeDownlink(frame) as Downlink
    }
    catch {
      return
    }
    const { action, data, metadata, peerId: sender } = downlink

    if (action === UpdatePeersAction) {
      const list = (data as string[]).filter(id => id !== peer.id)
      peer.peers = list
      // The host sends the initial document snapshot to every peer it has
      // not greeted yet (session/host.ts).
      if (peer.role === 'host') {
        for (const candidate of list) {
          if (!peer.initialised.has(candidate)) {
            peer.initialised.add(candidate)
            send(peer, 'init', Y.encodeStateAsUpdateV2(peer.doc), candidate, { version: 1, os: 'win32' })
          }
        }
      }
      return
    }

    if (action === 'init') {
      peer.inits.push(data as Uint8Array)
      // session/guest.ts applies the snapshot without an origin, which
      // makes the guest re-broadcast it. That is intentional upstream and
      // is reproduced here.
      Y.applyUpdateV2(peer.doc, data as Uint8Array)
      return
    }

    if (action === 'doc') {
      Y.applyUpdateV2(peer.doc, data as Uint8Array, { peerId: sender })
      return
    }

    peer.messages.push({ action, data, peerId: sender, metadata })
  })

  ws.on('close', () => {
    peer.closed = true
  })

  return peer
}

function send(peer: Peer, action: string, data: any, targetPeers?: string | string[], metadata?: any) {
  if (peer.ws.readyState !== peer.ws.OPEN)
    return
  peer.ws.send(serializeUplink({ action, data, targetPeers, metadata }))
}

function opened(peer: Peer) {
  return new Promise<void>((resolve, reject) => {
    peer.ws.once('open', () => resolve())
    peer.ws.once('error', reject)
  })
}

/** Wait until `predicate` holds, or give up after `timeout` ms. */
async function until(predicate: () => boolean, timeout = 5000): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate())
      return true
    await sleep(25)
  }
  return predicate()
}

// ---------------------------------------------------------------------------
// Document helpers
// ---------------------------------------------------------------------------

function stateVector(doc: Y.Doc): string {
  return Buffer.from(Y.encodeStateVector(doc)).toString('hex')
}

function materialise(doc: Y.Doc) {
  const text = doc.getText('content').toString()
  const users = [...doc.getMap('users').entries()]
    .map(([id, value]: [string, any]) => `${id}=${value?.name ?? '?'}`)
    .sort()
  const meta = [...doc.getMap('meta').entries()]
    .map(([id, value]: [string, any]) => `${id}=${JSON.stringify(value)}`)
    .sort()
  return JSON.stringify({ text, users, meta })
}

function allEqual(peers: Peer[], fn: (p: Peer) => string): boolean {
  const values = peers.map(fn)
  return values.every(v => v === values[0])
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

async function scenario(base: string, label: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`${label}  (${base})`)
  console.log('='.repeat(60))

  const room = `p2p-4up-${Math.random().toString(36).slice(2, 8)}`
  const host = createPeer(base, room, 'host', 'Host', 'host')
  const g1 = createPeer(base, room, 'g1', 'Ada', 'guest')
  const g2 = createPeer(base, room, 'g2', 'Ben', 'guest')
  const g3 = createPeer(base, room, 'g3', 'Cleo', 'guest')
  const guests = [g1, g2, g3]
  const all = [host, g1, g2, g3]

  try {
    // --- 1. membership ----------------------------------------------------
    group('membership')
    await Promise.all(all.map(opened))
    record('all four participants connect', true, room)

    const everyoneSeesThree = await until(() =>
      all.every(p => p.peers.length === 3)
      && all.every(p => all.filter(o => o.id !== p.id).every(o => p.peers.includes(o.id))),
    )
    record('each participant sees the other three', everyoneSeesThree,
      all.map(p => `${p.id}[${p.peers.join(',')}]`).join(' '))

    // --- 2. host handshake ------------------------------------------------
    group('host handshake')
    const allGotInit = await until(() => guests.every(g => g.inits.length === 1))
    record('every guest receives the host snapshot', allGotInit,
      guests.map(g => `${g.id}:${g.inits.length}`).join(' '))

    const snapshotNonEmpty = guests.every(g => g.inits[0]?.byteLength > 0)
    record('host snapshot carries content', snapshotNonEmpty,
      guests.map(g => `${g.id}:${g.inits[0]?.byteLength ?? 0}B`).join(' '))

    // --- 3. host seeds the document --------------------------------------
    group('document sync — host → guests')
    host.doc.getText('content').insert(0, 'seeded by host\n')
    host.doc.getMap('meta').set('owner', 'host')

    const guestsSynced = await until(() =>
      guests.every(g => g.doc.getText('content').toString() === 'seeded by host\n'),
    )
    record('guests receive the host edit', guestsSynced,
      guests.map(g => JSON.stringify(g.doc.getText('content').toString())).join(' '))

    const vectorsMatch = await until(() => allEqual(all, p => stateVector(p.doc)))
    record('all four state vectors converge', vectorsMatch,
      all.map(p => `${p.id}:${stateVector(p.doc).slice(0, 8)}`).join(' '))

    // --- 4. guest → everyone ----------------------------------------------
    group('document sync — guest → everyone')
    g1.doc.getText('content').insert(g1.doc.getText('content').length, 'line from g1\n')
    const g1Propagated = await until(() =>
      host.doc.getText('content').toString().includes('line from g1')
      && g2.doc.getText('content').toString().includes('line from g1')
      && g3.doc.getText('content').toString().includes('line from g1'),
    )
    record('a guest edit reaches the host and the other guests', g1Propagated,
      JSON.stringify(host.doc.getText('content').toString()))

    // --- 5. presence ------------------------------------------------------
    group('presence')
    for (const p of all) {
      p.doc.getMap('users').set(p.id, { name: p.name, avatarUrl: null, color: null })
    }
    const presenceConverged = await until(() =>
      all.every(p => p.doc.getMap('users').size === 4),
    )
    record('all four participants appear in the users map', presenceConverged,
      all.map(p => `${p.id}:${p.doc.getMap('users').size}`).join(' '))

    const presenceMatches = allEqual(all, p => materialise(p.doc))
    record('presence is identical on every participant', presenceMatches)

    // --- 6. genuinely concurrent edits ------------------------------------
    group('concurrent edits')
    // Freeze outbound updates on every participant, make four divergent
    // edits, then release them all. Each update was generated from a
    // different document state, so this is real CRDT concurrency rather
    // than four sequential edits.
    for (const p of all) {
      p.holdUpdates = true
      p.pendingUpdates = []
    }
    const baseLength = host.doc.getText('content').length
    host.doc.getText('content').insert(baseLength, 'H')
    g1.doc.getText('content').insert(g1.doc.getText('content').length, 'G1')
    g2.doc.getText('content').insert(g2.doc.getText('content').length, 'G2')
    g3.doc.getText('content').insert(g3.doc.getText('content').length, 'G3')

    const buffered = all.every(p => p.pendingUpdates.length > 0)
    record('each participant buffered its divergent update', buffered,
      all.map(p => `${p.id}:${p.pendingUpdates.length}`).join(' '))

    for (const p of all) {
      const queued = [...p.pendingUpdates]
      p.pendingUpdates = []
      p.holdUpdates = false
      for (const update of queued)
        send(p, 'doc', update)
    }

    const converged = await until(() => allEqual(all, p => materialise(p.doc)), 8000)
    record('all four documents converge to one state', converged,
      all.map(p => JSON.stringify(p.doc.getText('content').toString())).join(' '))

    const allContributionsPresent = await until(() => {
      const text = host.doc.getText('content').toString()
      return ['H', 'G1', 'G2', 'G3'].every(token => text.includes(token))
    })
    record('every participant contribution survives', allContributionsPresent,
      JSON.stringify(host.doc.getText('content').toString()))

    const vectorsAfter = allEqual(all, p => stateVector(p.doc))
    record('state vectors match after concurrency', vectorsAfter,
      all.map(p => `${p.id}:${stateVector(p.doc).slice(0, 8)}`).join(' '))

    // --- 7. routing -------------------------------------------------------
    group('message routing')
    const before = all.map(p => p.messages.length)

    send(host, 'terminal', 'hello g1', 'g1')
    const targeted = await until(() => g1.messages.length > before[1])
    record('a targeted message reaches its target', targeted,
      `g1 gained ${g1.messages.length - before[1]}`)

    await sleep(300)
    const leaked = all.filter((p, i) => p.messages.length > before[i] && p.id !== 'g1')
    record('a targeted message reaches nobody else', leaked.length === 0,
      leaked.map(p => `${p.id}+${p.messages.length - before[all.indexOf(p)]}`).join(' ') || 'no leaks')

    const beforeBroadcast = all.map(p => p.messages.length)
    send(g2, 'terminal', 'broadcast')
    const broadcastArrived = await until(() =>
      [host, g1, g3].every(p => p.messages.length > beforeBroadcast[all.indexOf(p)]),
    )
    record('a broadcast reaches the other three', broadcastArrived,
      all.map(p => `${p.id}:${p.messages.length - beforeBroadcast[all.indexOf(p)]}`).join(' '))

    const senderEcho = g2.messages.length === beforeBroadcast[2]
    record('the sender does not receive its own broadcast', senderEcho,
      `g2 gained ${g2.messages.length - beforeBroadcast[2]}`)

    // --- 8. resilience -----------------------------------------------------
    group('resilience')
    const beforeGarbage = host.messages.length
    g1.ws.send('this is not json')
    g1.ws.send(serializeUplink({ action: 'after-garbage', data: 'ok' }))
    const survived = await until(() => host.messages.some(m => m.action === 'after-garbage'))
    record('the relay survives a malformed frame', survived,
      `host gained ${host.messages.length - beforeGarbage}`)

    // --- 9. leaving -------------------------------------------------------
    group('leave')
    g3.ws.close()
    const notified = await until(() =>
      [host, g1, g2].every(p => !p.peers.includes('g3') && p.peers.length === 2),
    )
    record('remaining participants are told g3 left', notified,
      [host, g1, g2].map(p => `${p.id}[${p.peers.join(',')}]`).join(' '))

    const stillAlive = await until(() => {
      host.doc.getText('content').insert(host.doc.getText('content').length, 'after-leave')
      return g2.doc.getText('content').toString().includes('after-leave')
    })
    record('the session keeps syncing after a participant leaves', stillAlive,
      JSON.stringify(g2.doc.getText('content').toString()))
  }
  catch (error) {
    console.error('\nunexpected error:', error)
    record(`scenario ${label} completed without throwing`, false, String((error as Error)?.message ?? error))
  }
  finally {
    for (const peer of all) {
      try {
        peer.ws.terminate()
      }
      catch {
        /* already closed */
      }
    }
    await sleep(200)
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log('P2P Live Share — four-user end-to-end test')
  console.log(`  extension protocol : extensions/p2p-live-share/src/sync/ws/protocol.ts`)
  console.log(`  document engine    : yjs (real CRDT convergence)`)
  console.log(`  relay              : ${DIRECT}`)
  console.log(`  proxy              : ${PROXY}`)

  await scenario(DIRECT, 'Scenario 1 — live relay, direct')
  await scenario(PROXY, 'Scenario 2 — vite proxy, guest path')

  console.log(`\n${'-'.repeat(60)}`)
  const passed = results.filter(r => r.ok).length
  console.log(`Results: ${passed}/${results.length} checks passed.`)
  for (const r of results.filter(r => !r.ok))
    console.log(`  FAILED [${r.group}] ${r.label}`)
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((error) => {
  console.error('crashed:', error)
  process.exit(2)
})
