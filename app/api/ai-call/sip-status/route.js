import { NextResponse } from "next/server";
import { getSipStatus } from "@/lib/sipStatus";

// Read by the SIP sozlamalari panel (manage_settings, see proxy.js) — the
// heartbeat itself is written via the separate /api/ai-call/sip-heartbeat
// route, which the bridge's own view_call-only account can reach.
export async function GET() {
  const status = await getSipStatus();
  return NextResponse.json(status);
}
