import crypto from "node:crypto";
import { findUserByUsername } from "./userService.js";
import { hashPassword, verifyPassword } from "./passwordHash.js";
import { PERMISSIONS, ALL_PERMISSIONS, PERMISSION_LABELS, ENV_ADMIN_USERNAME } from "./permissions.js";

export { PERMISSIONS, ALL_PERMISSIONS, PERMISSION_LABELS, ENV_ADMIN_USERNAME, hashPassword, verifyPassword };

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const ENV_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

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

/** Checks the env admin first (cheap, no DB hit), then falls through to a
 * DB-backed user (see lib/userService.js). Returns the {username,
 * permissions} to embed in the session, or null if the credentials don't
 * match anything. */
export async function verifyCredentials(username, password) {
  if (
    ENV_ADMIN_USERNAME &&
    ENV_ADMIN_PASSWORD &&
    timingSafeStringEqual(username, ENV_ADMIN_USERNAME) &&
    timingSafeStringEqual(password, ENV_ADMIN_PASSWORD)
  ) {
    return { username: ENV_ADMIN_USERNAME, permissions: ALL_PERMISSIONS };
  }
  const user = await findUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return { username: user.username, permissions: user.permissions };
}

function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function base64UrlDecode(str) {
  return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
}

/** Session token is `<base64url payload>.<hmac>` — the payload itself
 * carries the username and permission list, so no DB lookup is needed to
 * check either on every request (consistent with the rest of this app's
 * stateless style). The tradeoff: changing a user's permissions only takes
 * effect on their NEXT login, not immediately — acceptable for a
 * single-team internal tool. */
export function createSessionValue({ username, permissions }) {
  const payload = base64UrlEncode({ u: username, p: permissions, iat: Date.now() });
  return `${payload}.${sign(payload)}`;
}

/** Verifies the cookie's signature and returns the embedded {username,
 * permissions}, or null if it's missing, tampered with, or malformed. */
export function getSessionUser(value) {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  try {
    if (!timingSafeStringEqual(sig, sign(payload))) return null;
    const data = base64UrlDecode(payload);
    if (!data.u || !Array.isArray(data.p)) return null;
    return { username: data.u, permissions: data.p };
  } catch {
    return null;
  }
}

export function hasPermission(user, permission) {
  return !!user?.permissions?.includes(permission);
}
