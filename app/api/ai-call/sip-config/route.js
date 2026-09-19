import { NextResponse } from "next/server";
import { getSipConfig, setSipConfig } from "@/lib/sipConfig";

// Returns the real stored values (including the password) — this route
// already sits behind manage_settings in proxy.js, and the sip-bridge/
// VPS service authenticates the same way to fetch its own PBX
// credentials from here, so there's nothing gained by masking it
// server-side; the settings panel masks it for DISPLAY (a plain
// type="password" input) instead.
export async function GET() {
  const config = await getSipConfig();
  return NextResponse.json(config);
}

export async function PUT(request) {
  try {
    const { extension, password, domain, proxy } = await request.json();
    const updated = await setSipConfig({ extension, password, domain, proxy });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
