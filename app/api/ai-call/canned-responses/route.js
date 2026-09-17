import { NextResponse } from "next/server";
import { listCannedResponses, createCannedResponse } from "@/lib/cannedResponses";

export async function GET() {
  const items = await listCannedResponses();
  return NextResponse.json({ items });
}

export async function POST(request) {
  try {
    const { key, text } = await request.json();
    const item = await createCannedResponse({ key, text });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
