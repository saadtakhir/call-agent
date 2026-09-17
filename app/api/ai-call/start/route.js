import { NextResponse } from "next/server";
import { tryStartCall } from "@/lib/aiCallCapacity";
import { config } from "@/lib/config";

export const maxDuration = 10;

/** Checked by the widget BEFORE it even asks for mic permission (see
 * startCall in components/AiCallWidget.jsx) — no point prompting for the
 * mic just to immediately fail once the concurrent-call limit is hit. */
export async function GET(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "\"sessionId\" kerak." }, { status: 400 });

  try {
    const started = await tryStartCall(sessionId);
    if (!started) {
      return NextResponse.json(
        { error: `Hozircha ${config.maxConcurrentCalls} ta suhbat band. Birozdan so'ng qayta urinib ko'ring.` },
        { status: 429 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
