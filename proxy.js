import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser, hasPermission, PERMISSIONS, SESSION_COOKIE_NAME } from "./lib/auth.js";

// Next.js 16 renamed Middleware to Proxy — same file-convention slot, same
// behavior, just a new name/export. Defaults to the Node.js runtime, which
// is required here since lib/auth.js (transitively, via lib/userService.js)
// uses node:crypto and the pg driver — not available on the old Edge-only
// runtime.
const PUBLIC_PAGE_PATHS = ["/login"];
const PUBLIC_API_PATHS = ["/api/login"];
// PWA install-ability assets — the browser/OS can probe these (manifest,
// icons, the service worker script) before there's any session at all,
// e.g. while sitting on /login, so they can't require auth like everything
// else here.
const PUBLIC_ASSET_PATHS = ["/manifest.webmanifest", "/sw.js", "/icon.png", "/apple-icon.png", "/icons"];

// Which permission a path needs, keyed by prefix — checked in order, so a
// more specific prefix (e.g. the settings-only ai-call routes) must come
// before a broader one it'd otherwise also match (the general
// "/api/ai-call" catch-all used by the call widget itself).
const PATH_PERMISSIONS = [
  { prefix: "/api/users", permission: PERMISSIONS.MANAGE_USERS },
  { prefix: "/api/login-attempts", permission: PERMISSIONS.MANAGE_USERS },
  { prefix: "/foydalanuvchilar", permission: PERMISSIONS.MANAGE_USERS },
  { prefix: "/api/ai-call/stt-provider", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/system-prompt", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/canned-responses", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/max-concurrent-calls", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/sip-config", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/sip-status", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/sip-reconnect", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/provider-usage", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/call-usage", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/ai-qongiroq-sozlamalar", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/active-sessions", permission: PERMISSIONS.VIEW_DASHBOARD },
  { prefix: "/api/ai-call/hangup", permission: PERMISSIONS.VIEW_DASHBOARD },
  { prefix: "/api/ai-call/call-history", permission: PERMISSIONS.VIEW_DASHBOARD },
  { prefix: "/faol-suhbatlar", permission: PERMISSIONS.VIEW_DASHBOARD },
  { prefix: "/qongiroqlar-tarixi", permission: PERMISSIONS.VIEW_DASHBOARD },
  { prefix: "/api/ai-call", permission: PERMISSIONS.VIEW_CALL },
  { prefix: "/ai-qongiroq", permission: PERMISSIONS.VIEW_CALL },
];

function isPublic(pathname) {
  if (PUBLIC_PAGE_PATHS.includes(pathname)) return true;
  if (PUBLIC_ASSET_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function permissionForPath(pathname) {
  const match = PATH_PERMISSIONS.find((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`));
  return match?.permission || null;
}

/** Rejects a browser request whose Origin doesn't match this same host —
 * blocks a malicious site from using a signed-in admin's browser (and
 * cookies) to call these APIs on their behalf (CSRF), on top of the
 * cookie's own SameSite=Lax. Absent Origin is allowed through rather than
 * rejected: browsers only ever send it on same-origin non-GET requests
 * (never plain GETs) and cross-origin ones (which then get caught by the
 * mismatch below); a non-browser caller like sip-bridge's own server-side
 * fetch() never sends it at all, and has no cookies/browser to exploit
 * for CSRF in the first place. */
function isAllowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

/** Where to send a signed-in user who just hit "/" or a page they don't
 * have permission for — the first section their own permissions actually
 * unlock, so e.g. a user with only manage_settings never bounces toward
 * the call widget just because that's everyone else's default. */
function firstAccessiblePath(user) {
  if (hasPermission(user, PERMISSIONS.VIEW_CALL)) return "/ai-qongiroq";
  if (hasPermission(user, PERMISSIONS.VIEW_DASHBOARD)) return "/faol-suhbatlar";
  if (hasPermission(user, PERMISSIONS.MANAGE_SETTINGS)) return "/ai-qongiroq-sozlamalar";
  if (hasPermission(user, PERMISSIONS.MANAGE_USERS)) return "/foydalanuvchilar";
  return null;
}

/** A fresh nonce per request, allowing script-src to stay locked to
 * 'self' + this nonce rather than a blanket 'unsafe-inline' — Next's own
 * RSC hydration scripts self-attach it (see the request-header forwarding
 * below), but a <script> tag smuggled in via a stored-XSS payload has no
 * way to know it and still gets blocked. style-src keeps 'unsafe-inline'
 * since components throughout this app render inline style={{...}}. */
function buildCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Every return path below needs the CSP attached, not just the final
 * "happy path" — a helper instead of repeating this at each return. */
function withCsp(response, nonce, csp) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);
  return response;
}

export function proxy(request) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);
  // Forwarded to the request Next.js's own rendering sees for THIS same
  // request, so its server-generated inline scripts can read the nonce
  // via headers() and self-attach it — see buildCsp's doc comment.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const passThrough = () => NextResponse.next({ request: { headers: requestHeaders } });

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && !isAllowedOrigin(request)) {
    return withCsp(NextResponse.json({ error: "Ruxsat etilmagan manba." }, { status: 403 }), nonce, csp);
  }

  if (isPublic(pathname)) return withCsp(passThrough(), nonce, csp);

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = getSessionUser(session);

  if (!user) {
    if (isApi) return withCsp(NextResponse.json({ error: "Tizimga kirilmagan." }, { status: 401 }), nonce, csp);
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return withCsp(NextResponse.redirect(url), nonce, csp);
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = firstAccessiblePath(user) || "/login";
    return withCsp(NextResponse.redirect(url), nonce, csp);
  }

  const requiredPermission = permissionForPath(pathname);
  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    if (isApi) return withCsp(NextResponse.json({ error: "Bu amal uchun ruxsatingiz yo'q." }, { status: 403 }), nonce, csp);
    const url = request.nextUrl.clone();
    url.pathname = firstAccessiblePath(user) || "/login";
    return withCsp(NextResponse.redirect(url), nonce, csp);
  }

  return withCsp(passThrough(), nonce, csp);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
