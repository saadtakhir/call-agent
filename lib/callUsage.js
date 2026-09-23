import { prisma } from "./prisma.js";
import { getSttProvider } from "./aiCallService.js";
import { getMaxCallDurationMinutes } from "./aiCallCapacity.js";
import { getUsdToUzsRate } from "./exchangeRate.js";

// Confirmed real published rates (checked against each provider's own
// pricing page) — kept here rather than guessed, and left unset (null)
// for any leg we don't have a confirmed rate for, so the summary never
// silently shows a made-up number.
const OPENAI_CALL_MODEL_USD_PER_1M = { input: 2, cachedInput: 0.2, output: 12 }; // gpt-5.6-terra
const ELEVENLABS_USD_PER_1K_CHARS = 0.05; // eleven_v3_conversational
const MUXLISA_SOM_PER_MINUTE = 350; // STT
// STT rates for the other two switchable providers (see
// lib/aiCallService.js's STT_PROVIDERS) — checked against each provider's
// own pricing page, both for their non-realtime/batch transcription tier,
// since this app sends one buffered WAV clip per turn (see
// components/AiCallWidget.jsx's VAD), never a continuous realtime stream.
const OPENAI_TRANSCRIBE_USD_PER_MINUTE = 0.006; // gpt-4o-transcribe (config.openai.transcribeModel's default)
const ELEVENLABS_STT_USD_PER_MINUTE = 0.22 / 60; // Scribe v1/v2, $0.22/hour

// Telegram messages never touch STT or TTS at all (see
// app/api/telegram/webhook/route.js — text in, text out, no audio step),
// and a text thread has no meaningful "duration" the way a phone call does
// (it can sit idle for days between messages). Mixing it into
// getCallUsageSummary's per-minute-of-call figures would both understate
// voice calls' real STT/TTS cost share and produce a nonsense "duration"
// for chat — so it's excluded there and reported separately, per chat
// instead of per minute (see getTelegramUsageSummary below).
const VOICE_CHANNELS = ["widget", "sip"];

/** Reads a WAV buffer's own header instead of trusting a provider's
 * response for audio duration — works the same regardless of which STT
 * provider is selected (see lib/aiCallService.js's STT_PROVIDERS), since
 * they all receive the exact same WAV this app already built. */
export function wavDurationSeconds(buffer) {
  if (buffer.length < 44) return 0;
  const sampleRate = buffer.readUInt32LE(24);
  const byteRate = buffer.readUInt32LE(28);
  if (!byteRate) return 0;
  const dataSize = buffer.length - 44;
  return dataSize / byteRate;
}

/** Accumulates one turn's usage onto its call session — the basis for the
 * real, per-minute cost averages on the Xarajatlar panel (as opposed to
 * ProviderUsagePanel's account-wide provider totals). Silently ignored if
 * the session row doesn't exist yet (a race with /api/ai-call/start is
 * possible in principle) — a missed usage row just slightly undercounts,
 * never worth failing the actual call turn over. */
