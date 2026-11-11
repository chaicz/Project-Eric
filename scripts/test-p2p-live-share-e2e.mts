// End-to-end test for the P2P Live Share signalling path.
//
// `scripts/test-p2p-relay.mjs` spawns its own relay and re-implements the
// wire format. This harness does the opposite: it drives the LIVE relay
// with the extension's OWN serialiser (`src/sync/ws/protocol.ts`), so a
// drift between the extension and the relay is caught here.
//
// Two transports are exercised:
//
//   direct : ws://127.0.0.1:1235/<room>/<peer>   — the host's own relay
//   proxy  : ws://127.0.0.1:5173/p2p-ws/<room>/<peer> — what a remote
//            guest reaches through the Cloudflare tunnel
//
// Run: node_modules/.bin/tsx scripts/test-p2p-live-share-e2e.mts
//      (tsx lives in extensions/p2p-live-share/node_modules/.bin)

import { WebSocket } from 'ws'
import {
  deserializeDownlink,
  serializeUplink,
  UpdatePeersAction,
} from '../extensions/p2p-live-share/src/sync/ws/protocol.ts'

const RELAY = process.env.P2P_RELAY || 'ws://127.0.0.1:1235'
const PROXY = process.env.P2P_PROXY || 'ws://127.0.0.1:5173/p2p-ws'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const results = []
function record(label, ok, detail = '') {
  results.push({ label, ok })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

/**
 * A relay peer. `messages` collects every downlink that is not a peer-list
 * update; `peers` holds the latest `__update_peers__` payload.
 */
function createPeer(base, room, peerId) {
  const ws = new WebSocket(`${base}/${room}/${peerId}`)
  ws.binaryType = 'arraybuffer'

  const peer = {
    id: peerId,
    ws,
    peers: [],
    messages: [],
    closed: false,
  }

  ws.on('message', (raw, isBinary) => {
    const frame = isBinary ? raw : String(raw)
    const { action, data, metadata, peerId: sender } = deserializeDownlink(frame)
    if (action === UpdatePeersAction) {
      peer.peers = (data as string[]).filter((id) => id !== peerId)
      return
    }
    peer.messages.push({ action, data, metadata, peerId: sender })
  })

  return peer
}

function opened(peer) {
  return new Promise((resolve, reject) => {
    peer.ws.once('open', resolve)
    peer.ws.once('error', reject)
  })
}

/** Wait until `predicate` is true, or give up after `timeout` ms. */
async function until(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(25)
  }
  return predicate()
}

async function scenario(base, label) {
  console.log(`\n=== ${label} (${base}) ===`)

  const room = `p2p-e2e-${Math.random().toString(36).slice(2, 8)}`
  const host = createPeer(base, room, 'host')
  const guest = createPeer(base, room, 'guest')
  const third = createPeer(base, room, 'third')

  try {
    await Promise.all([opened(host), opened(guest), opened(third)])
    record('all three peers connect', true, room)

    await until(() => host.peers.length === 2 && guest.peers.length === 2 && third.peers.length === 2)
    record('host learns both peers', host.peers.includes('guest') && host.peers.includes('third'), JSON.stringify(host.peers))
    record('guest learns both peers', guest.peers.includes('host') && guest.peers.includes('third'), JSON.stringify(guest.peers))
    record('third peer learns both peers', third.peers.includes('host') && third.peers.includes('guest'), JSON.stringify(third.peers))

    // --- binary uplink: host -> guest -------------------------------
    const payload = new Uint8Array([0x00, 0xff, 0x10, 0x7f, 0x80, 0x00, 0x42])
    host.ws.send(serializeUplink({ action: 'terminal', data: payload }))
    await until(() => guest.messages.length === 1)
    const binary = guest.messages[0]
    const received = binary?.data instanceof Uint8Array ? binary.data : new Uint8Array()
    record('binary uplink reaches the guest', !!binary, binary ? `action=${binary.action}` : 'no message')
    record('binary payload is byte-identical', received.length === payload.length && received.every((b, i) => b === payload[i]), `${received.length} bytes`)
    record('binary downlink carries the sender peerId', binary?.peerId === 'host', `peerId=${binary?.peerId}`)

    // --- JSON uplink: guest -> host ---------------------------------
    guest.ws.send(serializeUplink({
      action: 'editor',
      data: { text: 'hello from the guest' },
      metadata: { seq: 7 },
    }))
    await until(() => host.messages.length === 1)
    const json = host.messages[0]
    record('JSON uplink reaches the host', !!json, json ? `action=${json.action}` : 'no message')
    record('JSON payload survives the relay', json?.data?.text === 'hello from the guest', JSON.stringify(json?.data))
    record('metadata survives the relay', json?.metadata?.seq === 7, JSON.stringify(json?.metadata))
    record('JSON downlink carries the sender peerId', json?.peerId === 'guest', `peerId=${json?.peerId}`)

    // --- targeting --------------------------------------------------
    const beforeThird = third.messages.length
    const beforeHost = host.messages.length
    guest.ws.send(serializeUplink({
      action: 'terminal',
      data: 'secret\r',
      targetPeers: 'host',
    }))
    await until(() => host.messages.length > beforeHost)
    record('targeted message reaches its target', host.messages.length > beforeHost, `host has ${host.messages.length}`)
    await sleep(300)
    record('targeted message does not reach other peers', third.messages.length === beforeThird, `third gained ${third.messages.length - beforeThird}`)

    // --- a sender never receives its own broadcast --------------------
    const beforeGuest = guest.messages.length
    guest.ws.send(serializeUplink({ action: 'terminal', data: 'self\r' }))
    await until(() => host.messages.length > beforeHost + 1)
    await sleep(300)
    record('sender does not receive its own broadcast', guest.messages.length === beforeGuest, `guest gained ${guest.messages.length - beforeGuest}`)

    // --- peer-leave notification --------------------------------------
    third.ws.close()
    await until(() => host.peers.length === 1 && guest.peers.length === 1)
    record('peers are notified when someone leaves', !host.peers.includes('third') && !guest.peers.includes('third'), `host sees ${JSON.stringify(host.peers)}`)
  }
  finally {
    for (const peer of [host, guest, third]) {
      try { peer.ws.terminate() } catch { /* already closed */ }
    }
    await sleep(150)
  }
}

async function main() {
  console.log('P2P Live Share — end-to-end signalling test')
  console.log(`  extension protocol : extensions/p2p-live-share/src/sync/ws/protocol.ts`)
  console.log(`  relay             : ${RELAY}`)
  console.log(`  proxy             : ${PROXY}`)

  await scenario(RELAY, 'live relay, direct')
  await scenario(PROXY, 'vite proxy, guest path')

  console.log('\n' + '-'.repeat(40))
  const passed = results.filter((r) => r.ok).length
  console.log(`Results: ${passed}/${results.length} checks passed.`)
  for (const r of results.filter((r) => !r.ok)) console.log(`  FAILED: ${r.label}`)
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((error) => {
  console.error('crashed:', error)
  process.exit(2)
})
