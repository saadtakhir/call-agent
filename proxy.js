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
  { prefix: "/api/ai-call/provider-usage", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/ai-qongiroq-sozlamalar", permission: PERMISSIONS.MANAGE_SETTINGS },
  { prefix: "/api/ai-call/active-sessions", permission: PERMISSIONS.VIEW_DASHBOARD },
  { prefix: "/faol-suhbatlar", permission: PERMISSIONS.VIEW_DASHBOARD },
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

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = getSessionUser(session);
  const isApi = pathname.startsWith("/api/");

  if (!user) {
    if (isApi) return NextResponse.json({ error: "Tizimga kirilmagan." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = firstAccessiblePath(user) || "/login";
    return NextResponse.redirect(url);
  }

  const requiredPermission = permissionForPath(pathname);
  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    if (isApi) return NextResponse.json({ error: "Bu amal uchun ruxsatingiz yo'q." }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = firstAccessiblePath(user) || "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
