import { NextResponse } from "next/server";
import { transcribeAudio, streamElevenLabsSpeech, toSpokenForm } from "@/lib/aiCallService";
import { runAgentTurn } from "@/lib/aiCallAgent";
import { findCannedAudioUrl } from "@/lib/cannedResponses";
import { wavDurationSeconds, recordCallUsage } from "@/lib/callUsage";
import { getActiveSession } from "@/lib/aiCallCapacity";

export const maxDuration = 60;

async function fetchAudioBuffer(url) {
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** One full turn: speech-to-text, then the agent (lib/aiCallAgent.js's
 * runAgentTurn — one or more OpenAI round trips plus any tool calls), then
 * TTS. The widget plays a locally prefetched "searching" filler clip the
 * INSTANT recording ends (see prefetchFiller in components/AiCallWidget.jsx)
 * in parallel with this whole request — that clip used to only come back
 * from a first, faster leg of this same route, which meant the caller
 * still sat through the STT time before hearing anything at all. Now the
 * filler has no dependency on this route whatsoever, so this can just take
 * as long as it needs. */
export async function POST(request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const sessionId = String(form.get("sessionId") || "");
    if (!audio || !sessionId) {
      return NextResponse.json({ error: "\"audio\" va \"sessionId\" kerak." }, { status: 400 });
    }
    // Blocks a caller from skipping straight to this (billable) endpoint
    // with a made-up sessionId that never actually reserved a slot via
    // /api/ai-call/start — see isSessionActive's doc comment.
    // Same lookup doubles as the source of the call's current language (the
    // language the AI last answered in) — see AiCallSession.language.
    const session = await getActiveSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Suhbat sessiyasi topilmadi yoki tugagan." }, { status: 403 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const transcript = await transcribeAudio(buffer, audio.name, audio.type, { language: session.language });
    if (!transcript) {
      return NextResponse.json({ error: "Ovoz tushunilmadi, qayta urinib ko'ring." }, { status: 422 });
    }

    const { reply, audioUrl, usage, language, endCall } = await runAgentTurn({ sessionId, transcript });

    const cachedBuffer = audioUrl ? await fetchAudioBuffer(audioUrl) : null;
    let audioBody = cachedBuffer;
    let ttsCharacters = 0;
    if (!audioBody) {
      const cannedUrl = await findCannedAudioUrl(reply);
      const cannedBuffer = cannedUrl ? await fetchAudioBuffer(cannedUrl) : null;
      if (cannedBuffer) {
        audioBody = cannedBuffer;
      } else {
        // Only text that actually goes through a live ElevenLabs synthesis
        // counts toward cost — cached/canned audio above is free to replay.
        const spoken = toSpokenForm(reply);
        ttsCharacters = spoken.length;
        audioBody = (await streamElevenLabsSpeech(spoken)).body;
      }
    }

    // Awaited (not fire-and-forget) since a serverless function can be
    // frozen/torn down right after the response below is sent.
    await recordCallUsage(sessionId, {
      sttSeconds: wavDurationSeconds(buffer),
      llmInputTokens: usage.inputTokens,
      llmCachedTokens: usage.cachedTokens,
      llmOutputTokens: usage.outputTokens,
      ttsCharacters,
    });

    return new Response(audioBody, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Transcript": encodeURIComponent(transcript),
        "X-Reply-Text": encodeURIComponent(reply),
        // Lets the widget/sip-bridge play fillers and silence check-ins in the
        // language the call is now in.
        "X-Reply-Lang": language,
        // The caller said goodbye — hang up once this reply has finished playing.
        ...(endCall ? { "X-End-Call": "1" } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
