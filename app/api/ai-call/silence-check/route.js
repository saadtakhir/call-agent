import { NextResponse } from "next/server";
import { streamElevenLabsSpeech, toSpokenForm } from "@/lib/aiCallService";
import { getCannedResponseByKey } from "@/lib/cannedResponses";

export const maxDuration = 30;

const FALLBACK_TEXT = "Eshitib turibsizmi?";

/** Played proactively by the widget when the caller has gone quiet for a
 * while (see the silence watchdog in components/AiCallWidget.jsx) — no STT
 * or agent turn involved, since there's no caller speech to react to; this
 * is the system speaking first. Falls back to live TTS with a plain
 * default line if the "silence_check" canned response hasn't been
 * generated via /ai-qongiroq-sozlamalar yet, same pattern as the greeting. */
export async function GET() {
  try {
    const canned = await getCannedResponseByKey("silence_check");
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
