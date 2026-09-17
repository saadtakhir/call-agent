import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET o'rnatilmagan.");
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Single hardcoded admin account via env vars — this is a one-operator
 * tool, not the main e-content app's multi-user/role system, so a users
 * table would be pure overhead here. */
export function verifyCredentials(username, password) {
  const validUser = process.env.ADMIN_USERNAME || "";
  const validPass = process.env.ADMIN_PASSWORD || "";
  if (!validUser || !validPass) throw new Error("ADMIN_USERNAME/ADMIN_PASSWORD o'rnatilmagan.");
  return timingSafeStringEqual(username, validUser) && timingSafeStringEqual(password, validPass);
}

/** Stateless session token (`<issuedAt>.<hmac>`) — no DB row or expiry logic
 * beyond the cookie's own Max-Age, since there's nothing per-session to
 * track for a single-admin tool. */
export function createSessionValue() {
  const payload = String(Date.now());
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionValue(value) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  try {
    return timingSafeStringEqual(sig, sign(payload));
  } catch {
    return false;
  }
}
