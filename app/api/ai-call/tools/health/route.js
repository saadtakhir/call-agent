import { NextResponse } from "next/server";
import { checkPropertyApi, checkOpenAi, checkElevenLabs } from "@/lib/aiTools";
import { runAgentTurn } from "@/lib/aiCallAgent";
import { lookupPropertyInfo } from "@/lib/uyJoyCatalogService";
import { getOrCreatePropertyReplyAudio } from "@/lib/propertyAudioCache";
import { prisma } from "@/lib/prisma";

/** Runs the WHOLE agent path (system prompt, tool list, OpenAI call, session
 * write) once with a plain "salom" — the same code a real caller or Telegram
 * message goes through — and reports the real error if any step throws,
 * which the Telegram/voice routes otherwise swallow behind a generic
 * apology. Lives here rather than in lib/aiTools.js because runAgentTurn
 * imports aiTools (a circular import otherwise). The throwaway session row
 * is deleted afterwards so it never shows up in history/Faol suhbatlar. */
async function checkAgent() {
  const started = Date.now();
  const sessionId = `admin-check-${Date.now()}`;
  try {
    const { reply } = await runAgentTurn({ sessionId, transcript: "salom" });
    return { ok: true, ms: Date.now() - started, reply: String(reply).slice(0, 120) };
  } catch (err) {
    const where = String(err.stack || "").split("\n").slice(1, 3).map((l) => l.trim()).join(" | ");
    return { ok: false, ms: Date.now() - started, error: `${err.name}: ${err.message}${where ? ` [${where}]` : ""}`.slice(0, 600) };
  } finally {
    await prisma.aiCallSession.deleteMany({ where: { sessionId } }).catch(() => {});
  }
}

/** Times each stage of what a spoken property ID does behind the scenes —
 * database round trips, the uy-joy.uz lookup, the per-property audio
 * (ElevenLabs + Blob), and downloading it back — using the deployed keys and
 * region. Built to pin down "the call goes quiet / Failed to fetch right
 * after I say an ID": either one stage is slow/erroring, or the whole thing
 * adds up to too long. The audio it creates is the same cache entry a real
 * call would create, so running this also warms it. */
async function checkIdPath(id) {
  const stages = [];
  const started = Date.now();
  let mark = started;
  const done = (name, ok, detail) => {
    const now = Date.now();
    stages.push({ name, ms: now - mark, ok, detail });
    mark = now;
  };

  try {
    for (let i = 0; i < 3; i++) await prisma.$queryRaw`SELECT 1`;
    done("Baza: 3 ta oddiy so'rov (jami)", true, "bir so'rov ~" + Math.round((Date.now() - mark) / 3) + " ms");
  } catch (err) {
    done("Baza: 3 ta oddiy so'rov", false, err.message);
    return { ok: false, ms: Date.now() - started, error: "Bazaga ulanib bo'lmadi", stages };
  }

  let body;
  try {
    const result = await lookupPropertyInfo({ search: id });
    body = result.body;
    done(`Mulk qidiruvi (uy-joy.uz), ID ${id}`, result.status < 500 && !body.error, body.error || `javob matni ${body.spokenReply?.length || 0} belgi`);
    if (!body.spokenReply) return { ok: false, ms: Date.now() - started, error: body.error || "Bu ID uchun tayyor javob matni yo'q.", stages };
  } catch (err) {
    done(`Mulk qidiruvi (uy-joy.uz), ID ${id}`, false, err.message);
    return { ok: false, ms: Date.now() - started, error: err.message, stages };
  }

  let audioUrl;
  try {
    audioUrl = await getOrCreatePropertyReplyAudio(body.id, body.spokenReply);
    done("Audio: kesh yoki ElevenLabs + Blob'ga yuklash", true, "tayyor");
  } catch (err) {
    done("Audio: kesh yoki ElevenLabs + Blob'ga yuklash", false, err.message);
    return { ok: false, ms: Date.now() - started, error: `Audio yaratilmadi: ${err.message}`, stages };
  }

  try {
    const res = await fetch(audioUrl, { cache: "no-store" });
    const bytes = (await res.arrayBuffer()).byteLength;
    done("Audioni Blob'dan yuklab olish", res.ok, `${bytes} bayt`);
  } catch (err) {
    done("Audioni Blob'dan yuklab olish", false, err.message);
  }

  const total = Date.now() - started;
  return { ok: stages.every((s) => s.ok), ms: total, stages, note: "Jami vaqtga hali OpenAI (2 ta chaqiruv) va ovozni matnga aylantirish ham qo'shiladi." };
}

const CHECKS = { property: checkPropertyApi, openai: checkOpenAi, elevenlabs: checkElevenLabs, agent: checkAgent, idpath: () => checkIdPath("142130") };

// ?target=property (default) | openai | elevenlabs | agent — each makes real
// requests with the deployed keys, see lib/aiTools.js.
export async function GET(request) {
  const target = request.nextUrl.searchParams.get("target") || "property";
  const check = CHECKS[target];
  if (!check) return NextResponse.json({ error: "Noma'lum tekshiruv." }, { status: 400 });
  return NextResponse.json(await check());
}
