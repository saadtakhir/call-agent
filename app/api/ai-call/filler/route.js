import { NextResponse } from "next/server";
import { streamElevenLabsSpeech, toSpokenForm } from "@/lib/aiCallService";
import { getCannedResponseByKey } from "@/lib/cannedResponses";

export const maxDuration = 30;

// Which clip plays depends on what the caller is actually responding to
// (see the widget's finishRecording, which checks whether the AI's
// previous line ended in a confirmation question) — a plain "hudud/tur"
// answer just needs an acknowledging pause, while confirming (saying "ha"
// to a "...to'g'rimi?" question) triggers a real get_property_info search,
// worth calling out specifically instead of the same generic filler.
const FILLER_TYPES = {
  question: { key: "thinking_filler", fallbackText: "Bir daqiqa..." },
  confirm: { key: "searching_filler", fallbackText: "Biroz kutib turing, qidiryapman..." },
};

/** A filler clip — fetched once per call, both types in parallel
 * (prefetchFillers in components/AiCallWidget.jsx) and played locally the
 * instant recording ends, with no dependency on /api/ai-call/turn at all.
 * Falls back to live TTS with a plain default line if the matching canned
 * response hasn't been generated via /ai-qongiroq-sozlamalar yet. */
export async function GET(request) {
  try {
    const type = request.nextUrl.searchParams.get("type") === "confirm" ? "confirm" : "question";
    const { key, fallbackText } = FILLER_TYPES[type];

    const canned = await getCannedResponseByKey(key);
    if (canned) {
      const cachedRes = await fetch(canned.audioUrl, { cache: "no-store" }).catch(() => null);
      if (cachedRes?.ok) {
        return new Response(cachedRes.body, {
          headers: { "Content-Type": "audio/mpeg", "X-Reply-Text": encodeURIComponent(canned.text) },
        });
      }
    }
    const text = canned?.text || fallbackText;
    const speechRes = await streamElevenLabsSpeech(toSpokenForm(text));
    return new Response(speechRes.body, {
      headers: { "Content-Type": "audio/mpeg", "X-Reply-Text": encodeURIComponent(text) },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
