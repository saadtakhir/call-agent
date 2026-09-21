"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const OPTIONS = [
  { key: "openai", label: "ChatGPT (Whisper)" },
  { key: "elevenlabs", label: "ElevenLabs (Scribe)" },
  { key: "muxlisa", label: "Muxlisa AI" },
];

/** Live switch for which speech-to-text provider transcribes the caller —
 * see lib/aiCallService.js's transcribeAudio. OpenAI has no official Uzbek
 * support (biased via a prompt hint only); ElevenLabs' Scribe does
 * (language_code="uz"). Which one actually hears Uzbek better in practice
 * needs live testing, hence a switch here instead of a code-only choice. */
export default function SttProviderPanel() {
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/stt-provider");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setProvider(data.provider);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function choose(key) {
    if (key === provider || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ai-call/stt-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setProvider(data.provider);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Mijoz ovozini matnga qaysi xizmat o&apos;giradi. O&apos;zgartirish keyingi qo&apos;ng&apos;iroqdan boshlab darhol qo&apos;llaniladi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        <div className="tab-toggle" style={{ width: "fit-content" }}>
          {OPTIONS.map((opt) => (
            <button key={opt.key} className={provider === opt.key ? "active" : ""} onClick={() => choose(opt.key)} disabled={saving}>
              {opt.label}
            </button>
          ))}
          {saving && <Loader2 size={14} className="spin" style={{ marginInline: 8, alignSelf: "center" }} />}
        </div>
      )}
    </div>
  );
}
