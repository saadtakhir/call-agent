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
//
// Each type lists several candidate keys (create the extra ones via
// /ai-qongiroq-sozlamalar's Tayyor javoblar tab — only "thinking_filler"
// and "searching_filler" ship by default) so a long call doesn't hear the
// exact same "Bir daqiqa..." every single turn.
const FILLER_TYPES = {
  question: {
    keys: ["thinking_filler", "thinking_filler_2", "thinking_filler_3"],
    fallbackText: "Bir daqiqa...",
  },
  confirm: {
    keys: ["searching_filler", "searching_filler_2", "searching_filler_3"],
    fallbackText: "Biroz kutib turing, qidiryapman...",
  },
};

/** A filler clip — fetched once per call, both types in parallel
 * (prefetchFillers in components/AiCallWidget.jsx) and played locally the
 * instant recording ends, with no dependency on /api/ai-call/turn at all.
 * `exclude` (a previously-played clip's key) is skipped when picking among
 * this type's other generated variants, so back-to-back turns don't repeat
 * the same line — ignored if that leaves nothing else generated yet.
 * Falls back to live TTS with a plain default line if the matching canned
 * response hasn't been generated via /ai-qongiroq-sozlamalar yet. */
export async function GET(request) {
  try {
    const type = request.nextUrl.searchParams.get("type") === "confirm" ? "confirm" : "question";
    const exclude = request.nextUrl.searchParams.get("exclude") || "";
    const { keys, fallbackText } = FILLER_TYPES[type];

    const candidates = (
      await Promise.all(
        keys.map(async (key) => {
          const canned = await getCannedResponseByKey(key);
          return canned ? { key, ...canned } : null;
        })
      )
    ).filter(Boolean);

    const pool = candidates.length > 1 ? candidates.filter((c) => c.key !== exclude) : candidates;
    const chosen = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;

    if (chosen) {
      const cachedRes = await fetch(chosen.audioUrl, { cache: "no-store" }).catch(() => null);
      if (cachedRes?.ok) {
        return new Response(cachedRes.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Reply-Text": encodeURIComponent(chosen.text),
            "X-Filler-Key": chosen.key,
          },
        });
      }
    }
    const text = chosen?.text || fallbackText;
    const speechRes = await streamElevenLabsSpeech(toSpokenForm(text));
    return new Response(speechRes.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Reply-Text": encodeURIComponent(text),
        "X-Filler-Key": chosen?.key || "",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
