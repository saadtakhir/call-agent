import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/sipStatus";

// Pushed periodically by sip-bridge/src/heartbeat.js — deliberately left
// under the general "/api/ai-call" permission (view_call, see proxy.js)
// rather than manage_settings, since the bridge's own service account is
// meant to only ever need view_call.
export async function POST(request) {
  try {
    const { activeCalls, pbxRegistered, pbxStatusDetail } = await request.json();
    await recordHeartbeat({
      activeCalls: Number(activeCalls) || 0,
      pbxRegistered: Boolean(pbxRegistered),
      pbxStatusDetail: pbxStatusDetail ? String(pbxStatusDetail) : "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
