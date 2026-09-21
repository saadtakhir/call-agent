import { NextResponse } from "next/server";
import { tryStartCall, endCallSession, getMaxConcurrentCalls } from "@/lib/aiCallCapacity";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/loginAttempts";

export const maxDuration = 10;

// The concurrency cap (see tryStartCall) only bounds calls active AT
// ONCE, not total throughput over time — a compromised/malicious
// view_call-only account could otherwise script a tight start→turn→end
// loop to cycle through far more calls per minute than the cap intends.
// Generous enough to never affect a legitimate caller (even one starting
// several real calls back to back), well below what a scripted loop
// would hit.
const MAX_STARTS_PER_WINDOW = 20;
const WINDOW_MS = 5 * 60 * 1000;

/** Checked by the widget BEFORE it even asks for mic permission (see
 * startCall in components/AiCallWidget.jsx) — no point prompting for the
 * mic just to immediately fail once the concurrent-call limit is hit. */
export async function GET(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "\"sessionId\" kerak." }, { status: 400 });
  const channel = request.nextUrl.searchParams.get("channel") === "sip" ? "sip" : "widget";

  try {
    const started = await tryStartCall(sessionId, channel);
    if (!started) {
      const max = await getMaxConcurrentCalls();
      return NextResponse.json(
        { error: `Hozircha ${max} ta suhbat band. Birozdan so'ng qayta urinib ko'ring.` },
        { status: 429 }
      );
    }

    // Only successful slot acquisitions count here — a caller waiting in
    // the queue above (repeatedly hitting the capacity-full branch) never
    // touches this, so a long legitimate wait can never trip it.
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`start:${ip}`, { max: MAX_STARTS_PER_WINDOW, windowMs: WINDOW_MS });
    if (!rateLimit.allowed) {
      await endCallSession(sessionId);
      return NextResponse.json({ error: "Juda ko'p qo'ng'iroq boshlandi. Birozdan so'ng qayta urinib ko'ring." }, { status: 429 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
