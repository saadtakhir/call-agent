import { NextResponse } from "next/server";
import { recordHeartbeat, consumeReconnectRequest } from "@/lib/sipStatus";

// Pushed periodically by sip-bridge/src/heartbeat.js — deliberately left
// under the general "/api/ai-call" permission (view_call, see proxy.js)
// rather than manage_settings, since the bridge's own service account is
// meant to only ever need view_call. The response doubles as the only
// channel to hand the bridge a command (see lib/sipStatus.js's
// requestReconnect) — there's no way to reach into the VPS directly.
export async function POST(request) {
  try {
    const { activeCalls, pbxRegistered, pbxStatusDetail } = await request.json();
    await recordHeartbeat({
      activeCalls: Number(activeCalls) || 0,
      pbxRegistered: Boolean(pbxRegistered),
      pbxStatusDetail: pbxStatusDetail ? String(pbxStatusDetail) : "",
    });
    const reconnectRequested = await consumeReconnectRequest();
    return NextResponse.json({ ok: true, reconnectRequested });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
