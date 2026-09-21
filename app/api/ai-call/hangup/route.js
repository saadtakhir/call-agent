import { NextResponse } from "next/server";
import { requestHangup } from "@/lib/aiCallCapacity";

// Triggered by the "Tugatish" button on Faol suhbatlar — just flags the
// session for the widget/sip-bridge to pick up on its next hangup-check
// poll (up to a few seconds later), since there's no way to reach either
// client directly.
export async function POST(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "\"sessionId\" kerak." }, { status: 400 });
  await requestHangup(sessionId);
  return NextResponse.json({ ok: true });
}
