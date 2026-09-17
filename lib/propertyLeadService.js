import { prisma } from "./prisma.js";
import { sendToChannel } from "./telegramPostService.js";
import { escapeHtml, SUPPORT_GROUP_CHAT_ID } from "./telegramFormat.js";

/** Stores a caller's request to be contacted and forwards it to the staff
 * Telegram group so a human actually follows up — the agent's own job is
 * just to say staff will contact them, not to promise anything itself.
 * Shared by the ElevenLabs webhook (app/api/elevenlabs/property-lead) and
 * lib/aiCallAgent.js's own tool-calling loop, which calls it directly. */
export async function createPropertyLead({ propertyId, name, phone, note }) {
  if (!name && !phone) throw new Error("Ism yoki telefon raqamidan kamida bittasi kerak.");

  const lead = await prisma.propertyLead.create({ data: { propertyId: propertyId || "noma'lum", name, phone, note } });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    const message =
      `🎙️ <b>AI Agent orqali ariza</b>\n` +
      `Mulk ID: ${escapeHtml(propertyId || "—")}\n` +
      `Ism: ${escapeHtml(name || "—")}\n` +
      `Telefon: ${escapeHtml(phone || "—")}\n` +
      `Izoh: ${escapeHtml(note || "—")}`;
    await sendToChannel(token, SUPPORT_GROUP_CHAT_ID, message, []).catch(() => {});
  }

  return lead;
}
