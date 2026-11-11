// billdSession.js
// ---------------------------------------------------------------------------
// The WebRTC half of the BilldDesk remote-desktop protocol.
//
// BilldDesk splits the remote-desktop flow in two:
//
//   1. signaling  — a socket.io room carries the SDP offer/answer and the
//                   ICE candidates (see `billdDeskService.js`),
//   2. media      — a peer connection carries the screen video and a
//                   `MessageChannel` data channel that carries mouse and
//                   keyboard behaviour messages.
//
// This module owns the peer connection and the data channel so the host
// page (`/collab`) and the guest page (`/remote`) stay in sync with the
// upstream message format:
//
//   offer / answer : { live_room_id, sender, receiver, sdp }
//   candidate      : { live_room_id, sender, receiver, candidate }
//   behaviour      : { roomId, sender, receiver, type, key }
//
// The behaviour `type` is the upstream `BilldDeskBehaviorEnum` value and
// `key` carries the coordinates / key strokes.

import {
  BILLD_BEHAVIOR,
  BILLD_ICE_SERVERS,
  BILLD_MSG,
  billdEnvelope,
  billdRequestId,
} from './billdDeskService';

/**
 * Create a peer connection wired for the BilldDesk flow.
 *
 * @param {object} opts
 * @param {(candidate: RTCIceCandidateInit) => void} [opts.onIceCandidate]
 * @param {(stream: MediaStream) => void} [opts.onTrack]
 * @param {(channel: RTCDataChannel) => void} [opts.onDataChannel]
 * @param {(state: string) => void} [opts.onConnectionState]
 * @returns {RTCPeerConnection}
 */
export function createBilldPeer({ onIceCandidate, onTrack, onDataChannel, onConnectionState } = {}) {
  const pc = new RTCPeerConnection({ iceServers: BILLD_ICE_SERVERS });

  if (onIceCandidate) {
    pc.onicecandidate = (event) => {
      if (event.candidate) onIceCandidate(event.candidate.toJSON());
    };
  }
  if (onTrack) {
    pc.ontrack = (event) => {
      const [stream] = event.streams || [];
      if (stream) onTrack(stream);
    };
  }
  if (onDataChannel) {
    pc.ondatachannel = (event) => onDataChannel(event.channel);
  }
  if (onConnectionState) {
    pc.onconnectionstatechange = () => onConnectionState(pc.connectionState);
  }
  return pc;
}

/**
 * Attach a captured screen stream to the peer connection.
 * @param {RTCPeerConnection} pc
 * @param {MediaStream} stream
 */
export function attachScreenStream(pc, stream) {
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
}

/**
 * Host side: answer an offer that arrived over the signaling socket.
 *
 * @param {object} opts
 * @param {RTCPeerConnection} opts.pc
 * @param {import('socket.io-client').Socket} opts.socket
 * @param {string} opts.roomId
 * @param {string} opts.guestSocketId
 * @param {RTCSessionDescriptionInit} opts.sdp
 */
export async function answerOffer({ pc, socket, roomId, guestSocketId, sdp }) {
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit(
    BILLD_MSG.answer,
    billdEnvelope(socket, {
      live_room_id: roomId,
      sender: socket.id,
      receiver: guestSocketId,
      sdp: pc.localDescription,
    }, billdRequestId()),
  );
}

/**
 * Guest side: send an offer to the host.
 *
 * @param {object} opts
 * @param {RTCPeerConnection} opts.pc
 * @param {import('socket.io-client').Socket} opts.socket
 * @param {string} opts.roomId
 * @param {string} opts.hostSocketId
 */
export async function sendOffer({ pc, socket, roomId, hostSocketId }) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit(
    BILLD_MSG.offer,
    billdEnvelope(socket, {
      isRemoteDesk: true,
      live_room_id: roomId,
      sender: socket.id,
      receiver: hostSocketId,
      sdp: pc.localDescription,
    }, billdRequestId()),
  );
}

/**
 * Relay an ICE candidate to the peer.
 *
 * @param {object} opts
 * @param {import('socket.io-client').Socket} opts.socket
 * @param {string} opts.roomId
 * @param {string} opts.receiver
 * @param {RTCIceCandidateInit} opts.candidate
 */
export function sendCandidate({ socket, roomId, receiver, candidate }) {
  socket.emit(
    BILLD_MSG.candidate,
    billdEnvelope(socket, {
      live_room_id: roomId,
      sender: socket.id,
      receiver,
      candidate,
    }, billdRequestId()),
  );
}

/**
 * Send a mouse / keyboard behaviour message over the data channel.
 *
 * @param {RTCDataChannel} channel
 * @param {object} opts
 * @param {string} opts.roomId
 * @param {string} opts.sender
 * @param {string} opts.receiver
 * @param {number} opts.type   One of `BILLD_BEHAVIOR`.
 * @param {Array} [opts.key]
 */
export function sendBehavior(channel, { roomId, sender, receiver, type, key = [0] }) {
  if (!channel || channel.readyState !== 'open') return false;
  channel.send(
    JSON.stringify({
      msgType: BILLD_MSG.behavior,
      requestId: billdRequestId(),
      data: { roomId, sender, receiver, type, key },
    }),
  );
  return true;
}

/**
 * Parse a behaviour message that arrived on the data channel.
 * @param {string|ArrayBuffer} raw
 * @returns {{type: number, key: Array, roomId?: string}|null}
 */
export function parseBehavior(raw) {
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const parsed = JSON.parse(text);
    if (parsed?.msgType !== BILLD_MSG.behavior) return null;
    const data = parsed.data || {};
    return {
      type: Number(data.type),
      key: Array.isArray(data.key) ? data.key : [0],
      roomId: data.roomId || '',
    };
  } catch {
    return null;
  }
}

/**
 * Convert a pointer event on the guest's video element into the
 * coordinates BilldDesk expects (the remote screen size).
 *
 * @param {MouseEvent} event
 * @param {HTMLVideoElement} video
 * @param {{width: number, height: number}} screenSize
 * @returns {[number, number]}
 */
export function pointerToRemote(event, video, screenSize) {
  const rect = video.getBoundingClientRect();
  const ratioX = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  const ratioY = rect.height ? (event.clientY - rect.top) / rect.height : 0;
  const x = Math.round(ratioX * (screenSize?.width || rect.width || 1));
  const y = Math.round(ratioY * (screenSize?.height || rect.height || 1));
  return [x, y];
}

export { BILLD_BEHAVIOR, BILLD_MSG };

export default {
  createBilldPeer,
  attachScreenStream,
  answerOffer,
  sendOffer,
  sendCandidate,
  sendBehavior,
  parseBehavior,
  pointerToRemote,
};
