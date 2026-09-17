import { NextResponse } from "next/server";
import { verifyCredentials, createSessionValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { checkLoginLock, recordFailedLogin, clearLoginAttempts, getClientIp } from "@/lib/loginAttempts";

function lockResponse(retryAfterMs) {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return NextResponse.json(
    { error: `Juda ko'p noto'g'ri urinish. ${minutes} daqiqadan so'ng qayta urinib ko'ring.` },
    { status: 429 }
  );
}

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return NextResponse.json({ error: "Login va parol kerak." }, { status: 400 });

    const ip = getClientIp(request);
    const lock = await checkLoginLock(username, ip);
    if (lock.locked) return lockResponse(lock.retryAfterMs);

    const user = await verifyCredentials(String(username), String(password));
    if (!user) {
      const { lockedUntil, remaining } = await recordFailedLogin(username, ip);
      if (lockedUntil) return lockResponse(lockedUntil.getTime() - Date.now());
      return NextResponse.json(
        { error: `Login yoki parol noto'g'ri. Yana ${remaining} ta urinish qoldi.` },
        { status: 401 }
      );
    }

    await clearLoginAttempts(username, ip);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, createSessionValue(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
