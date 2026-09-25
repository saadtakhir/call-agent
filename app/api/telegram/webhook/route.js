import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { runAgentTurn } from "@/lib/aiCallAgent";
import { CALL_GREETING_TEXT } from "@/lib/aiCallService";
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

// A chat left untouched this long starts fresh on its next message rather
// than dragging in days-old context forever — OpenAI's own conversation
// chaining (previous_response_id) has no expiry of its own, so without
// this a months-old thread would just keep growing (and stop making sense
// to "continue" anyway).
const STALE_CONVERSATION_MS = 3 * 24 * 60 * 60 * 1000;

const RESET_REPLY_TEXT = "Suhbat tozalandi. Yangidan boshlaymiz — qanday yordam bera olaman?";

/** Telegram's own servers call this — never a browser, never with our
 * session cookie — so it can't go through the normal login check every
 * other route here gets. Verified instead via the secret Telegram echoes
 * back in this header (set once, when registering the webhook itself; see
 * the setWebhook call in this route's own doc). Wrong/missing secret means
 * this wasn't really Telegram, since that header can't be forged by a
 * browser request the way a cookie or Origin header sometimes can be. */
function isFromTelegram(request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  return Boolean(config.telegramSupportBot.webhookSecret) && secret === config.telegramSupportBot.webhookSecret;
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

  // /start and /reset never reach the agent at all — a fixed reply (the
  // same opener the phone call plays, CALL_GREETING_TEXT, for /start) that
  // also clears lastResponseId, so either command is a clean way to drop
  // whatever context OpenAI has chained onto this chat so far.
  if (text === "/start" || text === "/reset") {
    await prisma.aiCallSession.upsert({
      where: { sessionId },
      create: { sessionId, active: false, channel: "telegram" },
      update: { lastResponseId: null },
    });
    await sendTelegramMessage(chatId, text === "/start" ? CALL_GREETING_TEXT : RESET_REPLY_TEXT).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  try {
    const existing = await prisma.aiCallSession.findUnique({ where: { sessionId }, select: { updatedAt: true } });
    const isStale = existing && Date.now() - existing.updatedAt.getTime() > STALE_CONVERSATION_MS;

    await prisma.aiCallSession.upsert({
      where: { sessionId },
      create: { sessionId, active: false, channel: "telegram" },
      update: isStale ? { lastResponseId: null } : {},
    });

    const { reply, usage } = await runAgentTurn({ sessionId, transcript: text });

    await recordCallUsage(sessionId, {
      llmInputTokens: usage.inputTokens,
      llmCachedTokens: usage.cachedTokens,
      llmOutputTokens: usage.outputTokens,
    });

    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    // Logged so the real cause shows up in Vercel logs — the caller only ever
    // sees the generic apology below.
    console.error("[telegram] turn failed:", err);
    await sendTelegramMessage(chatId, "Kechirasiz, javob tayyorlashda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
