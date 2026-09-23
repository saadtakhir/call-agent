import { NextResponse } from "next/server";
import { getTelegramUsageSummary } from "@/lib/callUsage";

export async function GET() {
  const summary = await getTelegramUsageSummary();
  return NextResponse.json(summary);
}
