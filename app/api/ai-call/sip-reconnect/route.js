import { NextResponse } from "next/server";
import { requestReconnect } from "@/lib/sipStatus";

// Triggered by the "Qayta ulanish" button on the SIP sozlamalari panel —
// just sets a flag the bridge picks up on its next heartbeat (up to ~30s
// later, see lib/sipStatus.js), since there's no way to reach into the
// VPS directly.
export async function POST() {
  await requestReconnect();
  return NextResponse.json({ ok: true });
}
