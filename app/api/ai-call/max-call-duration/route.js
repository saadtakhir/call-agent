import { NextResponse } from "next/server";
import { getMaxCallDurationMinutes, setMaxCallDurationMinutes } from "@/lib/aiCallCapacity";

export async function GET() {
  const value = await getMaxCallDurationMinutes();
  return NextResponse.json({ value });
}

export async function PUT(request) {
  try {
    const { value } = await request.json();
    const saved = await setMaxCallDurationMinutes(value);
    return NextResponse.json({ value: saved });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
