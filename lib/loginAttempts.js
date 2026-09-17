import { prisma } from "./prisma.js";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes
// A fail streak older than this doesn't count toward the limit — otherwise
// one wrong password typed months ago would still be "1 of 5" today.
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function userKey(username) {
  const trimmed = (username || "").trim().toLowerCase();
  return trimmed ? `user:${trimmed}` : null;
}

function ipKey(ip) {
  return ip ? `ip:${ip}` : null;
}

/** Best-effort client IP from the headers Vercel's edge sets — there's no
 * real device fingerprint available server-side without extra client-side
 * work, so this is what "this device" means here in practice. Falls back
 * to null (skipped entirely) rather than lumping every IP-less request
 * into one shared bucket. */
export function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || null;
}

async function lockStateFor(key) {
  if (!key) return null;
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  if (row?.lockedUntil && row.lockedUntil > new Date()) return row.lockedUntil;
  return null;
}

/** Checked BEFORE verifying credentials, against BOTH the attempted
 * username and the caller's IP — either one being locked blocks the
 * attempt, so a locked-out account can't be brute-forced from a fresh IP,
 * and a locked-out IP can't just try a different username. */
export async function checkLoginLock(username, ip) {
  const [userLock, ipLock] = await Promise.all([lockStateFor(userKey(username)), lockStateFor(ipKey(ip))]);
  const latest = [userLock, ipLock].filter(Boolean).sort((a, b) => b - a)[0];
  if (!latest) return { locked: false };
  return { locked: true, retryAfterMs: latest.getTime() - Date.now() };
}

async function bumpFailure(key) {
  if (!key) return null;
  const now = new Date();
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  const withinWindow = row && now.getTime() - row.updatedAt.getTime() <= ATTEMPT_WINDOW_MS;
  const failCount = (withinWindow ? row.failCount : 0) + 1;
  const lockedUntil = failCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null;
  await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, failCount, lockedUntil },
    update: { failCount, lockedUntil },
  });
  return lockedUntil;
}

/** Called only after a failed password check — bumps both the username's
 * and the IP's fail streaks. Returns lockedUntil if this failure just
 * tipped either one into a lockout, so the caller can show that instead of
 * a plain "wrong password". */
export async function recordFailedLogin(username, ip) {
  const [userLockedUntil, ipLockedUntil] = await Promise.all([bumpFailure(userKey(username)), bumpFailure(ipKey(ip))]);
  return userLockedUntil || ipLockedUntil || null;
}

export async function clearLoginAttempts(username, ip) {
  const keys = [userKey(username), ipKey(ip)].filter(Boolean);
  if (keys.length) await prisma.loginAttempt.deleteMany({ where: { key: { in: keys } } });
}
