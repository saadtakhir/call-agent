import { NextResponse } from "next/server";
import { getCachedGreetingAudio, CALL_GREETING_TEXT } from "@/lib/aiCallService";

export const maxDuration = 30;

/** The call's fixed opening line — synthesized once and cached (see
 * getCachedGreetingAudio), with no STT or n8n involved at all, so it's
 * guaranteed to play exactly once at the true start of every call. */
export async function GET() {
  try {
    const buffer = await getCachedGreetingAudio();
    return new Response(buffer, {
      headers: { "Content-Type": "audio/mpeg", "X-Reply-Text": encodeURIComponent(CALL_GREETING_TEXT) },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
