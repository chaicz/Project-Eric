// Poll the relay's /rooms endpoint and report the awareness entries for a
// room over time. Used to check whether a long-lived connection keeps
// its presence published (the y-protocols awareness timeout is 30s).
//
// Usage: node scripts/collab-awareness-poll.cjs <room> [seconds]

const http = require('http');

const ROOM = process.argv[2] || 'NHPV-QMK8';
const SECONDS = Number(process.argv[3] || 70);

async function getRooms() {
  return new Promise((res, rej) => {
    http.get('http://127.0.0.1:1234/rooms', (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  console.log(`Polling awareness for room ${ROOM} for ${SECONDS}s`);
  const t0 = Date.now();
  while (Date.now() - t0 < SECONDS * 1000) {
    const rooms = await getRooms();
    const r = rooms.find((x) => x.name === ROOM);
    const aw = (r && r.awareness) || [];
    const users = aw.map((a) => `${a.name || '?'}(${a.userId || 'no-id'})`);
    console.log(
      `t=${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s  ` +
      `clients=${r ? r.clients : '?'}  awareness=${aw.length}  ${users.join(', ')}`
    );
    await new Promise((r2) => setTimeout(r2, 5000));
  }
})();
