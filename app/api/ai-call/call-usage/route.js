import { NextResponse } from "next/server";
import { getCallUsageSummary } from "@/lib/callUsage";

export async function GET() {
  const summary = await getCallUsageSummary();
  return NextResponse.json(summary);
}
