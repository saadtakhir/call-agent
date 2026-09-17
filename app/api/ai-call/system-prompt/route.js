import { NextResponse } from "next/server";
import { getSystemPrompt, setSystemPrompt, resetSystemPromptToDefault } from "@/lib/aiCallAgent";

export async function GET() {
  const text = await getSystemPrompt();
  return NextResponse.json({ text });
}

export async function PUT(request) {
  try {
    const { text, reset } = await request.json();
    const saved = reset ? await resetSystemPromptToDefault() : await setSystemPrompt(text);
    return NextResponse.json({ text: saved });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
