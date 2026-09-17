import { NextResponse } from "next/server";
import { isValidSessionValue, SESSION_COOKIE_NAME } from "./lib/auth.js";

// Next.js 16 renamed Middleware to Proxy — same file-convention slot, same
// behavior, just a new name/export. Defaults to the Node.js runtime, which
// is required here since lib/auth.js uses node:crypto (not available on the
// old Edge-only runtime).
const PUBLIC_PAGE_PATHS = ["/login"];
const PUBLIC_API_PATHS = ["/api/login"];

function isPublic(pathname) {
  if (PUBLIC_PAGE_PATHS.includes(pathname)) return true;
  return PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authed = isValidSessionValue(session);

  if (pathname.startsWith("/api/")) {
    if (!authed) return NextResponse.json({ error: "Tizimga kirilmagan." }, { status: 401 });
    return NextResponse.next();
  }

  if (!authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
