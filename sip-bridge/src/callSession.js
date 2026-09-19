import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { encodeWavFromInt16 } from "./wav.js";
import { decodeMp3ToPcm } from "./ttsAudio.js";

// Asterisk's AudioSocket wire format: 1-byte frame type + 2-byte
// big-endian payload length + payload. 0x01 carries the call's own UUID
// once, right at connect; 0x10 carries raw 8kHz 16-bit mono PCM audio (in
// both directions); 0x00 signals hangup (from either side).
export const FRAME_TYPES = { HANGUP: 0x00, UUID: 0x01, AUDIO: 0x10 };

const SAMPLE_RATE = 8000;
const FRAME_MS = 20;
const FRAME_BYTES = (SAMPLE_RATE * FRAME_MS * 2) / 1000; // 320 bytes = 160 int16 samples/frame

// Same amplitude-threshold VAD as components/AiCallWidget.jsx, just run
// over 8kHz telephony PCM frames instead of 48kHz Web Audio samples — see
// that file's own comments for the reasoning behind each constant.
const START_THRESHOLD = 6;
const SILENCE_MS = 1200;
const MIN_SPEECH_MS = 400;
const PRE_ROLL_FRAMES = 20; // 20 * 20ms = 400ms, matching the widget's ~350ms pre-roll

// How long the caller can stay fully silent (not mid-utterance — SILENCE_MS
// above handles that) before the agent proactively checks in, escalating
// through 3 stages before giving up and hanging up on stage 4.
const SILENCE_STAGE_MS = 5000;

// How long to wait for the real /api/ai-call/turn reply before fetching and
// playing a "searching..." filler — see that route's own comments.
const FILLER_DELAY_MS = 1200;

/** Reads a raw little-endian 16-bit PCM buffer into a plain Array<number> —
 * deliberately not a typed-array view over the buffer, since frame payloads
 * sliced out of an incoming TCP chunk can land at an odd byteOffset, which
 * would silently misalign an Int16Array view over the same memory. */
function pcmBufferToInt16Array(buffer) {
  const count = Math.floor(buffer.length / 2);
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = buffer.readInt16LE(i * 2);
  return out;
}

function rmsPercent(frameBuffer) {
  const sampleCount = Math.floor(frameBuffer.length / 2);
  if (sampleCount === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const normalized = frameBuffer.readInt16LE(i * 2) / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / sampleCount) * 100;
}

/** One phone call, start to end — does for a real SIP call what
 * AiCallWidget.jsx does for a browser tab: capture audio, detect turns,
 * call the exact same /api/ai-call/* endpoints, and play back whatever
 * comes back. One instance per AudioSocket TCP connection. */
export class CallSession {
  constructor({ socket, authClient }) {
    this.socket = socket;
    this.authClient = authClient;

    this.sessionId = null;
    this.asteriskCallId = null;
    this.ended = false;

    this.armed = false;
    this.isRecording = false;
    this.speechStartMs = 0;
    this.lastLoudMs = 0;
    this.preRoll = [];
    this.recordedFrames = [];

    this.silenceTimeout = null;
    this.silenceStrike = 0;

    this.lastAiText = "";
  }

  sendFrame(type, payload = Buffer.alloc(0)) {
    if (this.socket.destroyed) return;
    const header = Buffer.alloc(3);
    header.writeUInt8(type, 0);
    header.writeUInt16BE(payload.length, 1);
    this.socket.write(Buffer.concat([header, payload]));
  }

  /** Dispatches one parsed AudioSocket frame — called by audiosocketServer's
   * TCP framing loop. */
  handleFrame(type, payload) {
    if (this.ended) return;
    if (type === FRAME_TYPES.UUID) {
      this.asteriskCallId = payload.toString("hex");
      this.start();
    } else if (type === FRAME_TYPES.AUDIO) {
      this.handleAudioFrame(payload);
    } else if (type === FRAME_TYPES.HANGUP) {
      this.end("caller hung up");
    }
  }

  handleSocketClosed() {
    this.end("socket closed");
  }

  handleSocketError(err) {
    console.error(`[sip-bridge] socket error: ${err.message}`);
    this.end("socket error");
  }

  /** Reserves a concurrency slot (see lib/aiCallCapacity.js) and plays the
   * greeting — the true start of the call, fired once Asterisk's own UUID
   * frame confirms the channel is up. */
  async start() {
    this.sessionId = randomUUID();
    console.log(`[sip-bridge] call starting: session=${this.sessionId} asterisk=${this.asteriskCallId}`);
    try {
      const res = await this.authClient.apiFetch(`/api/ai-call/start?sessionId=${this.sessionId}`);
      if (!res.ok) {
        // No generic "speak this text" endpoint exists outside an active
        // session, so a caller hitting capacity just hears nothing before
        // the hangup — see README.md for a suggested Asterisk-side busy
        // tone as a follow-up improvement.
        console.warn(`[sip-bridge] at capacity, hanging up session=${this.sessionId}`);
        this.end("at capacity");
        return;
      }
    } catch (err) {
      console.error(`[sip-bridge] /start failed: ${err.message}`);
      this.end("start failed");
      return;
    }
    await this.playGreeting();
  }

  async playGreeting() {
    try {
      const res = await this.authClient.apiFetch("/api/ai-call/greeting");
      if (!res.ok) throw new Error(`greeting failed (${res.status})`);
      this.lastAiText = decodeURIComponent(res.headers.get("x-reply-text") || "");
      const mp3 = Buffer.from(await res.arrayBuffer());
      await this.playResponse(mp3);
    } catch (err) {
      console.error(`[sip-bridge] greeting failed: ${err.message}`);
    }
    this.arm();
  }

  arm() {
    if (this.ended) return;
    this.armed = true;
    this.armSilenceWatchdog();
  }