export async function recordCallUsage(sessionId, { sttSeconds = 0, llmInputTokens = 0, llmCachedTokens = 0, llmOutputTokens = 0, ttsCharacters = 0 }) {
  try {
    await prisma.aiCallSession.update({
      where: { sessionId },
      data: {
        sttSeconds: { increment: sttSeconds },
        llmInputTokens: { increment: llmInputTokens },
        llmCachedTokens: { increment: llmCachedTokens },
        llmOutputTokens: { increment: llmOutputTokens },
        ttsCharacters: { increment: ttsCharacters },
      },
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}

/** All-time totals across every call this app has ever handled, plus a
 * cost estimate built ONLY from confirmed real provider rates. STT cost is
 * computed using whichever provider is the CURRENTLY selected one, applied
 * to ALL historical sttSeconds — historical usage doesn't record which
 * provider transcribed which specific call, so switching providers means
 * past STT minutes' cost is re-estimated at the new provider's rate rather
 * than tracked exactly per-call. */
export async function getCallUsageSummary() {
  const totals = await prisma.aiCallSession.aggregate({
    where: { channel: { in: VOICE_CHANNELS } },
    _sum: {
      sttSeconds: true,
      llmInputTokens: true,
      llmCachedTokens: true,
      llmOutputTokens: true,
      ttsCharacters: true,
    },
    _count: true,
  });

  // The actual wall-clock length of each call (createdAt -> endedAt), NOT
  // sttSeconds — sttSeconds is only how long the CALLER was actively
  // speaking, which is a small fraction of a real call (most of it is the
  // AI talking, "thinking", or plain silence) and badly understates it,
  // making cost-per-minute look many times higher than it really is.
  // Capped per-call at the current max-duration setting so the handful of
  // historical rows from before the stale-session/duration-inflation fixes
  // (see endedAt's own doc comment in schema.prisma) can't blow up the
  // average even if their stored duration is still wrong.
  const maxDurationSeconds = (await getMaxCallDurationMinutes()) * 60;
  const durationRows = await prisma.aiCallSession.findMany({
    where: { channel: { in: VOICE_CHANNELS } },
    select: { createdAt: true, updatedAt: true, endedAt: true },
  });
  const totalCallSeconds = durationRows.reduce((sum, row) => {
    const end = row.endedAt || row.updatedAt;
    const seconds = Math.max(0, (end.getTime() - row.createdAt.getTime()) / 1000);
    return sum + Math.min(seconds, maxDurationSeconds);
  }, 0);

  const sttSeconds = totals._sum.sttSeconds || 0;
  const llmInputTokens = totals._sum.llmInputTokens || 0;
  const llmCachedTokens = totals._sum.llmCachedTokens || 0;
  const llmOutputTokens = totals._sum.llmOutputTokens || 0;
  const ttsCharacters = totals._sum.ttsCharacters || 0;

  const llmCostUsd =
    (llmInputTokens / 1_000_000) * OPENAI_CALL_MODEL_USD_PER_1M.input +
    (llmCachedTokens / 1_000_000) * OPENAI_CALL_MODEL_USD_PER_1M.cachedInput +
    (llmOutputTokens / 1_000_000) * OPENAI_CALL_MODEL_USD_PER_1M.output;
  const ttsCostUsd = (ttsCharacters / 1000) * ELEVENLABS_USD_PER_1K_CHARS;

  const currentSttProvider = await getSttProvider();
  const sttMinutesSpoken = sttSeconds / 60;
  let sttCostUsd = null;
  let sttCostSom = null;
  if (currentSttProvider === "muxlisa") {
    sttCostSom = sttMinutesSpoken * MUXLISA_SOM_PER_MINUTE;
  } else if (currentSttProvider === "openai") {
    sttCostUsd = sttMinutesSpoken * OPENAI_TRANSCRIBE_USD_PER_MINUTE;
  } else if (currentSttProvider === "elevenlabs") {
    sttCostUsd = sttMinutesSpoken * ELEVENLABS_STT_USD_PER_MINUTE;
  }

  // Per-minute rates, all on the same time basis (total, capped call
  // duration computed above) so they're directly comparable to each other
  // and to what a real minute of a phone call actually costs. Left null
  // with no calls yet, rather than a division-by-zero 0 that would
  // misleadingly read as "free".
  const totalMinutes = totalCallSeconds / 60;
  const llmCostUsdPerMinute = totalMinutes > 0 ? llmCostUsd / totalMinutes : null;
  const ttsCostUsdPerMinute = totalMinutes > 0 ? ttsCostUsd / totalMinutes : null;
  const sttCostUsdPerMinute = sttCostUsd !== null && totalMinutes > 0 ? sttCostUsd / totalMinutes : null;
  const sttCostSomPerMinute = sttCostSom !== null && totalMinutes > 0 ? sttCostSom / totalMinutes : null;

  // One combined "so'm per minute" figure — the actual ask (a single
  // number for planning), not just per-provider/per-currency breakdowns.
  // Needs a live USD/UZS rate to combine the USD-denominated legs
  // (llmCostUsd+ttsCostUsd, plus sttCostUsd when OpenAI/ElevenLabs is the
  // active STT provider) with sttCostSom (when Muxlisa is); if CBU's API
  // is unreachable this just stays null and the per-currency breakdown
  // above still renders fine on its own.
  let totalCostSomPerMinute = null;
  let usdToUzsRate = null;
  if (totalMinutes > 0) {
    try {
      usdToUzsRate = await getUsdToUzsRate();
      const usdPerMinute = llmCostUsdPerMinute + ttsCostUsdPerMinute + (sttCostUsdPerMinute || 0);
      totalCostSomPerMinute = usdPerMinute * usdToUzsRate + (sttCostSomPerMinute || 0);
    } catch {
      // Best-effort — see doc comment above.
    }
  }

  return {
    callCount: totals._count,
    sttSeconds,
    totalCallSeconds,
    llmInputTokens,
    llmCachedTokens,
    llmOutputTokens,
    ttsCharacters,
    llmCostUsd,
    ttsCostUsd,
    sttCostUsd,
    sttCostSom,
    llmCostUsdPerMinute,
    ttsCostUsdPerMinute,
    sttCostUsdPerMinute,
    sttCostSomPerMinute,
    totalCostSomPerMinute,
    usdToUzsRate,
    sttCostKnown: sttCostUsd !== null || sttCostSom !== null,
    currentSttProvider,
  };
}

/** The Telegram support bot's own usage/cost — kept separate from
 * getCallUsageSummary above rather than folded in, since it has no
 * STT/TTS cost at all (see VOICE_CHANNELS's doc comment) and "per minute"
 * isn't a meaningful unit for a text thread the way it is for a phone
 * call; per-chat is. */
export async function getTelegramUsageSummary() {
  const totals = await prisma.aiCallSession.aggregate({
    where: { channel: "telegram" },
    _sum: { llmInputTokens: true, llmCachedTokens: true, llmOutputTokens: true },
    _count: true,
  });

  const chatCount = totals._count;
  const llmInputTokens = totals._sum.llmInputTokens || 0;
  const llmCachedTokens = totals._sum.llmCachedTokens || 0;
  const llmOutputTokens = totals._sum.llmOutputTokens || 0;

  const llmCostUsd =
    (llmInputTokens / 1_000_000) * OPENAI_CALL_MODEL_USD_PER_1M.input +
    (llmCachedTokens / 1_000_000) * OPENAI_CALL_MODEL_USD_PER_1M.cachedInput +
    (llmOutputTokens / 1_000_000) * OPENAI_CALL_MODEL_USD_PER_1M.output;

  return {
    chatCount,
    llmInputTokens,
    llmCachedTokens,
    llmOutputTokens,
    llmCostUsd,
    llmCostUsdPerChat: chatCount > 0 ? llmCostUsd / chatCount : null,
  };
}
