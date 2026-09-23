import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getTelegramWebhookInfo } from "@/lib/telegramService";

export async function GET() {
  const botConfigured = Boolean(config.telegramSupportBot.botToken);
  const secretConfigured = Boolean(config.telegramSupportBot.webhookSecret);

  if (!botConfigured) {
    return NextResponse.json({ botConfigured, secretConfigured, webhook: null });
  }

  try {
    const webhook = await getTelegramWebhookInfo();
    return NextResponse.json({ botConfigured, secretConfigured, webhook });
  } catch (err) {
    return NextResponse.json({ botConfigured, secretConfigured, webhook: null, error: err.message });
  }
}
