import { prisma } from "./prisma.js";
import { getSttProvider } from "./aiCallService.js";

// Confirmed real published rates (checked against each provider's own
// pricing page) — kept here rather than guessed, and left unset (null)
// for any leg we don't have a confirmed rate for, so the summary never
// silently shows a made-up number.
const OPENAI_CALL_MODEL_USD_PER_1M = { input: 2, cachedInput: 0.2, output: 12 }; // gpt-5.6-terra
const ELEVENLABS_USD_PER_1K_CHARS = 0.05; // eleven_v3_conversational
const MUXLISA_SOM_PER_MINUTE = 350; // STT

let cachedUsdToUzsRate = null;
let cachedRateAt = 0;
const RATE_CACHE_MS = 60 * 60 * 1000; // CBU updates once a day — no need to refetch more often than this

/** Live USD/UZS rate from the Central Bank of Uzbekistan's public API —
 * needed only to combine llmCostUsd/ttsCostUsd (USD) with sttCostSom
 * (so'm) into one overall per-minute so'm figure. Fetched fresh (short
 * cache) rather than hardcoded, consistent with this file's other rates
 * being real published numbers, not guesses — this one just happens to
 * change daily instead of being fixed. */
async function getUsdToUzsRate() {
  if (cachedUsdToUzsRate && Date.now() - cachedRateAt < RATE_CACHE_MS) return cachedUsdToUzsRate;
  const res = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/");
  if (!res.ok) throw new Error(`CBU kursi xatosi (${res.status})`);
  const [data] = await res.json();
  const rate = Number(data?.Rate);
  if (!rate) throw new Error("CBU kursi noto'g'ri formatda qaytdi.");
  cachedUsdToUzsRate = rate;
  cachedRateAt = Date.now();
  return rate;
}

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
 * cost estimate built ONLY from confirmed real provider rates — STT cost
 * is only computed when Muxlisa (the one provider with a confirmed
 * so'm/minute rate) is the CURRENTLY selected provider, since historical
 * usage doesn't record which provider transcribed which call. Switching
 * providers makes past STT minutes' cost unknown rather than guessed. */
export async function getCallUsageSummary() {
  const totals = await prisma.aiCallSession.aggregate({
    _sum: {
      sttSeconds: true,
      llmInputTokens: true,
      llmCachedTokens: true,
      llmOutputTokens: true,
      ttsCharacters: true,
    },
    _count: true,
  });

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
  const sttCostSom = currentSttProvider === "muxlisa" ? (sttSeconds / 60) * MUXLISA_SOM_PER_MINUTE : null;

  // Per-minute rates, all on the same time basis (total spoken minutes
  // across every call — the same sttSeconds already used for "O'rtacha
  // suhbat davomiyligi" below) so they're directly comparable to each
  // other. Left null with no calls yet, rather than a division-by-zero 0
  // that would misleadingly read as "free".
  const totalMinutes = sttSeconds / 60;
  const llmCostUsdPerMinute = totalMinutes > 0 ? llmCostUsd / totalMinutes : null;
  const ttsCostUsdPerMinute = totalMinutes > 0 ? ttsCostUsd / totalMinutes : null;
  const sttCostSomPerMinute = sttCostSom !== null && totalMinutes > 0 ? sttCostSom / totalMinutes : null;

  // One combined "so'm per minute" figure — the actual ask (a single
  // number for planning), not just per-provider/per-currency breakdowns.
  // Needs a live USD/UZS rate to combine llmCostUsd+ttsCostUsd with
  // sttCostSom; if CBU's API is unreachable this just stays null and the
  // per-currency breakdown above still renders fine on its own.
  let totalCostSomPerMinute = null;
  let usdToUzsRate = null;
  if (totalMinutes > 0) {
    try {
      usdToUzsRate = await getUsdToUzsRate();
      totalCostSomPerMinute = (llmCostUsdPerMinute + ttsCostUsdPerMinute) * usdToUzsRate + (sttCostSomPerMinute || 0);
    } catch {
      // Best-effort — see doc comment above.
    }
  }

  return {
    callCount: totals._count,
    sttSeconds,
    llmInputTokens,
    llmCachedTokens,
    llmOutputTokens,
    ttsCharacters,
    llmCostUsd,
    ttsCostUsd,
    sttCostSom,
    llmCostUsdPerMinute,
    ttsCostUsdPerMinute,
    sttCostSomPerMinute,
    totalCostSomPerMinute,
    usdToUzsRate,
    sttCostKnown: currentSttProvider === "muxlisa",
    currentSttProvider,
  };
}
