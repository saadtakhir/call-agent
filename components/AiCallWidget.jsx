"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Loader2, Download } from "lucide-react";

// Lightweight amplitude-threshold VAD (voice activity detection), not a
// real ML model — good enough to feel like a live call for this
// experimental widget without needing a persistent WebSocket/WebRTC
// backend, which Vercel's serverless functions can't host anyway. Tune
// these three if it cuts people off too early/late or triggers on
// background noise.
const START_THRESHOLD = 6; // RMS*100 of the mic signal — speech is well above this, room noise well below
const SILENCE_MS = 1200; // how long a pause must last before a turn is considered "done"
const MIN_SPEECH_MS = 400; // shorter than this is treated as noise, not speech, and discarded

// A voice call has no visual "your turn" cue the way a chat UI does, so if
// the caller just never says anything (not a mid-utterance pause — SILENCE_MS
// above handles that — but total silence while "listening"), the widget
// needs to say SOMETHING rather than sit there indefinitely. Two-stage: a
// short "are you there?" prompt first, then a hangup if that ALSO goes
// unanswered, so the call never stays open forever.
const SILENCE_CHECK_MS = 5000;
const SILENCE_HANGUP_MS = 10000;

// How long to wait for the real answer before playing the "searching"
// filler at all — a fast reply (a quick acknowledgment, no tool call
// needed) can land well under this, and playing "Bir daqiqa..." in front of
// an already-ready answer is exactly as jarring as silence in front of a
// slow one. Only turns that are ACTUALLY still running past this get one.
const FILLER_DELAY_MS = 1200;

// Raw PCM capture (via ScriptProcessorNode) instead of MediaRecorder — a
// MediaRecorder.start() called exactly when the threshold is crossed loses
// the first ~100-300ms of audio to encoder startup latency, which in
// practice clips the very first syllable of a turn and was the single
// biggest cause of bad transcriptions. Capturing raw samples continuously
// into a small rolling PRE_ROLL_CHUNKS buffer and splicing that in the
// moment speech is detected means the sent clip always includes the true
// onset. ScriptProcessorNode is deprecated in favor of AudioWorklet, but
// needs no separate worklet file to load and still works everywhere that
// matters here — an acceptable tradeoff for this experimental tool.
const PROCESSOR_BUFFER_SIZE = 4096;
const PRE_ROLL_CHUNKS = 4; // ~350ms at a 48kHz native sample rate

const PHASE_LABELS = {
  idle: "Tugallandi",
  queued: "Navbatda kutilmoqda...",
  connecting: "Mikrofon so'ralmoqda...",
  listening: "Tinglayapman...",
  recording: "Eshityapman...",
  processing: "O'ylab ko'ryapman...",
  speaking: "Gapiryapman...",
};

// How often to re-check capacity while queued behind other active calls
// (see /api/ai-call/start) — no server push available (Vercel's serverless
// functions can't hold a WebSocket open), so this just polls.
const QUEUE_POLL_MS = 4000;

function rmsPercent(samples) {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / samples.length) * 100;
}

