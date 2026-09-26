"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Phone, PhoneOff, Loader2, Download } from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabasePublicConfig";

// A shared client is fine to create once at module scope — it holds no
// per-call state itself, just the connection Realtime channels attach to.
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Lightweight amplitude-threshold VAD (voice activity detection), not a
// real ML model — good enough to feel like a live call for this
// experimental widget without needing a persistent WebSocket/WebRTC
// backend, which Vercel's serverless functions can't host anyway. Tune
// these three if it cuts people off too early/late or triggers on
// background noise.
const START_THRESHOLD = 6; // RMS*100 of the mic signal — speech is well above this, room noise well below
const SILENCE_MS = 700; // how long a pause must last before a turn is considered "done"
const MIN_SPEECH_MS = 400; // shorter than this is treated as noise, not speech, and discarded

// A voice call has no visual "your turn" cue the way a chat UI does, so if
// the caller just never says anything (not a mid-utterance pause — SILENCE_MS
// above handles that — but total silence while "listening"), the widget
// needs to say SOMETHING rather than sit there indefinitely. Four stages,
// evenly spaced: at 5s "Siz shu yerdamisiz?", at 10s "Eshitib turibsizmi?",
// at 15s a warning that the call is about to end, at 20s it actually hangs
// up — see SILENCE_STAGE_TEXT_KEYS/handleSilenceTimeout below.
const SILENCE_STAGE_MS = 5000;

// How long to wait for the real answer before playing the "searching"
// filler at all — a fast reply (a quick acknowledgment, no tool call
// needed) can land well under this, and playing "Bir daqiqa..." in front of
// an already-ready answer is exactly as jarring as silence in front of a
// slow one. Only turns that are ACTUALLY still running past this get one.
const FILLER_DELAY_MS = 1200;

