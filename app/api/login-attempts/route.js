import { NextResponse } from "next/server";
import { listLoginAttempts, unlockLoginAttempt } from "@/lib/loginAttempts";

export async function GET() {
  const attempts = await listLoginAttempts();
  return NextResponse.json({ attempts });
}

export async function DELETE(request) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "\"key\" kerak." }, { status: 400 });
  await unlockLoginAttempt(key);
  return NextResponse.json({ ok: true });
}
