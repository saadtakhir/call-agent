import { NextResponse } from "next/server";
import { registerTelegramWebhook } from "@/lib/telegramService";

// Registers this exact deployment's own origin as the bot's webhook — no
// need to type the domain by hand, and it stays correct automatically if
// the app ever moves to a different domain.
export async function POST(request) {
  try {
    const webhookUrl = `${request.nextUrl.origin}/api/telegram/webhook`;
    await registerTelegramWebhook(webhookUrl);
    return NextResponse.json({ ok: true, webhookUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
