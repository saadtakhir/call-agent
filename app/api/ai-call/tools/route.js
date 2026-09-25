import { NextResponse } from "next/server";
import { BUILTIN_TOOL_DEFS, getToolConfig, saveToolConfig, toPublicConfig, getToolStats } from "@/lib/aiTools";

// Admin-only (manage_settings) — see PATH_PERMISSIONS in proxy.js. Custom
// tools' header values (API keys, tokens) are never returned, only masked.
export async function GET() {
  const config = await getToolConfig();
  // The stats table may not exist yet right after a deploy that added it
  // (before `prisma db push`) — the settings page should still load.
  const stats = await getToolStats().catch(() => ({}));
  return NextResponse.json({ config: toPublicConfig(config), defaults: BUILTIN_TOOL_DEFS, stats });
}

export async function PUT(request) {
  try {
    const { config } = await request.json();
    const saved = await saveToolConfig(config);
    return NextResponse.json({ config: toPublicConfig(saved) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
