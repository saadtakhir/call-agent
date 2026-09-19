"use client";

import { useEffect, useState } from "react";
import { Loader2, LockOpen } from "lucide-react";

function formatRemaining(lockedUntil) {
  const ms = Date.parse(lockedUntil) - Date.now();
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} daqiqa qoldi`;
}

function isCurrentlyLocked(attempt) {
  return Boolean(attempt.lockedUntil) && Date.parse(attempt.lockedUntil) > Date.now();
}

/** Shows recent login fail streaks (by username AND by IP — see
 * lib/loginAttempts.js) with a manual unlock button, so a locked-out
 * login/IP doesn't have to sit out the full 10-minute lockout — useful
 * when e.g. sip-bridge's own service account was misconfigured and kept
 * re-triggering the lock on every systemd restart before anyone noticed. */
export default function LoginAttemptsPanel() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unlockingKey, setUnlockingKey] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/login-attempts");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setAttempts(data.attempts);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function unlock(key) {
    setUnlockingKey(key);
    setError("");
    try {
      const res = await fetch(`/api/login-attempts?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setAttempts((prev) => prev.filter((a) => a.key !== key));
    } catch (err) {
      setError(err.message);
    } finally {
      setUnlockingKey("");
    }
  }

  const locked = attempts.filter(isCurrentlyLocked);

  return (
    <div className="section">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Bloklangan kirish urinishlari</div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.85rem" }}>
        Login yoki parol 5 marta xato kiritilsa, o&apos;sha login va IP manzil 10 daqiqaga bloklanadi. Kutish
        shart emas — quyidan qo&apos;lda blokdan chiqarishingiz mumkin.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : locked.length === 0 ? (
        <p className="muted">Hozircha bloklangan login yoki IP yo&apos;q.</p>
      ) : (
        <div className="table-scroll">
          <table className="analog-table manage-table">
            <thead>
              <tr>
                <th>Login / IP</th>
                <th>Xato urinishlar</th>
                <th>Holati</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locked.map((a) => (
                <tr key={a.key}>
                  <td style={{ fontWeight: 600 }}>{a.key}</td>
                  <td>{a.failCount}</td>
                  <td>{formatRemaining(a.lockedUntil)}</td>
                  <td>
                    <button
                      className="btn btn-outline"
                      onClick={() => unlock(a.key)}
                      disabled={unlockingKey === a.key}
                    >
                      {unlockingKey === a.key ? <Loader2 size={14} className="spin" /> : <LockOpen size={14} />}
                      Blokdan chiqarish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
