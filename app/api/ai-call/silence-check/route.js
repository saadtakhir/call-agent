import { NextResponse } from "next/server";
import { streamElevenLabsSpeech, toSpokenForm } from "@/lib/aiCallService";
import { getCannedResponseByKey } from "@/lib/cannedResponses";

export const maxDuration = 30;

// Three escalating stages, evenly spaced 5s apart by the widget's own
// silence watchdog (see SILENCE_STAGE_MS in components/AiCallWidget.jsx) —
// after stage 2 plays with still no response, the widget hangs up itself
// rather than calling this a 4th time.
const SILENCE_STAGES = [
  { key: "silence_check_1", fallbackText: "Siz shu yerdamisiz?" },
  { key: "silence_check_2", fallbackText: "Eshitib turibsizmi?" },
  { key: "silence_check_3", fallbackText: "Agar boshqa savollaringiz bo'lmasa suhbatimiz besh soniyadan keyin tugatiladi." },
];

// Same three stages for Russian/English calls, spoken via live TTS (the canned
// clips above are Uzbek recordings).
const SILENCE_TEXT_BY_LANGUAGE = {
  ru: ["Вы ещё здесь?", "Вы меня слышите?", "Если у вас больше нет вопросов, разговор будет завершён через пять секунд."],
  en: ["Are you still there?", "Can you hear me?", "If you have no more questions, this call will end in five seconds."],
};

/** Played proactively by the widget when the caller has gone quiet for a
 * while — no STT or agent turn involved, since there's no caller speech to
 * react to; this is the system speaking first. Falls back to live TTS
 * with a plain default line if the matching canned response hasn't been
 * generated via /ai-qongiroq-sozlamalar yet, same pattern as the greeting. */
export async function GET(request) {
  try {
    const stageIndex = Math.min(SILENCE_STAGES.length - 1, Math.max(0, Number(request.nextUrl.searchParams.get("stage")) || 0));
    const lang = ["ru", "en"].includes(request.nextUrl.searchParams.get("lang")) ? request.nextUrl.searchParams.get("lang") : "uz";
    const { key, fallbackText: uzFallback } = SILENCE_STAGES[stageIndex];
    const fallbackText = lang === "uz" ? uzFallback : SILENCE_TEXT_BY_LANGUAGE[lang][stageIndex];

    const canned = lang === "uz" ? await getCannedResponseByKey(key) : null;
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
