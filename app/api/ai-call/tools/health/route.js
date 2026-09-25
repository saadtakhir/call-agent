import { NextResponse } from "next/server";
import { checkPropertyApi } from "@/lib/aiTools";

export async function GET() {
  return NextResponse.json(await checkPropertyApi());
}
