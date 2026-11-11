// p2p-relay-server.mjs
// ---------------------------------------------------------------------------
// WebSocket signalling relay for the P2P Live Share extension.
//
// This replaces the retired Yjs relay (`extensions/eric-collab/scripts/
// yjs-server.js`). It implements the wire protocol of the P2P Live Share
// relay exactly, so a session hosted by this project's fork can be joined
// by a stock P2P Live Share client (for example one running in vscode.dev).
//
// Protocol
// --------
// A client connects to
//
//   ws://<relay>/<roomId>/<peerId>
//
// and every frame it sends is an "uplink" message:
//
//   { action, data, targetPeers?, metadata? }
//
// The relay forwards it to the other members of the room as a "downlink":
//
//   { action, data?, peerId, metadata? }
//
// `data` is either plain JSON or a binary blob. Binary payloads are packed
// as
//
//   [uint32 metadata length][metadata JSON][payload bytes]
//
// so the metadata (action, target peers, …) travels next to the bytes.
//
// Whenever the membership of a room changes, the relay pushes
//
//   { action: '__update_peers__', data: [peerId, …] }
//
// to every member. That is how a host learns about a guest and sends it
// the initial document state.
//
// Usage
// -----
//   node scripts/p2p-relay-server.mjs [--port 1234] [--host 0.0.0.0]
//
// Environment:
//   P2P_RELAY_PORT, P2P_RELAY_HOST

import { createServer } from 'node:http'
import process from 'node:process'
import { WebSocketServer } from 'ws'

const args = process.argv.slice(2)

function argValue(name, fallback) {
  const index = args.indexOf(`--${name}`)
  if (index !== -1 && args[index + 1]) return args[index + 1]
  const inline = args.find(a => a.startsWith(`--${name}=`))
  if (inline) return inline.slice(name.length + 3)
  return fallback
}

const PORT = Number(argValue('port', process.env.P2P_RELAY_PORT || 1234))
const HOST = String(argValue('host', process.env.P2P_RELAY_HOST || '0.0.0.0'))

const UPDATE_PEERS_ACTION = '__update_peers__'

/** roomId → Map<peerId, WebSocket> */
const rooms = new Map()

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

function packTextAndBuffer(text, data) {
  const metadataBuffer = Buffer.from(text, 'utf8')
  const packed = Buffer.alloc(4 + metadataBuffer.byteLength + data.byteLength)
  packed.writeUInt32LE(metadataBuffer.byteLength, 0)
  metadataBuffer.copy(packed, 4)
  Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength).copy(
    packed,
    4 + metadataBuffer.byteLength,
  )
  return packed
}

function unpackTextAndBuffer(packed) {
  const buffer = Buffer.isBuffer(packed) ? packed : Buffer.from(packed)
  const metadataLength = buffer.readUInt32LE(0)
  const metadata = buffer.subarray(4, 4 + metadataLength).toString('utf8')
  const data = buffer.subarray(4 + metadataLength)
  return { buffer: new Uint8Array(data), text: metadata }
}

function serialize(content) {
  if (content.data instanceof Uint8Array) {
    const metadata = JSON.stringify({ ...content, data: undefined })
    // `ws` sends a Buffer as a binary frame, which the client decodes with
    // `binaryType = 'arraybuffer'` exactly like the upstream implementation.
    return packTextAndBuffer(metadata, content.data)
  }
  return JSON.stringify(content)
}

function deserialize(input, isBinary) {
  // `ws` hands text frames over as Buffers, so the binary flag is the only
  // reliable way to tell a JSON uplink from a packed binary uplink.
  if (isBinary) {
    const { buffer, text } = unpackTextAndBuffer(input)
    return { ...JSON.parse(text), data: buffer }
  }
  return JSON.parse(String(input))
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function roomPeers(roomId) {
  return rooms.get(roomId)
}

function broadcastPeers(roomId) {
  const peers = roomPeers(roomId)
  if (!peers) return
  const message = serialize({
    action: UPDATE_PEERS_ACTION,
    data: [...peers.keys()],
    peerId: 'server',
  })
  for (const client of peers.values()) {
    if (client.readyState === client.OPEN) {
      client.send(message)
    }
  }
}

function handleMessage(roomId, senderId, raw, isBinary) {
  const peers = roomPeers(roomId)
  if (!peers) return

  let uplink
  try {
    uplink = deserialize(raw, isBinary)
  }
  catch (error) {
    console.error('[relay] failed to decode message:', error?.message || error)
    return
  }

  const downlink = {
    action: uplink.action,
    data: uplink.data,
    peerId: senderId,
    metadata: uplink.metadata,
  }

  const targets = uplink.targetPeers
    ? (Array.isArray(uplink.targetPeers) ? uplink.targetPeers : [uplink.targetPeers])
    : undefined

  const message = serialize(downlink)

  const recipients = targets
    ? targets.map(id => peers.get(id)).filter(Boolean)
    : [...peers.values()]

  for (const client of recipients) {
    if (client.data.peerId === senderId) continue
    if (client.readyState !== client.OPEN) continue
    client.send(message)
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`P2P Live Share relay. ${rooms.size} active room(s).`)
})

const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (request, socket, head) => {
  let pathname
  try {
    pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname
  }
  catch {
    pathname = request.url || ''
  }

  const match = pathname.match(/^\/([\w-]+)\/([\w-]+)$/)
  if (!match) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  const [, roomId, peerId] = match

  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.binaryType = 'arraybuffer'
    ws.data = { roomId, peerId }
    wss.emit('connection', ws, request)
  })
})

wss.on('connection', (ws) => {
  const { roomId, peerId } = ws.data

  let peers = rooms.get(roomId)
  if (!peers) {
    rooms.set(roomId, peers = new Map())
  }
  peers.set(peerId, ws)
  console.log(`[relay] peer ${peerId} joined room ${roomId}`)
  broadcastPeers(roomId)

  ws.on('message', (data, isBinary) => {
    handleMessage(roomId, peerId, data, isBinary)
  })

  ws.on('close', () => {
    const current = rooms.get(roomId)
    if (!current) return
    current.delete(peerId)
    console.log(`[relay] peer ${peerId} left room ${roomId}`)
    if (current.size === 0) {
      rooms.delete(roomId)
    }
    else {
      broadcastPeers(roomId)
    }
  })

  ws.on('error', (error) => {
    console.error(`[relay] socket error (${peerId}):`, error?.message || error)
  })
})

httpServer.listen(PORT, HOST, () => {
  const display = HOST.includes(':') ? `[${HOST}]` : HOST
  console.log(`[relay] P2P Live Share relay listening on ws://${display}:${PORT}/`)
})

function shutdown() {
  console.log('\n[relay] shutting down…')
  for (const peers of rooms.values()) {
    for (const client of peers.values()) {
      client.close(1001, 'Server stopped')
    }
  }
  wss.close()
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
