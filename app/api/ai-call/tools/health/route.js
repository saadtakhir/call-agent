import { NextResponse } from "next/server";
import { checkPropertyApi, checkOpenAi, checkElevenLabs } from "@/lib/aiTools";
import { runAgentTurn } from "@/lib/aiCallAgent";
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

const CHECKS = { property: checkPropertyApi, openai: checkOpenAi, elevenlabs: checkElevenLabs, agent: checkAgent };

// ?target=property (default) | openai | elevenlabs | agent — each makes real
// requests with the deployed keys, see lib/aiTools.js.
export async function GET(request) {
  const target = request.nextUrl.searchParams.get("target") || "property";
  const check = CHECKS[target];
  if (!check) return NextResponse.json({ error: "Noma'lum tekshiruv." }, { status: 400 });
  return NextResponse.json(await check());
}
