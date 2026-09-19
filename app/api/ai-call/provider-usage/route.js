import { NextResponse } from "next/server";
import { getElevenLabsUsage, getOpenAiUsage, getMuxlisaUsage } from "@/lib/providerUsage";

// Each provider is queried independently and never lets one's failure
// (e.g. OpenAI's Admin key not configured yet) hide the others' results —
// the panel shows per-provider errors instead of failing the whole card.
export async function GET() {
  const [elevenLabs, openai, muxlisa] = await Promise.allSettled([
    getElevenLabsUsage(),
    getOpenAiUsage(),
    getMuxlisaUsage(),
  ]);

  function toResult(settled) {
    return settled.status === "fulfilled" ? { ok: true, data: settled.value } : { ok: false, error: settled.reason.message };
  }

  return NextResponse.json({
    elevenLabs: toResult(elevenLabs),
    openai: toResult(openai),
    muxlisa: toResult(muxlisa),
  });
}
