import { NextResponse } from "next/server";
import { listCallHistory, deleteCallSession } from "@/lib/aiCallCapacity";

export async function GET(request) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const result = await listCallHistory({ page, pageSize: 50 });
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