/** Encodes raw Float32 PCM samples as a standalone mono 16-bit WAV file —
 * unlike a MediaRecorder chunk, a WAV built this way is fully self-contained
 * (its own header), so it decodes correctly regardless of when the capture
 * started, which is exactly what's needed for splicing in the pre-roll. */
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AiCallWidget() {
  const [phase, setPhase] = useState("idle");
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState(null);

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const silentGainRef = useRef(null);
  const preRollRef = useRef([]); // rolling Float32Array chunks, always kept even while not recording
  const recordedChunksRef = useRef([]); // chunks for the utterance currently being captured
  const audioElRef = useRef(null);
  const sessionIdRef = useRef("");
  const queueActiveRef = useRef(false); // true while the queue-retry loop in startCall is polling

  const armedRef = useRef(false); // false while sending/waiting/playing — ignores mic input
  const callActiveRef = useRef(false);
  const isRecordingRef = useRef(false);
  const speechStartRef = useRef(0);
  const lastLoudRef = useRef(0);

  // Both prefetched once per call (see startCall) so finishRecording can
  // play the right one the INSTANT recording ends, with zero server round
  // trip — previously the filler only came back after the server had
  // already finished transcribing, which defeated half the point of
  // having one at all. Which one plays depends on whether the caller was
  // just answering a plain question or confirming one (see
  // lastAiTextRef/finishRecording) — the confirm case is the one that
  // actually triggers a get_property_info search.
  const fillerRef = useRef({ question: null, confirm: null }); // { blob, text } per type once loaded
  const lastAiTextRef = useRef(""); // the AI's most recent spoken line — checked for a trailing "to'g'rimi?"

  const silenceTimeoutRef = useRef(null);
  const silenceStrikeRef = useRef(0); // 0 = no "are you there?" sent yet; 1 = sent once, next timeout hangs up

  const timerIntervalRef = useRef(null);
  const callStartRef = useRef(0);

  // Full-call recording: both the mic (via the same graph the VAD already
  // uses) and every played AI reply are routed into one shared
  // MediaStreamAudioDestinationNode, which a separate MediaRecorder
  // captures continuously for the whole call — since this app is
  // half-duplex (only one side's audio exists at any moment), sequential
  // mixing is a faithful, simple recording of the actual conversation.
  const recordingDestRef = useRef(null);
  const recordingRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);

  // Releases this call's concurrency slot. Uses sendBeacon when available
  // since this also runs from pagehide (tab closed/navigated away) — a
  // regular fetch there isn't guaranteed to finish before the page unloads,
  // while a beacon is queued by the browser to fire regardless.
  function notifyCallEnded(sessionId) {
    if (!sessionId) return;
    const url = `/api/ai-call/end?sessionId=${encodeURIComponent(sessionId)}`;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob());
      else fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    } catch {
      // Best-effort — a missed release just means this slot self-expires
      // via the server's own staleness window instead.
    }
  }

  useEffect(() => {
    const handlePageHide = () => notifyCallEnded(sessionIdRef.current);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      endCall();
    };
  }, []);

  /** Plays one audio blob and resolves once it actually finishes — no phase/
   * mic side effects, just playback (routed into the call recording graph
   * the same way every AI clip is). Used directly for a clip that ISN'T the
   * end of the turn (a filler clip, played while the real answer is still
   * being computed in parallel) — see playAudioAndResume below for
   * the version that also re-arms the mic afterward. */
  function playBlob(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audioEl = new Audio(url);
      audioElRef.current = audioEl;
      // Redirects this element's output through the Web Audio graph so it
      // also reaches the recording destination — must still be connected
      // to audioContext.destination explicitly, or the caller would hear
      // nothing (createMediaElementSource takes over the element's normal
      // output entirely).
      if (audioContextRef.current && recordingDestRef.current) {
        try {
          const elSource = audioContextRef.current.createMediaElementSource(audioEl);
          elSource.connect(audioContextRef.current.destination);
          elSource.connect(recordingDestRef.current);
        } catch {
          // Routing failed for some reason — playback still works normally,
          // this turn's AI audio just won't be in the recording.
        }
      }
      audioEl.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audioEl.play();
    });
  }

  function clearSilenceWatchdog() {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }

  /** (Re)starts the "caller went quiet" timer from whatever moment we return
   * to idle-listening — 5s for the first check, then (once that's already
   * been sent) 10s more before giving up and hanging up. Cleared the moment
   * real speech is detected (see handleAudioProcess). */
  function armSilenceWatchdog() {
    clearSilenceWatchdog();
    if (!callActiveRef.current) return;
    const delay = silenceStrikeRef.current === 0 ? SILENCE_CHECK_MS : SILENCE_HANGUP_MS;
    silenceTimeoutRef.current = setTimeout(handleSilenceTimeout, delay);
  }

  /** Fires when the caller has been silent for SILENCE_CHECK_MS (first time)
   * or SILENCE_HANGUP_MS (after the "are you there?" prompt already played
   * once with still no response) — plays a proactive check-in, or ends the
   * call outright the second time. */
  async function handleSilenceTimeout() {
    if (!callActiveRef.current || !armedRef.current) return;
    if (silenceStrikeRef.current >= 1) {
      endCall();
      return;
    }
    silenceStrikeRef.current = 1;
    armedRef.current = false;
    try {
      const res = await fetch("/api/ai-call/silence-check");
      if (!res.ok) throw new Error(`Xatolik (${res.status})`);
      const replyText = decodeURIComponent(res.headers.get("X-Reply-Text") || "");
      setLog((prev) => [...prev, { role: "ai", text: replyText }]);
      lastAiTextRef.current = replyText;
      const audioBlob = await res.blob();
      // playAudioAndResume re-arms and re-runs armSilenceWatchdog, which by
      // then sees silenceStrikeRef === 1 and schedules the SILENCE_HANGUP_MS
      // timer instead of another check.
      await playAudioAndResume(audioBlob);
    } catch {
      if (callActiveRef.current) {
        armedRef.current = true;
        setPhase("listening");
        armSilenceWatchdog();
      }
    }
  }

  /** Plays one response clip, then — once it actually finishes — re-arms the
   * mic and returns to "listening" (or "idle" if the call was ended while it
   * was playing). Used for whatever clip actually ends the turn — the
   * greeting, a direct reply with no tool call, or the real answer after a
   * pending tool call's filler has already played. */
  async function playAudioAndResume(blob) {
    setPhase("speaking");
    await playBlob(blob);
    if (callActiveRef.current) {
      armedRef.current = true;
      setPhase("listening");
      armSilenceWatchdog();
    } else {
      setPhase("idle");
    }
  }

  /** Loads both filler clips once at call start (fire-and-forget — called
   * without awaiting from startCall, while the greeting plays) so whichever
   * one finishRecording needs is already in memory by the time it's asked
   * for. If a turn happens to finish before this resolves, or a given type
   * failed to load, that one turn just plays no filler — a missing filler
   * was always a tolerated fallback here, never a hard requirement. */
  async function prefetchFillers() {
    async function load(type) {
      try {
        const res = await fetch(`/api/ai-call/filler?type=${type}`);
        if (!res.ok) return null;
        const text = decodeURIComponent(res.headers.get("X-Reply-Text") || "");
        const blob = await res.blob();
        return { blob, text };
      } catch {
        return null;
      }
    }
    const [question, confirm] = await Promise.all([load("question"), load("confirm")]);
    fillerRef.current = { question, confirm };
  }

  /** The call's fixed opening line (see CALL_GREETING_TEXT in
   * lib/aiCallService.js) — played once right after the mic is set up and
   * BEFORE it's armed, so the greeting itself is never picked up as if the
   * caller had said it, and never goes through STT/the agent at all. */
  async function playGreeting() {
    try {
      const res = await fetch("/api/ai-call/greeting");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Xatolik (${res.status})`);
      }
      const replyText = decodeURIComponent(res.headers.get("X-Reply-Text") || "");
      setLog((prev) => [...prev, { role: "ai", text: replyText }]);
      lastAiTextRef.current = replyText;
      const audioBlob = await res.blob();
      await playAudioAndResume(audioBlob);
    } catch (err) {
      setError(err.message);
      if (callActiveRef.current) {
        armedRef.current = true;
        setPhase("listening");
        armSilenceWatchdog();
      } else {
        setPhase("idle");
      }
    }
  }

  function handleAudioProcess(e) {
    if (!armedRef.current) return;
    const input = e.inputBuffer.getChannelData(0);
    const chunk = new Float32Array(input); // copy — the underlying buffer is reused by the browser

    preRollRef.current.push(chunk);
    if (preRollRef.current.length > PRE_ROLL_CHUNKS) preRollRef.current.shift();

    const volume = rmsPercent(chunk);
    const now = Date.now();

    if (!isRecordingRef.current) {
      if (volume > START_THRESHOLD) {
        isRecordingRef.current = true;
        speechStartRef.current = now;
        lastLoudRef.current = now;
        // Includes the pre-roll (the current chunk is already its last
        // element, just pushed above) so the true onset isn't clipped.
        recordedChunksRef.current = [...preRollRef.current];
        setPhase("recording");
        // The caller made SOME sound — cancel the "are you there?" timer and
        // reset its strike count, even if this turns out to be too short to
        // count as real speech (finishRecording's own discard path re-arms
        // the watchdog from scratch for the next silence window).
        clearSilenceWatchdog();
        silenceStrikeRef.current = 0;
      }
      return;
    }

    recordedChunksRef.current.push(chunk);
    if (volume > START_THRESHOLD) lastLoudRef.current = now;
    if (now - lastLoudRef.current > SILENCE_MS) {
      isRecordingRef.current = false;
      const discard = lastLoudRef.current - speechStartRef.current < MIN_SPEECH_MS;
      setPhase("processing");
      finishRecording(discard);
    }
  }

  async function finishRecording(discard) {
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);

    if (discard || totalLength === 0) {
      if (callActiveRef.current) {
        setPhase("listening");
        armSilenceWatchdog();
      } else {
        setPhase("idle");
      }
      return;
    }

    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      samples.set(c, offset);
      offset += c.length;
    }
    const wavBlob = encodeWav(samples, audioContextRef.current.sampleRate);

    armedRef.current = false;
    try {
      const form = new FormData();
      form.append("audio", wavBlob, "turn.wav");
      form.append("sessionId", sessionIdRef.current);
      // Fired the INSTANT recording ends, before STT/the agent/TTS have even
      // started — the caller hears the filler (if one ends up playing at
      // all) with zero server round trip, not after waiting for a first
      // server response to hand it back.
      const turnPromise = fetch("/api/ai-call/turn", { method: "POST", body: form });

      let turnSettled = false;
      turnPromise.finally(() => {
        turnSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, FILLER_DELAY_MS));

      // The caller is responding to whatever the AI just asked — a trailing
      // "to'g'rimi?" means they're confirming, which is what actually
      // triggers a get_property_info search (see the system prompt's
      // section 4), so that's the moment worth a "qidiryapman" filler
      // instead of the plain generic one.
      const fillerType = lastAiTextRef.current.trim().endsWith("to'g'rimi?") ? "confirm" : "question";
      const filler = fillerRef.current[fillerType];
      if (!turnSettled && filler) {
        setLog((prev) => [...prev, { role: "ai", text: filler.text }]);
        setPhase("speaking");
        await playBlob(filler.blob);
      }
      setPhase("processing");

      const res = await turnPromise;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Xatolik (${res.status})`);
      }

      const transcript = decodeURIComponent(res.headers.get("X-Transcript") || "");
      const replyText = decodeURIComponent(res.headers.get("X-Reply-Text") || "");
      setLog((prev) => [...prev, { role: "user", text: transcript }, { role: "ai", text: replyText }]);
      lastAiTextRef.current = replyText;
      const audioBlob = await res.blob();
      await playAudioAndResume(audioBlob);
    } catch (err) {
      setError(err.message);
      if (callActiveRef.current) {
        armedRef.current = true;
        setPhase("listening");
        armSilenceWatchdog();
      } else {
        setPhase("idle");
      }
    }
  }

  /** Cancels an in-progress queue wait (see startCall below) — endCall()
   * also calls this, since while queued there's no real call yet for
   * "tugatish" to hang up, only a wait to give up on. */
  function cancelQueue() {
    queueActiveRef.current = false;
  }

  async function startCall() {
    setError("");
    setLog([]);
    setPhase("connecting");
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);

    // Checked before even asking for mic permission — no point prompting
    // for the mic just to immediately fail once the concurrent-call limit
    // (see MAX_CONCURRENT_CALLS) is hit. A 429 here means every slot is
    // taken, not a hard failure, so instead of giving up this polls until
    // one frees up (or the caller cancels) rather than erroring out on
    // whoever happens to click 4th.
    const newSessionId = crypto.randomUUID();
    queueActiveRef.current = true;
    let gotSlot = false;
    while (queueActiveRef.current) {
      try {
        const capacityRes = await fetch(`/api/ai-call/start?sessionId=${newSessionId}`);
        if (capacityRes.ok) {
          gotSlot = true;
          break;
        }
        if (capacityRes.status !== 429) {
          const data = await capacityRes.json().catch(() => ({}));
          throw new Error(data.error || `Xatolik (${capacityRes.status})`);
        }
      } catch (err) {
        setError(err.message);
        setPhase("idle");
        queueActiveRef.current = false;
        return;
      }
      setPhase("queued");
      await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_MS));
    }
    if (!gotSlot) {
      // Cancelled while queued (see cancelQueue/endCall) — nothing to clean
      // up, since no slot was ever actually reserved.
      setPhase("idle");
      return;
    }
    setPhase("connecting");
    sessionIdRef.current = newSessionId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);

      const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
      processor.onaudioprocess = handleAudioProcess;
      // ScriptProcessorNode only fires onaudioprocess while connected through
      // to a destination — routed through a silent gain node so the mic
      // audio itself is never actually played back (no echo/feedback).
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      // Full-call recording graph — mic feeds in directly here too; each
      // AI reply is routed in from playAudioAndResume as it plays.
      const recordingDest = audioContext.createMediaStreamDestination();
      source.connect(recordingDest);
      recordingDestRef.current = recordingDest;
      const recordingMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recordingRecorder = new MediaRecorder(recordingDest.stream, { mimeType: recordingMimeType });
      recordingChunksRef.current = [];
      recordingRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recordingRecorder.start(1000);
      recordingRecorderRef.current = recordingRecorder;

      preRollRef.current = [];
      recordedChunksRef.current = [];
      callActiveRef.current = true;
      armedRef.current = false; // stays unarmed until the greeting finishes playing
      isRecordingRef.current = false;
      silenceStrikeRef.current = 0;
      fillerRef.current = { question: null, confirm: null };
      lastAiTextRef.current = "";
      prefetchFillers(); // fire-and-forget, loads alongside the greeting below

      callStartRef.current = Date.now();
      setElapsedSec(0);
      timerIntervalRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);

      await playGreeting();
    } catch (err) {
      notifyCallEnded(sessionIdRef.current); // capacity slot was already reserved above
      setError(`Mikrofonga ruxsat berilmadi: ${err.message}`);
      setPhase("idle");
    }
  }

  function endCall() {
    cancelQueue();
    notifyCallEnded(sessionIdRef.current);
    callActiveRef.current = false;
    armedRef.current = false;
    clearSilenceWatchdog();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    processorRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const audioContext = audioContextRef.current;
    if (recordingRecorderRef.current && recordingRecorderRef.current.state !== "inactive") {
      const recorder = recordingRecorderRef.current;
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType });
        recordingChunksRef.current = [];
        // MediaRecorder can't record straight to WAV (webm/opus is the only
        // thing it can actually produce here) — decoded back to raw PCM and
        // re-encoded with the same encodeWav used for per-turn clips, so the
        // downloaded file is an ordinary .wav instead of the less
        // universally-playable webm container.
        if (blob.size > 0) {
          try {
            const decodeContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
            const decoded = await decodeContext.decodeAudioData(await blob.arrayBuffer());
            const wavBlob = encodeWav(decoded.getChannelData(0), decoded.sampleRate);
            setRecordingUrl(URL.createObjectURL(wavBlob));
          } catch {
            setRecordingUrl(URL.createObjectURL(blob)); // decode failed — still offer the original webm
          }
        }
        // Closed only now — closing it before the recorder flushes its
        // final buffered audio could cut off the last moment of the call.
        audioContext?.close().catch(() => {});
      };
      recorder.stop();
    } else {
      audioContext?.close().catch(() => {});
    }
    audioElRef.current?.pause();
    setPhase("idle");
  }

  const inCall = phase !== "idle";

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>AI qo&apos;ng&apos;iroq (test)</h2>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Tajriba uchun: brauzer orqali AI bilan jonli suhbat. Ovoz OpenAI orqali matnga aylantiriladi, javobni
        e-content.uz&apos;ning o&apos;zi (OpenAI) o&apos;ylab topadi, ElevenLabs uni ovozga aylantirib qaytaradi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="section" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {!inCall ? (
          <button className="btn btn-green" onClick={startCall}>
            <Phone size={14} />
            Qo&apos;ng&apos;iroqni boshlash
          </button>
        ) : (
          <button className="btn btn-danger" onClick={endCall}>
            <PhoneOff size={14} />
            {phase === "queued" ? "Bekor qilish" : "Qo'ng'iroqni tugatish"}
          </button>
        )}
        <span className={`status-pill ${phase === "idle" ? "status-gray" : phase === "speaking" ? "status-green" : "status-amber"}`}>
          {(phase === "connecting" || phase === "processing" || phase === "queued") && <Loader2 size={12} className="spin" />}
          {PHASE_LABELS[phase]}
        </span>
        {inCall && phase !== "queued" && (
          <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{formatDuration(elapsedSec)}</span>
        )}
      </div>

      {recordingUrl && (
        <div className="section">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Suhbat yozuvi</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <audio controls src={recordingUrl} style={{ maxWidth: "100%" }} />
            <a className="btn btn-outline" href={recordingUrl} download="suhbat.wav">
              <Download size={14} />
              Yuklab olish
            </a>
          </div>
        </div>
      )}

      <div className="section">
        {log.length === 0 ? (
          <p className="muted">Suhbat hali boshlanmagan.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.map((item, i) => (
              <div key={i} style={{ alignSelf: item.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                <span className="muted" style={{ display: "block", fontSize: "0.75rem", marginBottom: 2 }}>
                  {item.role === "user" ? "Siz" : "AI"}
                </span>
                <div className={`status-pill ${item.role === "user" ? "status-gray" : "status-green"}`} style={{ display: "inline", whiteSpace: "normal" }}>
                  {item.text || <span className="muted">(bo&apos;sh)</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
