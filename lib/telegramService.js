import { config } from "./config.js";

/** Sends a plain-text reply back to one Telegram chat — no parse_mode, since
 * the agent's Uzbek replies routinely contain characters ("_", "*", "o'")
 * that Telegram's Markdown/HTML parsers would otherwise choke on or
 * misrender. */
export async function sendTelegramMessage(chatId, text) {
  if (!config.telegramSupportBot.botToken) throw new Error("TELEGRAM_SUPPORT_BOT_TOKEN o'rnatilmagan.");
  const res = await fetch(`https://api.telegram.org/bot${config.telegramSupportBot.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram xatosi (${res.status})`);
}

/** Powers the "Telegram" settings tab's status card — lets the admin see
 * whether the webhook is actually registered (and any delivery error)
 * without needing to run a curl command by hand. */
export async function getTelegramWebhookInfo() {
  if (!config.telegramSupportBot.botToken) throw new Error("TELEGRAM_SUPPORT_BOT_TOKEN o'rnatilmagan.");
  const res = await fetch(`https://api.telegram.org/bot${config.telegramSupportBot.botToken}/getWebhookInfo`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "getWebhookInfo xatosi");
  return data.result;
}

/** Registers `webhookUrl` with Telegram using this app's OWN currently
 * configured secret (never sent to the browser) — the same setWebhook call
 * that previously had to be run by hand via curl. Safe to call again any
 * time the token/secret/domain changes; Telegram just overwrites its
 * previous registration. */
export async function registerTelegramWebhook(webhookUrl) {
  if (!config.telegramSupportBot.botToken) throw new Error("TELEGRAM_SUPPORT_BOT_TOKEN o'rnatilmagan.");
  if (!config.telegramSupportBot.webhookSecret) throw new Error("TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET o'rnatilmagan.");
  const res = await fetch(`https://api.telegram.org/bot${config.telegramSupportBot.botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: config.telegramSupportBot.webhookSecret }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "setWebhook xatosi");
}