// A caller's utterance shorter than this (measured start-of-speech to
// last-loud-moment) is very likely a brief "rahmat, xayr"/"ha"/"yo'q"
// rather than a new question — a "let me think/search" filler in front of
// what's about to be a short farewell reply reads as an odd non-sequitur.
// Only gates the generic "question" filler; "confirm" (a short "ha"
// answering a to'g'rimi? prompt) always keeps its filler regardless of
// length, since that's exactly when a real get_property_info search
// actually starts.
const SHORT_UTTERANCE_MS = 1200;

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
  connecting: "Ulanmoqda...",
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
  const fillerRef = useRef({ question: [], confirm: [] }); // Array<{ key, blob, text }> per type once loaded
  const fillerIndexRef = useRef({ question: 0, confirm: 0 }); // rotates through the loaded variants, no immediate repeat
  const lastAiTextRef = useRef(""); // the AI's most recent spoken line — checked for a trailing "to'g'rimi?"
  // Language the call is in ("uz" | "ru" | "en") — follows what the AI last answered in, reported by
  // /turn's X-Reply-Lang header. Decides which language the filler / silence clips are spoken in.
  const langRef = useRef("uz");

  const silenceTimeoutRef = useRef(null);
  const silenceStrikeRef = useRef(0); // 0-2 = which silence prompt fires next; 3+ = next timeout hangs up

  const timerIntervalRef = useRef(null);
  const callStartRef = useRef(0);
  // Max-call-duration limit, enforced right here with a single timer (the
  // server sends the limit back from /api/ai-call/start) — no polling.
  const maxDurationTimeoutRef = useRef(null);
  const maxDurationMinutesRef = useRef(0);
  const hangupChannelRef = useRef(null);
  const greetingPrefetchRef = useRef(null); // Promise<Response|null> started at call start, see startCall

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
   * to idle-listening — always SILENCE_STAGE_MS, regardless of stage, since
   * every stage is evenly spaced (5s/10s/15s/20s from the start of the
   * silence, i.e. 5s from whichever stage just fired). Cleared the moment
   * real speech is detected (see handleAudioProcess). */
  function armSilenceWatchdog() {
    clearSilenceWatchdog();
    if (!callActiveRef.current) return;
    silenceTimeoutRef.current = setTimeout(handleSilenceTimeout, SILENCE_STAGE_MS);
  }

  /** Fires every SILENCE_STAGE_MS the caller stays silent — plays the next
   * escalating check-in (stage 0/1/2, see /api/ai-call/silence-check's own
   * ?stage= handling), or ends the call outright once all three have
   * already played with still no response. */
  async function handleSilenceTimeout() {
    if (!callActiveRef.current || !armedRef.current) return;
    if (silenceStrikeRef.current >= 3) {
      endCall();
      return;
    }
    const stage = silenceStrikeRef.current;
    silenceStrikeRef.current += 1;
    armedRef.current = false;
    try {
      const res = await fetch(`/api/ai-call/silence-check?stage=${stage}&lang=${langRef.current}`);
      if (!res.ok) throw new Error(`Xatolik (${res.status})`);
      const replyText = decodeURIComponent(res.headers.get("X-Reply-Text") || "");
      setLog((prev) => [...prev, { role: "ai", text: replyText }]);
      lastAiTextRef.current = replyText;
      const audioBlob = await res.blob();
      // playAudioAndResume re-arms and re-runs armSilenceWatchdog, which
      // schedules the next stage (or the hangup check) another
      // SILENCE_STAGE_MS out.
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

  /** Loads up to 3 variants of each filler type once at call start (fire-
   * and-forget — called without awaiting from startCall, while the
   * greeting plays), then finishRecording rotates through whichever were
   * loaded — so a long call doesn't hear the exact same "Bir daqiqa..."
   * every single turn, with zero server round trip at actual play time.
   * Each fetch excludes the previous one's key so the sequence doesn't
   * just return the same single canned response 3 times; stops early once
   * that stops turning up anything new (e.g. only one variant exists, or
   * none are configured yet and it's a live-TTS fallback with no key at
   * all). A turn finishing before this resolves, or nothing loading at
   * all, just plays no filler — always a tolerated fallback, never a hard
   * requirement. */
  async function prefetchFillers() {
    async function loadVariants(type) {
      const variants = [];
      let exclude = "";
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch(`/api/ai-call/filler?type=${type}&lang=${langRef.current}&exclude=${encodeURIComponent(exclude)}`);
          if (!res.ok) break;
          const key = res.headers.get("X-Filler-Key") || "";
          const text = decodeURIComponent(res.headers.get("X-Reply-Text") || "");
          const blob = await res.blob();
          if (!key || variants.some((v) => v.key === key)) {
            if (variants.length === 0) variants.push({ key, blob, text });
            break;
          }
          variants.push({ key, blob, text });
          exclude = key;
        } catch {
          break;
        }
      }
      return variants;
    }
    const [question, confirm] = await Promise.all([loadVariants("question"), loadVariants("confirm")]);
    fillerRef.current = { question, confirm };
    fillerIndexRef.current = { question: 0, confirm: 0 };
  }

  /** The call's fixed opening line (see CALL_GREETING_TEXT in
   * lib/aiCallService.js) — played once right after the mic is set up and
   * BEFORE it's armed, so the greeting itself is never picked up as if the
   * caller had said it, and never goes through STT/the agent at all. */
  async function playGreeting() {
    try {
      // Normally already downloaded by now — startCall kicks this fetch off
      // in parallel with the capacity check and mic permission instead of
      // after them, since the greeting doesn't depend on either. Falls back
      // to a fresh fetch if that prefetch failed.
      const prefetched = greetingPrefetchRef.current;
      greetingPrefetchRef.current = null;
      const res = (prefetched && (await prefetched)) || (await fetch("/api/ai-call/greeting"));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Xatolik (${res.status})`);
      }
      const replyText = decodeURIComponent(res.headers.get("X-Reply-Text") || "");
      setLog((prev) => [...prev, { role: "ai", text: replyText }]);
      lastAiTextRef.current = replyText;
      const audioBlob = await res.blob();
      if (res.headers.get("X-End-Call") === "1") {
        setPhase("speaking");
        await playBlob(audioBlob);
        endCall();
        return;
      }
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
      const speechDurationMs = lastLoudRef.current - speechStartRef.current;
      const discard = speechDurationMs < MIN_SPEECH_MS;
      setPhase("processing");
      finishRecording(discard, speechDurationMs);
    }
  }

  async function finishRecording(discard, speechDurationMs) {
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
      const fillerType = /(to['‘’ʻ]g['‘’ʻ]rimi|правильно|верно|correct|right)\?$/i.test(lastAiTextRef.current.trim()) ? "confirm" : "question";
      // A short "question"-type utterance is very likely a brief "rahmat,
      // xayr" — see SHORT_UTTERANCE_MS's doc comment for why that skips
      // the filler entirely rather than playing a "let me think" line in
      // front of what's about to be a farewell.
      const skipFiller = fillerType === "question" && speechDurationMs < SHORT_UTTERANCE_MS;
      const variants = skipFiller ? [] : fillerRef.current[fillerType];
      const filler = variants.length ? variants[fillerIndexRef.current[fillerType] % variants.length] : null;
      if (filler) fillerIndexRef.current[fillerType] += 1;
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

      // The call may have switched language this turn — reload the fillers in the new one so the
      // NEXT wait is spoken in it (a turn already waiting keeps the ones it started with).
      const replyLang = res.headers.get("X-Reply-Lang") || "uz";
      if (replyLang !== langRef.current) {
        langRef.current = replyLang;
        prefetchFillers();
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
    // Resolves to null (never rejects) so an abandoned prefetch — capacity
    // full, call cancelled — can't surface as an unhandled rejection.
    greetingPrefetchRef.current = fetch("/api/ai-call/greeting").catch(() => null);
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
          const started = await capacityRes.json().catch(() => ({}));
          maxDurationMinutesRef.current = Number(started.maxDurationMinutes) || 0;
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
      fillerRef.current = { question: [], confirm: [] };
      fillerIndexRef.current = { question: 0, confirm: 0 };
      lastAiTextRef.current = "";
      langRef.current = "uz";
      prefetchFillers(); // fire-and-forget, loads alongside the greeting below

      callStartRef.current = Date.now();
      setElapsedSec(0);
      timerIntervalRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);

      // Instant path: an admin's "Tugatish" click (see
      // app/api/ai-call/hangup/route.js) broadcasts on this exact channel
      // name — see lib/callHangupRealtime.js.
      if (supabase) {
        hangupChannelRef.current = supabase
          .channel(`call-hangup:${sessionIdRef.current}`)
          .on("broadcast", { event: "hangup" }, () => endCall())
          .subscribe();
      }

      if (maxDurationMinutesRef.current > 0) {
        maxDurationTimeoutRef.current = setTimeout(() => endCall(), maxDurationMinutesRef.current * 60 * 1000);
      }

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
    if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
    if (hangupChannelRef.current) {
      supabase?.removeChannel(hangupChannelRef.current);
      hangupChannelRef.current = null;
    }
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
      {error && <div className="error-banner">{error}</div>}

      <div className="call-hero card">
        <button
          className={`call-hero-button${inCall ? " call-hero-button-active" : ""}`}
          onClick={inCall ? endCall : startCall}
          aria-label={inCall ? "Qo'ng'iroqni tugatish" : "Qo'ng'iroqni boshlash"}
        >
          {inCall ? <PhoneOff size={28} /> : <Phone size={28} />}
        </button>
        <div className="call-hero-status">
          <span className={`status-pill ${phase === "idle" ? "status-gray" : phase === "speaking" ? "status-green" : "status-amber"}`}>
            {(phase === "connecting" || phase === "processing" || phase === "queued") && <Loader2 size={12} className="spin" />}
            {PHASE_LABELS[phase]}
          </span>
          {inCall && phase !== "queued" && (
            <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{formatDuration(elapsedSec)}</span>
          )}
        </div>
        {!inCall && <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Qo&apos;ng&apos;iroqni boshlash uchun bosing</p>}
        {inCall && phase === "queued" && <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Bekor qilish uchun bosing</p>}
      </div>

      {recordingUrl && (
        <div className="section card">
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
          <div className="chat-log">
            {log.map((item, i) => (
              <div key={i} className={`chat-bubble-row${item.role === "user" ? " chat-bubble-row-user" : ""}`}>
                <span className="chat-bubble-role">{item.role === "user" ? "Siz" : "AI"}</span>
                <div className={`chat-bubble${item.role === "user" ? " chat-bubble-user" : ""}`}>
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
