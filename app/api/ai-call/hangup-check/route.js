import { NextResponse } from "next/server";
import { after } from "next/server";
import { isHangupRequested } from "@/lib/aiCallCapacity";
import { recordPollProbe } from "@/lib/pollProbe";

// Polled every 30s (fallback only — the instant path is the Supabase
// Realtime broadcast, see lib/callHangupRealtime.js) by the widget/sip-bridge
// during an active call — see lib/aiCallCapacity.js's
// requestHangup/isHangupRequested for the full flow. Left under the
// general "/api/ai-call" permission (view_call), same as /turn and
// /silence-check, since the caller's own session is all it needs.
export async function GET(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "\"sessionId\" kerak." }, { status: 400 });
  try {
    const hangup = await isHangupRequested(sessionId);
    after(() => recordPollProbe(request, hangup ? "answered: hangup" : "answered: continue", sessionId));
    return NextResponse.json({ hangup });
  } catch {
    // If the database can't even answer this, the call can't continue
    // anyway (every turn needs it too) — telling the client to hang up
    // also stops a forgotten open tab from polling a failing endpoint
    // forever, which is exactly what happened when the database hit its
    // plan limit: a 5xx here never told those tabs to stop.
    return NextResponse.json({ hangup: true });
  }
}
