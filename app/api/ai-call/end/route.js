import { NextResponse } from "next/server";
import { endCallSession } from "@/lib/aiCallCapacity";

export const maxDuration = 10;

/** Releases this call's concurrency slot — fired from endCall() on every
 * termination path (manual hangup, silence timeout, tab close via
 * pagehide) so the next caller doesn't wait on a slot this call is done
 * with. POST because navigator.sendBeacon (used on pagehide, where a
 * regular fetch isn't guaranteed to complete) only ever sends POST. */
export async function POST(request) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  await endCallSession(sessionId);
  return NextResponse.json({ ok: true });
}
