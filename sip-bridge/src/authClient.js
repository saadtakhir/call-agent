/** Authenticates once at process startup as a dedicated service account
 * (create it via the app's own Foydalanuvchilar page with ONLY the
 * "Suhbat" / view_call permission — see ../.env.example and README.md),
 * then attaches the resulting session cookie to every /api/ai-call/*
 * request — exactly what the browser's cookie jar does automatically for
 * components/AiCallWidget.jsx, just done by hand here. */
export class AuthClient {
  constructor({ baseUrl, username, password }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.username = username;
    this.password = password;
    this.cookie = null;
  }

  async login() {
    const res = await fetch(`${this.baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Login muvaffaqiyatsiz (${res.status})`);

    const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    if (cookies.length === 0) throw new Error("Login javobida sessiya cookie topilmadi.");
    this.cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  }

  /** Fetches a path under baseUrl with the session cookie attached,
   * re-logging in and retrying once if the session turned out to be
   * expired/invalid (401) — the one thing a browser's cookie jar would
   * otherwise never need help with. */
  async apiFetch(path, options = {}) {
    if (!this.cookie) await this.login();

    const doFetch = () =>
      fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: { ...(options.headers || {}), Cookie: this.cookie },
      });

    let res = await doFetch();
    if (res.status === 401) {
      await this.login();
      res = await doFetch();
    }
    return res;
  }
}
