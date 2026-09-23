import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { runAgentTurn } from "@/lib/aiCallAgent";
import { recordCallUsage } from "@/lib/callUsage";
import { sendTelegramMessage } from "@/lib/telegramService";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 60;

// Generous enough for a real support conversation, well below what a
// scripted spammer hitting the bot could rack up in OpenAI cost — same
// reasoning as /api/ai-call/start's own per-IP limit, just keyed by chat
// instead since there's no meaningful "IP" for a Telegram user here.
const MAX_MESSAGES_PER_WINDOW = 20;
const WINDOW_MS = 5 * 60 * 1000;

/** Telegram's own servers call this — never a browser, never with our
 * session cookie — so it can't go through the normal login check every
 * other route here gets. Verified instead via the secret Telegram echoes
 * back in this header (set once, when registering the webhook itself; see
 * the setWebhook call in this route's own doc). Wrong/missing secret means
 * this wasn't really Telegram, since that header can't be forged by a
 * browser request the way a cookie or Origin header sometimes can be. */
function isFromTelegram(request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  return Boolean(config.telegram.webhookSecret) && secret === config.telegram.webhookSecret;
}

/** Text-only support channel, reusing the exact same agent as voice calls
 * (lib/aiCallAgent.js's runAgentTurn) — property lookup, lead capture, the
 * same system prompt — just with no STT/TTS step at all, since Telegram
 * already hands over plain text and expects plain text back.
 *
 * Each Telegram chat gets its own AiCallSession row (sessionId
 * "telegram-<chatId>", channel "telegram") purely so runAgentTurn's own
 * lastResponseId chaining keeps the conversation continuous — NOT run
 * through tryStartCall's concurrency gate (that exists for real-time
 * voice's provider rate limits, which don't apply to a text reply) and
 * created with active:false from the start (a text thread has no
 * "in-progress" moment the way a live call does, so it should never show
 * up on Faol suhbatlar — it still appears in Qo'ng'iroqlar tarixi, labeled
 * "Telegram"). */
export async function POST(request) {
  if (!isFromTelegram(request)) {
    return NextResponse.json({ error: "Ruxsat etilmagan." }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";

  // Non-text updates (photos, stickers, edited messages, ...) are silently
  // acknowledged — Telegram will stop retrying, and there's nothing this
  // text-only bot can usefully do with them anyway.
  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  const rateLimit = await checkRateLimit(`telegram:${chatId}`, { max: MAX_MESSAGES_PER_WINDOW, windowMs: WINDOW_MS });
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: true }); // drop quietly rather than tip off a scripted sender
  }

  const sessionId = `telegram-${chatId}`;
  try {
    await prisma.aiCallSession.upsert({
      where: { sessionId },
      create: { sessionId, active: false, channel: "telegram" },
      update: {},
    });

    const { reply, usage } = await runAgentTurn({ sessionId, transcript: text });

    await recordCallUsage(sessionId, {
      llmInputTokens: usage.inputTokens,
      llmCachedTokens: usage.cachedTokens,
      llmOutputTokens: usage.outputTokens,
    });

    await sendTelegramMessage(chatId, reply);
  } catch {
    await sendTelegramMessage(chatId, "Kechirasiz, javob tayyorlashda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
