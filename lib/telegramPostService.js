// Trimmed from the e-content monolith's lib/telegramPostService.js — only
// sendToChannel, the one function lib/propertyLeadService.js actually uses
// (to forward a captured lead to the staff Telegram group).

/** Sends a plain HTML-formatted text message (a lead has no photos, so the
 * media-album branch the original file has isn't needed here). Returns the
 * sent message's id. */
export async function sendToChannel(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "sendMessage xatosi");
  return data.result?.message_id ?? null;
}
