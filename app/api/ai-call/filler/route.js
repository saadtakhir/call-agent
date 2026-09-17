import { NextResponse } from "next/server";
import { streamElevenLabsSpeech, toSpokenForm } from "@/lib/aiCallService";
import { getCannedResponseByKey } from "@/lib/cannedResponses";

export const maxDuration = 30;

const FALLBACK_TEXT = "Bir daqiqa...";

/** The "searching" filler clip — fetched once per call by the widget
 * (prefetchFiller in components/AiCallWidget.jsx) and played locally the
 * instant recording ends, with no dependency on /api/ai-call/turn at all.
 * Falls back to live TTS with a plain default line if the "searching_filler"
 * canned response hasn't been generated via /ai-qongiroq-sozlamalar yet. */
export async function GET() {
  try {
    const canned = await getCannedResponseByKey("searching_filler");
    if (canned) {
      const cachedRes = await fetch(canned.audioUrl, { cache: "no-store" }).catch(() => null);
      if (cachedRes?.ok) {
        return new Response(cachedRes.body, {
          headers: { "Content-Type": "audio/mpeg", "X-Reply-Text": encodeURIComponent(canned.text) },
        });
      }
    }
    const text = canned?.text || FALLBACK_TEXT;
    const speechRes = await streamElevenLabsSpeech(toSpokenForm(text));
    return new Response(speechRes.body, {
      headers: { "Content-Type": "audio/mpeg", "X-Reply-Text": encodeURIComponent(text) },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
