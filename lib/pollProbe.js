import { prisma } from "./prisma.js";

const SAMPLE_RATE = 0.05;

/** Records ~5% of hangup-check requests — who sent it (IP, user agent,
 * origin) and how it was answered — so a mystery polling flood can be traced
 * back to a device. Returns a promise the caller hands to waitUntil/after so
 * it never delays the response; resolves harmlessly on any failure. */
export function recordPollProbe(request, reason, sessionId) {
  if (Math.random() >= SAMPLE_RATE) return Promise.resolve();
  const headers = request.headers;
  const ip = headers.get("cf-connecting-ip") || (headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  return prisma.pollProbe
    .create({
      data: {
        reason,
        ip,
        userAgent: (headers.get("user-agent") || "").slice(0, 160) || null,
        origin: (headers.get("origin") || headers.get("referer") || "").slice(0, 120) || null,
        sessionIdPrefix: sessionId ? String(sessionId).slice(0, 8) : null,
      },
    })
    .then(() => {
      // Keep the table tiny.
      if (Math.random() < 0.02) return prisma.pollProbe.deleteMany({ where: { at: { lt: new Date(Date.now() - 3 * 24 * 3600 * 1000) } } });
    })
    .catch(() => {});
}
