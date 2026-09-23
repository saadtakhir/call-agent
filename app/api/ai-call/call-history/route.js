import { NextResponse } from "next/server";
import { listCallHistory, deleteCallSession } from "@/lib/aiCallCapacity";

const VALID_CHANNELS = ["widget", "sip", "telegram"];

export async function GET(request) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const channelParam = request.nextUrl.searchParams.get("channel");
  const channel = VALID_CHANNELS.includes(channelParam) ? channelParam : null;
  const result = await listCallHistory({ page, pageSize: 50, channel });
  return NextResponse.json(result);
}

// Removes one row — e.g. a junk/stuck session with an obviously wrong
// duration. Query param (?sessionId=) rather than a [sessionId] dynamic
// route, matching hangup/route.js's own pattern on this same page.
export async function DELETE(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  try {
    await deleteCallSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
