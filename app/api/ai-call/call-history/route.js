import { NextResponse } from "next/server";
import { listCallHistory } from "@/lib/aiCallCapacity";

export async function GET(request) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const result = await listCallHistory({ page, pageSize: 50 });
  return NextResponse.json(result);
}
