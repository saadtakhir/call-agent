import { NextResponse } from "next/server";
import { listActiveSessions } from "@/lib/aiCallCapacity";

export async function GET() {
  try {
    const { sessions, max } = await listActiveSessions();
    return NextResponse.json({ sessions, max });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
