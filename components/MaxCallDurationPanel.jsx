"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Live-editable cap on how long a single call may run (see
 * lib/aiCallCapacity.js's isHangupRequested) — both the widget and
 * sip-bridge already poll for an admin-triggered hangup every 3s, so a
 * call exceeding this gets forced closed on that same channel, no
 * separate mechanism needed. Exists because a browser tab that misses its
 * pagehide beacon (crashed, force-quit, ...) would otherwise sit "active"
 * for however long it happened to stay open. */
export default function MaxCallDurationPanel() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/max-call-duration");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setValue(String(data.value));
        setSaved(data.value);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ai-call/max-call-duration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: Number(value) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setValue(String(data.value));
      setSaved(data.value);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = saved !== null && Number(value) !== saved;

  return (
    <div className="section">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Bitta suhbatning maksimal davomiyligi</div>
      <p className="muted" style={{ marginBottom: 12, fontSize: "0.85rem" }}>
        Bu vaqtdan oshgan har qanday qo&apos;ng&apos;iroq (masalan yopilgan brauzer tabidan qolib ketgan)
        avtomatik tugatiladi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            className="manage-input"
            style={{ maxWidth: 100 }}
            type="number"
            min={1}
            max={180}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="muted" style={{ fontSize: "0.85rem" }}>daqiqa</span>
          <button className="btn" onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 size={14} className="spin" />}
            Saqlash
          </button>
        </div>
      )}
    </div>
  );
}
