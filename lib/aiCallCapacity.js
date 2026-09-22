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
const MAX_CALL_DURATION_SETTING_KEY = "aiCallMaxDurationMinutes";
const DEFAULT_MAX_CALL_DURATION_MINUTES = 20;

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

/** Live-editable via /ai-qongiroq-sozlamalar (see MaxCallDurationPanel) —
 * enforced by isHangupRequested below, which both the widget and
 * sip-bridge already poll every 3s for the admin "Tugatish" button, so a
 * call exceeding this just gets picked up by that same channel instead of
 * needing a separate one. Exists because an abandoned browser tab that
 * missed its pagehide beacon (crashed, force-quit, ...) would otherwise
 * sit "active" for however long the tab happened to stay open — hours, in
 * a few real cases that turned up in Qo'ng'iroqlar tarixi. */
export async function getMaxCallDurationMinutes() {
  const stored = await getSetting(MAX_CALL_DURATION_SETTING_KEY, null);
  const n = Number(stored);
  return stored !== null && Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_CALL_DURATION_MINUTES;
}

export async function setMaxCallDurationMinutes(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 180) throw new Error("1 dan 180 gacha butun son (daqiqa) bo'lishi kerak.");
  await setSetting(MAX_CALL_DURATION_SETTING_KEY, String(n));
  return n;
}

/** Registers a new call attempt if fewer than the current limit are
 * currently active, atomically. Vercel's serverless functions can run as
 * separate instances, so a plain count-then-insert would race under
 * concurrent call starts — pg_advisory_xact_lock serializes just this
 * operation across whichever instance happens to run it. */
export async function tryStartCall(sessionId, channel = "widget", startedByUsername = null) {
  const maxConcurrentCalls = await getMaxConcurrentCalls();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ai_call_capacity'))`;
    // Opportunistic cleanup: a tab that missed its pagehide beacon
    // (crashed, force-quit, ...) leaves its row "active" forever — these
    // were already excluded from the count below by the staleness filter,
    // so this doesn't change any capacity behavior, it just makes the row
    // itself (and Qo'ng'iroqlar tarixi, which reads `active` directly)
    // reflect reality instead of showing "davom etmoqda" indefinitely.
    // Each row's OWN current `updatedAt` (its last known real activity) is
    // captured as `endedAt` BEFORE this touches it — a single updateMany
    // setting active:false would otherwise have Prisma's @updatedAt stamp
    // the row with THIS moment instead, inflating listCallHistory's
    // durationSeconds by however long the row sat idle before some later,
    // unrelated call happened to trigger this cleanup.
    const staleSessions = await tx.aiCallSession.findMany({
      where: { active: true, updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
      select: { sessionId: true, updatedAt: true },
    });
    for (const stale of staleSessions) {
      await tx.aiCallSession.update({
        where: { sessionId: stale.sessionId },
        data: { active: false, endedAt: stale.updatedAt },
      });
    }
    const activeCount = await tx.aiCallSession.count({
      where: { active: true, updatedAt: { gt: new Date(Date.now() - STALE_MS) } },
    });
    if (activeCount >= maxConcurrentCalls) return false;
    await tx.aiCallSession.upsert({
      where: { sessionId },
      create: { sessionId, active: true, channel, startedByUsername, hangupRequested: false },
      update: { active: true, channel, startedByUsername, hangupRequested: false },
    });
    return true;
  });
}

/** Releases a call's slot. Safe to call for a sessionId that was never
 * registered (capacity check failed, or the call never really started) —
 * updateMany simply matches zero rows instead of throwing. */
export async function endCallSession(sessionId) {
  if (!sessionId) return;
  await prisma.aiCallSession.updateMany({ where: { sessionId, active: true }, data: { active: false, endedAt: new Date() } });
}

/** Required before /api/ai-call/turn does any real (billable) work —
 * without this, any authenticated caller (e.g. a compromised or malicious
 * view_call-only account) could hit /turn directly with an arbitrary,
 * never-started sessionId and run up real OpenAI/ElevenLabs cost with no
 * concurrency limit at all, completely bypassing tryStartCall's gate. */
export async function isSessionActive(sessionId) {
  if (!sessionId) return false;
  const session = await prisma.aiCallSession.findUnique({ where: { sessionId } });
  return Boolean(session?.active) && session.updatedAt.getTime() > Date.now() - STALE_MS;
}

