"use client";

import { useEffect, useState } from "react";
import { Volume2, Brain, Mic } from "lucide-react";

// Avoids toLocaleDateString(...) here — Vercel's Node runtime ships without
// full ICU locale data by default, so "uz-UZ" silently falls back to a
// garbled format (e.g. "M10 10") instead of throwing.
function formatDate(iso) {
  if (!iso) return "noma'lum";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()}`;
}

/** Account-wide usage/quota pulled straight from each provider's own API —
 * a quick "is this plan about to run out" check, distinct from this app's
 * own per-call usage logging (see CallUsagePanel), which tracks OUR calls
 * specifically rather than whatever else might share the same API key. */
export default function ProviderUsagePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/provider-usage");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Xatolik");
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Provayder balanslari</div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.85rem" }}>
        Har bir provayderning o&apos;z hisobidagi joriy davr uchun ishlatilgan miqdori — API key&apos;ga
        tegishli hisobning umumiy holati (faqat shu ilova emas).
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span className="stat-card-icon" style={{ marginBottom: 0 }}><Volume2 size={16} /></span>
                <div style={{ fontWeight: 600 }}>ElevenLabs (TTS)</div>
              </div>
              {data.elevenLabs.ok ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
                    <span>
                      {data.elevenLabs.data.characterCount?.toLocaleString()} /{" "}
                      {data.elevenLabs.data.characterLimit?.toLocaleString()} belgi
                    </span>
                    <span className="muted">{data.elevenLabs.data.tier}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--gray-bg)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, ((data.elevenLabs.data.characterCount || 0) / (data.elevenLabs.data.characterLimit || 1)) * 100)}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                  <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8, marginBottom: 0 }}>
                    Keyingi tiklanish: {formatDate(data.elevenLabs.data.nextResetAt)}
                  </p>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>{data.elevenLabs.error}</p>
              )}
            </div>

            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span className="stat-card-icon" style={{ marginBottom: 0 }}><Brain size={16} /></span>
                <div style={{ fontWeight: 600 }}>OpenAI (STT + LLM)</div>
              </div>
              {data.openai.ok ? (
                <p style={{ margin: 0 }}>
                  Oxirgi 30 kun: <strong>${data.openai.data.last30DaysUsd.toFixed(2)}</strong>
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>{data.openai.error}</p>
              )}
            </div>

            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span className="stat-card-icon" style={{ marginBottom: 0 }}><Mic size={16} /></span>
                <div style={{ fontWeight: 600 }}>Muxlisa AI (STT)</div>
              </div>
              <p className="muted" style={{ margin: 0 }}>{data.muxlisa.error}</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
