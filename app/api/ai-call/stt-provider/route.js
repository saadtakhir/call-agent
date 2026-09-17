import { NextResponse } from "next/server";
import { getSttProvider, setSttProvider } from "@/lib/aiCallService";

export async function GET() {
  const provider = await getSttProvider();
  return NextResponse.json({ provider });
}

export async function PUT(request) {
  try {
    const { provider } = await request.json();
    const saved = await setSttProvider(provider);
    return NextResponse.json({ provider: saved });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
