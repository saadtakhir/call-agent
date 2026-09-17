import { NextResponse } from "next/server";
import { generateCannedResponseAudio } from "@/lib/cannedResponses";

export const maxDuration = 30;

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const item = await generateCannedResponseAudio(Number(id));
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
