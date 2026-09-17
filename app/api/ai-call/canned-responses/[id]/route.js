import { NextResponse } from "next/server";
import { updateCannedResponse, deleteCannedResponse } from "@/lib/cannedResponses";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const { key, text } = await request.json();
    const item = await updateCannedResponse(Number(id), { key, text });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteCannedResponse(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
