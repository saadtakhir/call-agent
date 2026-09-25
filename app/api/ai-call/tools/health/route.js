import { NextResponse } from "next/server";
import { checkPropertyApi, checkOpenAi, checkElevenLabs } from "@/lib/aiTools";

const CHECKS = { property: checkPropertyApi, openai: checkOpenAi, elevenlabs: checkElevenLabs };

// ?target=property (default) | openai | elevenlabs — each makes one small
// real request with the deployed key, see lib/aiTools.js.
export async function GET(request) {
  const target = request.nextUrl.searchParams.get("target") || "property";
  const check = CHECKS[target];
  if (!check) return NextResponse.json({ error: "Noma'lum tekshiruv." }, { status: 400 });
  return NextResponse.json(await check());
}
