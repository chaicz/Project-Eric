// A raw WebSocket client that joins a room on the Yjs relay and logs
// every binary frame it receives, decoded far enough to tell whether
// other clients are sending AWARENESS (message type 1) frames at all.
//
// This answers: "is the peer publishing presence on the wire?" without
// depending on the relay's own bookkeeping.
//
// Usage: node scripts/collab-wire-sniff.cjs <room> [server] [seconds]

const WebSocket = require('ws');
const decoding = require('lib0/decoding');

const ROOM = process.argv[2] || 'NHPV-QMK8';
const SERVER = (process.argv[3] || 'ws://127.0.0.1:1234/ws').replace(/\/+$/, '');
const SECONDS = Number(process.argv[4] || 40);

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

const ws = new WebSocket(`${SERVER}/${ROOM}`);
ws.binaryType = 'arraybuffer';

const awarenessFrames = [];
let syncFrames = 0;
let otherFrames = 0;

ws.on('open', () => {
  console.log(`[sniff] connected to ${SERVER}/${ROOM}`);
});

ws.on('message', (data) => {
  try {
    const buf = new Uint8Array(data instanceof Buffer ? data : new Uint8Array(data));
    const dec = decoding.createDecoder(buf);
    const type = decoding.readVarUint(dec);
    if (type === MESSAGE_AWARENESS) {
      const payload = decoding.readVarUint8Array(dec);
      const d2 = decoding.createDecoder(payload);
      const n = decoding.readVarUint(d2);
      const entries = [];
      for (let i = 0; i < n; i++) {
        const cid = decoding.readVarUint(d2);
        const clk = decoding.readVarUint(d2);
        const raw = decoding.readVarString(d2);
        entries.push(`client=${cid} clock=${clk} state=${raw.slice(0, 120)}`);
      }
      awarenessFrames.push(entries.join(' | '));
      console.log(`[awareness x${n}] ${entries.join('  ||  ')}`);
    } else if (type === MESSAGE_SYNC) {
      syncFrames++;
    } else if (type === MESSAGE_QUERY_AWARENESS) {
      otherFrames++;
      console.log('[query-awareness] a peer is asking who is in the room');
    } else {
      otherFrames++;
    }
  } catch (e) {
    console.log('[decode-error]', e.message);
  }
});

ws.on('error', (e) => console.log('[error]', e.message));
ws.on('close', () => console.log('[closed]'));

setTimeout(() => {
  console.log('\n--- summary ---');
  console.log(`sync frames        : ${syncFrames}`);
  console.log(`awareness frames   : ${awarenessFrames.length}`);
  console.log(`other frames       : ${otherFrames}`);
  if (awarenessFrames.length === 0) {
    console.log('VERDICT: no peer published any awareness frame in this window.');
  } else {
    console.log('VERDICT: awareness frames were seen:');
    for (const f of awarenessFrames.slice(0, 12)) console.log('  ' + f);
  }
  ws.close();
  process.exit(0);
}, SECONDS * 1000);
