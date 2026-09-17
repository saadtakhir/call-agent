"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Live-editable cap on how many AI calls the widget lets run at once (see
 * lib/aiCallCapacity.js) — kept low by default since it's bounded by the
 * ElevenLabs/OpenAI account's own concurrency limits, not anything this app
 * itself needs. */
export default function MaxConcurrentCallsPanel() {
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
        const res = await fetch("/api/ai-call/max-concurrent-calls");
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
      const res = await fetch("/api/ai-call/max-concurrent-calls", {
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
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Bir vaqtdagi suhbatlar chegarasi</h2>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Bir vaqtning o&apos;zida nechta AI qo&apos;ng&apos;iroq bo&apos;lishi mumkinligi — ElevenLabs/OpenAI
        hisobingizning bir vaqtdagi so&apos;rovlar chegarasidan oshib ketmaslik uchun. O&apos;zgartirish keyingi
        qo&apos;ng&apos;iroqdan boshlab darhol qo&apos;llaniladi.
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
            max={50}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className="btn" onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 size={14} className="spin" />}
            Saqlash
          </button>
        </div>
      )}
    </div>
  );
}
