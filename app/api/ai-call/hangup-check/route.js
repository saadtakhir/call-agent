import { NextResponse } from "next/server";
import { isHangupRequested } from "@/lib/aiCallCapacity";

// Polled every few seconds by the widget/sip-bridge during an active call
// (there's no server-push channel to either) — see lib/aiCallCapacity.js's
// requestHangup/isHangupRequested for the full flow. Left under the
// general "/api/ai-call" permission (view_call), same as /turn and
// /silence-check, since the caller's own session is all it needs.
export async function GET(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "\"sessionId\" kerak." }, { status: 400 });
  const hangup = await isHangupRequested(sessionId);
  return NextResponse.json({ hangup });
}
