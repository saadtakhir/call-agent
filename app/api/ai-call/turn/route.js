import { NextResponse } from "next/server";
import { transcribeAudio, streamElevenLabsSpeech, toSpokenForm } from "@/lib/aiCallService";
import { runAgentTurn } from "@/lib/aiCallAgent";
import { findCannedAudioUrl } from "@/lib/cannedResponses";

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

    const buffer = Buffer.from(await audio.arrayBuffer());
    const transcript = await transcribeAudio(buffer, audio.name, audio.type);
    if (!transcript) {
      return NextResponse.json({ error: "Ovoz tushunilmadi, qayta urinib ko'ring." }, { status: 422 });
    }

    const { reply, audioUrl } = await runAgentTurn({ sessionId, transcript });

    const cachedBuffer = audioUrl ? await fetchAudioBuffer(audioUrl) : null;
    let audioBody = cachedBuffer;
    if (!audioBody) {
      const cannedUrl = await findCannedAudioUrl(reply);
      const cannedBuffer = cannedUrl ? await fetchAudioBuffer(cannedUrl) : null;
      audioBody = cannedBuffer || (await streamElevenLabsSpeech(toSpokenForm(reply))).body;
    }

    return new Response(audioBody, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Transcript": encodeURIComponent(transcript),
        "X-Reply-Text": encodeURIComponent(reply),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
