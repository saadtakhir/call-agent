import net from "node:net";
import { CallSession } from "./callSession.js";

/** A plain TCP server implementing Asterisk's AudioSocket wire format —
 * the dialplan's AudioSocket() app connects here once per call. Frames are
 * length-prefixed (1-byte type + 2-byte big-endian length + payload), so
 * incoming TCP chunks are buffered and re-sliced into whole frames here
 * before being handed to a CallSession one at a time. */
export function startAudioSocketServer({ port, authClient }) {
  const server = net.createServer((socket) => {
    const session = new CallSession({ socket, authClient });
    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
      while (buffer.length >= 3) {
        const type = buffer.readUInt8(0);
        const len = buffer.readUInt16BE(1);
        if (buffer.length < 3 + len) break; // wait for the rest of this frame
        const payload = buffer.subarray(3, 3 + len);
        buffer = buffer.subarray(3 + len);
        session.handleFrame(type, payload);
      }
    });

    socket.on("close", () => session.handleSocketClosed());
    socket.on("error", (err) => session.handleSocketError(err));
  });

  server.on("error", (err) => {
    console.error(`[sip-bridge] AudioSocket server error: ${err.message}`);
  });

  server.listen(port, () => {
    console.log(`[sip-bridge] AudioSocket server listening on port ${port}`);
  });

  return server;
}
