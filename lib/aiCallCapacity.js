import { prisma } from "./prisma.js";
import { config } from "./config.js";
import { getSetting, setSetting } from "./appSettings.js";
import { notifyActiveSessionsChanged } from "./callHangupRealtime.js";

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
export async function tryStartCall(sessionId, channel = "widget", startedByUsername = null, callerNumber = null) {
  const maxConcurrentCalls = await getMaxConcurrentCalls();
  const started = await prisma.$transaction(async (tx) => {
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
      create: { sessionId, active: true, channel, startedByUsername, callerNumber, hangupRequested: false },
      update: { active: true, channel, startedByUsername, callerNumber, hangupRequested: false },
    });
    return true;
  });
  // Pushes the change to any open Faol suhbatlar page (see
  // components/ActiveCallsPanel.jsx) instead of it polling every few seconds.
  if (started) notifyActiveSessionsChanged();
  return started;
}

/** Releases a call's slot. Safe to call for a sessionId that was never
 * registered (capacity check failed, or the call never really started) —
 * updateMany simply matches zero rows instead of throwing. */
export async function endCallSession(sessionId) {
  if (!sessionId) return;
  const { count } = await prisma.aiCallSession.updateMany({ where: { sessionId, active: true }, data: { active: false, endedAt: new Date() } });
  if (count > 0) notifyActiveSessionsChanged();
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

/** Marks calls that stopped being touched (a tab closed or crashed before
 * its "end" signal got through) as ended, stamping endedAt with the row's
 * own last activity rather than now. tryStartCall already does this
 * opportunistically, but only when the NEXT call starts — until then
 * Qo'ng'iroqlar tarixi (which reads `active` directly) kept showing such a
 * row as "davom etmoqda" while Faol suhbatlar (which ignores stale rows)
 * showed nothing. Running it on every read of either page keeps them in
 * agreement. Telegram rows are created inactive, so this never touches them. */
async function reapStaleSessions() {
  const cutoff = new Date(Date.now() - STALE_MS);
  try {
    await prisma.$executeRaw`UPDATE "AiCallSession" SET "active" = false, "endedAt" = "updatedAt" WHERE "active" = true AND "updatedAt" < ${cutoff}`;
  } catch {
    // Best-effort — a failed cleanup just leaves the old (still correct enough) view.
  }
}

/** Powers the Faol suhbatlar dashboard — the same "active AND not stale"
 * definition tryStartCall counts against, so what's shown here always
 * matches what's actually blocking (or not) a new call. */
export async function listActiveSessions() {
  await reapStaleSessions();
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
  // A live call always has its row (tryStartCall upserts it before the
  // client's first poll), so a missing one means a stale client from
  // before a database change/reset — tell it to hang up, otherwise a
  // forgotten open tab keeps polling forever with "no, keep going".
  if (!session) return true;

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
const KNOWN_CHANNELS = ["widget", "sip", "telegram"];

export async function listCallHistory({ page = 1, pageSize = 50, channel = null } = {}) {
  await reapStaleSessions();
  const skip = (page - 1) * pageSize;
  const where = channel ? { channel } : {};
  const [rows, total, channelCounts] = await Promise.all([
    prisma.aiCallSession.findMany({
      where,
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
    prisma.aiCallSession.count({ where }),
    // groupBy misbehaves on this Prisma version — plain per-channel counts,
    // run together, are simpler and just as cheap for 3 known values.
    Promise.all(KNOWN_CHANNELS.map((c) => prisma.aiCallSession.count({ where: { channel: c } }))),
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

  const counts = Object.fromEntries(KNOWN_CHANNELS.map((c, i) => [c, channelCounts[i]]));

  return { calls, total, page, pageSize, counts };
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