/** Powers the Faol suhbatlar dashboard — the same "active AND not stale"
 * definition tryStartCall counts against, so what's shown here always
 * matches what's actually blocking (or not) a new call. */
export async function listActiveSessions() {
  const sessions = await prisma.aiCallSession.findMany({
    where: { active: true, updatedAt: { gt: new Date(Date.now() - STALE_MS) } },
    select: { sessionId: true, createdAt: true, updatedAt: true, channel: true },
    orderBy: { createdAt: "asc" },
  });
  const max = await getMaxConcurrentCalls();
  return { sessions, max };
}

/** Flags a call for the widget/sip-bridge to hang up on its own next poll
 * (see isHangupRequested) — there's no server-push channel to either
 * client, so this is the only way an admin's "Tugatish" click can reach
 * an in-progress call. */
export async function requestHangup(sessionId) {
  if (!sessionId) return;
  await prisma.aiCallSession.updateMany({ where: { sessionId }, data: { hangupRequested: true } });
}

/** Polled every few seconds by the widget/sip-bridge during an active
 * call — true either because an admin clicked "Tugatish" (the flag) OR
 * because the call has simply run past getMaxCallDurationMinutes, so a
 * tab that misses its pagehide beacon can't sit "active" indefinitely.
 * The flag is cleared once delivered so it only fires the one hangup it
 * was meant for; the duration check needs no such bookkeeping since it
 * naturally keeps being true every poll until the call actually ends. */
export async function isHangupRequested(sessionId) {
  if (!sessionId) return false;
  const session = await prisma.aiCallSession.findUnique({
    where: { sessionId },
    select: { hangupRequested: true, createdAt: true },
  });
  if (!session) return false;

  if (session.hangupRequested) {
    await prisma.aiCallSession.update({ where: { sessionId }, data: { hangupRequested: false } });
    return true;
  }

  const maxDurationMinutes = await getMaxCallDurationMinutes();
  const ageMs = Date.now() - session.createdAt.getTime();
  return ageMs > maxDurationMinutes * 60 * 1000;
}

/** All calls ever handled (not just active ones) — powers the
 * Qo'ng'iroqlar tarixi page. `durationSeconds` uses `endedAt` (set once,
 * only when the call actually ended — see endCallSession/tryStartCall's
 * reaper) rather than `updatedAt`, which gets touched by unrelated later
 * writes to the same row and would silently inflate this. Still active
 * calls (no endedAt yet) fall back to `updatedAt` as a "so far" estimate —
 * accurate enough for a row that's still genuinely live and getting
 * touched by real turns. */
export async function listCallHistory({ page = 1, pageSize = 50 } = {}) {
  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    prisma.aiCallSession.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        sessionId: true,
        channel: true,
        callerNumber: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        endedAt: true,
        startedByUsername: true,
      },
    }),
    prisma.aiCallSession.count(),
  ]);

  const calls = rows.map((row) => {
    const end = row.endedAt || row.updatedAt;
    return {
      sessionId: row.sessionId,
      channel: row.channel,
      callerNumber: row.callerNumber,
      active: row.active,
      createdAt: row.createdAt,
      durationSeconds: Math.max(0, Math.round((end.getTime() - row.createdAt.getTime()) / 1000)),
      startedByUsername: row.startedByUsername,
    };
  });

  return { calls, total, page, pageSize };
}

/** Removes one row from Qo'ng'iroqlar tarixi — for clearing out junk rows
 * (e.g. the handful of pre-endedAt-fix sessions that got stuck "active"
 * and recorded wildly inflated durations, which also skew
 * lib/callUsage.js's per-minute cost average). Refuses to delete a still-
 * active call — that row belongs to a real in-progress or crashed-but-
 * not-yet-stale session, not history, and deleting it out from under
 * tryStartCall's concurrency count would be surprising. */
export async function deleteCallSession(sessionId) {
  if (!sessionId) throw new Error("\"sessionId\" kerak.");
  const result = await prisma.aiCallSession.deleteMany({ where: { sessionId, active: false } });
  if (result.count === 0) throw new Error("Topilmadi yoki hali faol suhbat — faol suhbatni o'chirib bo'lmaydi.");
}
