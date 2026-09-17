import { prisma } from "./prisma.js";
import { config } from "./config.js";
import { getSetting, setSetting } from "./appSettings.js";

// A call that never reaches /api/ai-call/end (crashed tab, closed browser
// before the pagehide beacon fires) would otherwise count toward the limit
// forever — anything untouched this long is treated as abandoned instead.
// Ongoing calls keep refreshing updatedAt via runAgentTurn's upsert, and the
// widget's own silence watchdog force-hangs up (calling /end) well before
// this window, so a real, live call never gets excluded by mistake.
const STALE_MS = 3 * 60 * 1000;

const MAX_CONCURRENT_CALLS_SETTING_KEY = "aiCallMaxConcurrentCalls";

/** Live-editable via /ai-qongiroq-sozlamalar (see MaxConcurrentCallsPanel)
 * — config.maxConcurrentCalls (MAX_CONCURRENT_CALLS env var) is only the
 * fallback for a fresh database that's never had this setting saved. */
export async function getMaxConcurrentCalls() {
  const stored = await getSetting(MAX_CONCURRENT_CALLS_SETTING_KEY, null);
  const n = Number(stored);
  return stored !== null && Number.isInteger(n) && n > 0 ? n : config.maxConcurrentCalls;
}

export async function setMaxConcurrentCalls(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error("1 dan 50 gacha butun son bo'lishi kerak.");
  await setSetting(MAX_CONCURRENT_CALLS_SETTING_KEY, String(n));
  return n;
}

/** Registers a new call attempt if fewer than the current limit are
 * currently active, atomically. Vercel's serverless functions can run as
 * separate instances, so a plain count-then-insert would race under
 * concurrent call starts — pg_advisory_xact_lock serializes just this
 * operation across whichever instance happens to run it. */
export async function tryStartCall(sessionId) {
  const maxConcurrentCalls = await getMaxConcurrentCalls();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ai_call_capacity'))`;
    const activeCount = await tx.aiCallSession.count({
      where: { active: true, updatedAt: { gt: new Date(Date.now() - STALE_MS) } },
    });
    if (activeCount >= maxConcurrentCalls) return false;
    await tx.aiCallSession.upsert({
      where: { sessionId },
      create: { sessionId, active: true },
      update: { active: true },
    });
    return true;
  });
}

/** Releases a call's slot. Safe to call for a sessionId that was never
 * registered (capacity check failed, or the call never really started) —
 * updateMany simply matches zero rows instead of throwing. */
export async function endCallSession(sessionId) {
  if (!sessionId) return;
  await prisma.aiCallSession.updateMany({ where: { sessionId }, data: { active: false } });
}
