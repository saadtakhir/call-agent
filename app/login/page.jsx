"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, PhoneCall, User, Lock } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      router.push("/ai-qongiroq");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="login-brand">
        <div className="login-brand-icon">
          <PhoneCall size={22} />
        </div>
        <div className="login-brand-name">AI Qo&apos;ng&apos;iroq Agent</div>
      </div>
      <form className="login-card" onSubmit={handleSubmit}>
        <div>
          <h1>Xush kelibsiz</h1>
          <p className="muted login-card-subtitle">Davom etish uchun tizimga kiring</p>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <label className="login-field">
          Login
          <div className="login-input-wrap">
            <User size={15} />
            <input className="manage-input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </div>
        </label>
        <label className="login-field">
          Parol
          <div className="login-input-wrap">
            <Lock size={15} />
            <input
              className="manage-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </label>
        <button className="btn btn-green" type="submit" disabled={loading || !username || !password}>
          {loading ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />}
          Kirish
        </button>
      </form>
    </div>
  );
}
