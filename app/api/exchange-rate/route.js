import { NextResponse } from "next/server";
import { getUsdToUzsRate } from "@/lib/exchangeRate";

// Powers the sidebar's exchange-rate badge — no specific permission
// required beyond being logged in at all (see proxy.js), since this is
// just public CBU data, not anything sensitive to this app's business.
export async function GET() {
  try {
    const rate = await getUsdToUzsRate();
    return NextResponse.json({ rate });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