  clearSilenceWatchdog() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  armSilenceWatchdog() {
    this.clearSilenceWatchdog();
    if (this.ended) return;
    this.silenceTimeout = setTimeout(() => this.handleSilenceTimeout(), SILENCE_STAGE_MS);
  }

  async handleSilenceTimeout() {
    if (this.ended || !this.armed) return;
    if (this.silenceStrike >= 3) {
      this.end("silence timeout");
      return;
    }
    const stage = this.silenceStrike;
    this.silenceStrike += 1;
    this.armed = false;
    try {
      const res = await this.authClient.apiFetch(`/api/ai-call/silence-check?stage=${stage}`);
      if (!res.ok) throw new Error(`silence-check failed (${res.status})`);
      this.lastAiText = decodeURIComponent(res.headers.get("x-reply-text") || "");
      const mp3 = Buffer.from(await res.arrayBuffer());
      await this.playResponse(mp3);
      this.arm();
    } catch (err) {
      console.error(`[sip-bridge] silence-check failed: ${err.message}`);
      this.arm();
    }
  }

  handleAudioFrame(payload) {
    if (!this.armed) return;

    this.preRoll.push(payload);
    if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();

    const volume = rmsPercent(payload);
    const now = Date.now();

    if (!this.isRecording) {
      if (volume > START_THRESHOLD) {
        this.isRecording = true;
        this.speechStartMs = now;
        this.lastLoudMs = now;
        this.recordedFrames = [...this.preRoll];
        this.clearSilenceWatchdog();
        this.silenceStrike = 0;
      }
      return;
    }

    this.recordedFrames.push(payload);
    if (volume > START_THRESHOLD) this.lastLoudMs = now;
    if (now - this.lastLoudMs > SILENCE_MS) {
      this.isRecording = false;
      const discard = this.lastLoudMs - this.speechStartMs < MIN_SPEECH_MS;
      this.finishRecording(discard);
    }
  }

  async finishRecording(discard) {
    const frames = this.recordedFrames;
    this.recordedFrames = [];

    if (discard || frames.length === 0) {
      this.arm();
      return;
    }

    this.armed = false;
    this.clearSilenceWatchdog();

    try {
      const pcm = pcmBufferToInt16Array(Buffer.concat(frames));
      const wav = encodeWavFromInt16(pcm, SAMPLE_RATE);

      const form = new FormData();
      form.append("sessionId", this.sessionId);
      form.append("audio", new Blob([wav], { type: "audio/wav" }), "turn.wav");
      const turnPromise = this.authClient.apiFetch("/api/ai-call/turn", { method: "POST", body: form });

      let settled = false;
      turnPromise.finally(() => {
        settled = true;
      });
      await delay(FILLER_DELAY_MS);

      // Mirrors AiCallWidget.jsx: a trailing "to'g'rimi?" means the caller
      // is confirming, which is what actually triggers a property search,
      // worth calling out with a more specific filler than the generic one.
      if (!settled) {
        const fillerType = this.lastAiText.trim().endsWith("to'g'rimi?") ? "confirm" : "question";
        await this.playFiller(fillerType);
      }

      const res = await turnPromise;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `turn failed (${res.status})`);
      }
      const transcript = decodeURIComponent(res.headers.get("x-transcript") || "");
      const replyText = decodeURIComponent(res.headers.get("x-reply-text") || "");
      console.log(`[sip-bridge] caller: ${transcript}`);
      console.log(`[sip-bridge] agent: ${replyText}`);
      this.lastAiText = replyText;
      const mp3 = Buffer.from(await res.arrayBuffer());
      await this.playResponse(mp3);
    } catch (err) {
      console.error(`[sip-bridge] turn failed: ${err.message}`);
    }
    this.arm();
  }

  async playFiller(type) {
    try {
      const res = await this.authClient.apiFetch(`/api/ai-call/filler?type=${type}`);
      if (!res.ok) return;
      const text = decodeURIComponent(res.headers.get("x-reply-text") || "");
      console.log(`[sip-bridge] filler: ${text}`);
      const mp3 = Buffer.from(await res.arrayBuffer());
      await this.playResponse(mp3);
    } catch {
      // Best-effort — a missed filler just means the caller hears silence a
      // little longer while the real turn keeps processing in the background.
    }
  }

  /** Decodes an MP3 response into 8kHz PCM and streams it back over the
   * AudioSocket as a sequence of 20ms frames, paced in real time so
   * Asterisk plays it back at the correct speed instead of receiving (and
   * buffering, or dropping) it all at once. Resolves once fully sent. */
  async playResponse(mp3Buffer) {
    const pcm = await decodeMp3ToPcm(mp3Buffer, SAMPLE_RATE);
    for (let offset = 0; offset < pcm.length; offset += FRAME_BYTES) {
      if (this.ended) return;
      const chunk = pcm.subarray(offset, Math.min(offset + FRAME_BYTES, pcm.length));
      this.sendFrame(FRAME_TYPES.AUDIO, chunk);
      await delay(FRAME_MS);
    }
  }

  /** Releases the concurrency slot and closes the AudioSocket connection —
   * called from every termination path (caller hangup, silence timeout,
   * capacity rejection, socket error). */
  end(reason) {
    if (this.ended) return;
    this.ended = true;
    this.armed = false;
    this.clearSilenceWatchdog();
    console.log(`[sip-bridge] call ended (${reason}): session=${this.sessionId}`);
    if (this.sessionId) {
      this.authClient.apiFetch(`/api/ai-call/end?sessionId=${this.sessionId}`, { method: "POST" }).catch(() => {});
    }
    this.sendFrame(FRAME_TYPES.HANGUP);
    this.socket.end();
  }
}
