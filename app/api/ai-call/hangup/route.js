import { NextResponse } from "next/server";
import { requestHangup } from "@/lib/aiCallCapacity";
import { broadcastHangup } from "@/lib/callHangupRealtime";

// Triggered by the "Tugatish" button on Faol suhbatlar. Flags the session
// (requestHangup) AND pushes an instant Supabase Realtime broadcast, which
// is what actually ends the call — the widget/sip-bridge no longer poll.
export async function POST(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "\"sessionId\" kerak." }, { status: 400 });
  await requestHangup(sessionId);
  await broadcastHangup(sessionId);
  return NextResponse.json({ ok: true });
}
