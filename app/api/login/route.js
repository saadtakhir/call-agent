import { NextResponse } from "next/server";
import { verifyCredentials, createSessionValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return NextResponse.json({ error: "Login va parol kerak." }, { status: 400 });
    if (!verifyCredentials(String(username), String(password))) {
      return NextResponse.json({ error: "Login yoki parol noto'g'ri." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, createSessionValue(), {
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
