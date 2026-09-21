"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { useConfirm } from "./useConfirm";

/** Editor for the call agent's System Message (lib/aiCallAgent.js's
 * DEFAULT_SYSTEM_PROMPT) — stored as an appSetting so wording fixes take
 * effect on the very next call, no code change/redeploy needed. */
export default function SystemPromptPanel() {
  const { confirm, dialog } = useConfirm();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/system-prompt");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setText(data.text);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/ai-call/system-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setText(data.text);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!(await confirm("System Message'ni kodning standart holatiga qaytarishni tasdiqlaysizmi? Hozirgi tahrirlaringiz yo'qoladi."))) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ai-call/system-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setText(data.text);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 18 }}>
        AI Agent&apos;ning xatti-harakat qoidalari. Bu yerdagi o&apos;zgarishlar keyingi qo&apos;ng&apos;iroqda darhol
        qo&apos;llaniladi — kod o&apos;zgartirish yoki qayta deploy qilish shart emas.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="section">
        {loading ? (
          <p className="muted">Yuklanmoqda...</p>
        ) : (
          <textarea
            className="manage-input"
            style={{ width: "100%", minHeight: 420, resize: "vertical", fontFamily: "monospace", fontSize: "0.85rem" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={saving}
          />
        )}
      </div>

      <div className="section" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn" onClick={save} disabled={loading || saving || !text.trim()}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          Saqlash
        </button>
        <button className="btn btn-outline" onClick={resetToDefault} disabled={loading || saving}>
          <RotateCcw size={14} />
          Standart holatga qaytarish
        </button>
        {saved && <span className="status-pill status-green">Saqlandi</span>}
      </div>
      {dialog}
    </div>
  );
}
