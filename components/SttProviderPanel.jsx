"use client";

import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";

// Comprehension/price notes reflect what's actually confirmed elsewhere in
// this codebase (see lib/aiCallService.js's STT_PROVIDERS comment and
// lib/callUsage.js's MUXLISA_SOM_PER_MINUTE) — no invented numbers for
// OpenAI/ElevenLabs, since neither has a confirmed per-minute STT rate
// tracked in this app yet.
const OPTIONS = [
  {
    key: "openai",
    label: "ChatGPT (Whisper)",
    desc: "O'zbek tili rasmiy qo'llab-quvvatlanmaydi — faqat maxsus ko'rsatma (prompt) orqali moslashtirilgan. Narxi bu ilovada hali tasdiqlanmagan. Amalda eng barqaror natija bergani uchun joriy standart provayder.",
  },
  {
    key: "elevenlabs",
    label: "ElevenLabs (Scribe)",
    desc: "Rasmiy ravishda o'zbek tilini qo'llab-quvvatlaydi. Narxi bu ilovada hali tasdiqlanmagan. Amaliy sinovda o'zbekcha nutqni ko'p joyda noto'g'ri tushungani kuzatilgan — hozircha eng zaif natija.",
  },
  {
    key: "muxlisa",
    label: "Muxlisa AI",
    desc: "Aynan o'zbek tili uchun ishlab chiqilgan. Narxi: 350 so'm / daqiqa — uchtasi orasida yagona tasdiqlangan narx.",
  },
];

/** Live switch for which speech-to-text provider transcribes the caller —
 * see lib/aiCallService.js's transcribeAudio. Selecting a card only
 * updates local state; the actual switch only takes effect once "Saqlash"
 * is pressed, so browsing the options doesn't risk changing live call
 * behavior by an accidental click. */
export default function SttProviderPanel() {
  const [selected, setSelected] = useState(null);
  const [saved, setSaved] = useState(null);
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
        setSelected(data.provider);
        setSaved(data.provider);
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
      const res = await fetch("/api/ai-call/stt-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setSelected(data.provider);
      setSaved(data.provider);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = saved !== null && selected !== saved;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Mijoz ovozini matnga qaysi xizmat o&apos;giradi. Birini tanlab, &quot;Saqlash&quot;ni bosgandan keyin keyingi
        qo&apos;ng&apos;iroqdan boshlab qo&apos;llaniladi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        <>
          <div className="stt-option-list">
            {OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`stt-option${selected === opt.key ? " selected" : ""}`}
                onClick={() => setSelected(opt.key)}
              >
                <span className="stt-option-radio">{selected === opt.key && <Check size={12} />}</span>
                <span className="stt-option-body">
                  <span className="stt-option-label">{opt.label}</span>
                  <span className="stt-option-desc">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 size={14} className="spin" />}
            Saqlash
          </button>
        </>
      )}
    </div>
  );
}
