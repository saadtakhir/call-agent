import { NextResponse } from "next/server";
import { testTool } from "@/lib/aiTools";

// Runs one tool right now with sample arguments — either a built-in by
// name, or an unsaved custom tool draft straight from the editor.
export async function POST(request) {
  try {
    const { name, draft, args } = await request.json();
    const outcome = await testTool({ name, draft, args });
    return NextResponse.json(outcome);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
