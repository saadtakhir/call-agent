import { config } from "./config.js";

/** Sends a plain-text reply back to one Telegram chat — no parse_mode, since
 * the agent's Uzbek replies routinely contain characters ("_", "*", "o'")
 * that Telegram's Markdown/HTML parsers would otherwise choke on or
 * misrender. */
export async function sendTelegramMessage(chatId, text) {
  if (!config.telegram.botToken) throw new Error("TELEGRAM_BOT_TOKEN o'rnatilmagan.");
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram xatosi (${res.status})`);
}
