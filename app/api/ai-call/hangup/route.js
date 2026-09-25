import { NextResponse } from "next/server";
import { requestHangup } from "@/lib/aiCallCapacity";
import { broadcastHangup } from "@/lib/callHangupRealtime";

// Triggered by the "Tugatish" button on Faol suhbatlar. Flags the session
// (requestHangup) AND pushes an instant Supabase Realtime broadcast — the
// DB flag is what a slow (30s) polling fallback in the widget/sip-bridge
// still checks (see lib/aiCallCapacity.js's isHangupRequested), in case
// the broadcast is ever missed; in the normal case the broadcast ends the
// call within a second or two instead of waiting on that poll.
export async function POST(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "\"sessionId\" kerak." }, { status: 400 });
  await requestHangup(sessionId);
  await broadcastHangup(sessionId);
  return NextResponse.json({ ok: true });
}
