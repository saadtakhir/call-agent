import { prisma } from "./prisma.js";

/** Generic fixed-window rate limiter — `key` should already include
 * whatever it's scoped to (e.g. `start:<ip>`) so unrelated limits never
 * share a bucket. Not exact under heavy concurrent traffic (a classic
 * fixed-window edge effect can let up to ~2x `max` through right at a
 * window boundary), which is an acceptable tradeoff here: this exists to
 * blunt sustained abuse, not to be a precise quota. */
export async function checkRateLimit(key, { max, windowMs }) {
  const now = new Date();
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  const windowExpired = !bucket || now.getTime() - bucket.windowStart.getTime() > windowMs;

  if (windowExpired) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return { allowed: true };
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterMs: windowMs - (now.getTime() - bucket.windowStart.getTime()) };
  }

  await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
  return { allowed: true };
}
