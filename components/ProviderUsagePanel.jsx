"use client";

import { useEffect, useState } from "react";

function formatDate(iso) {
  if (!iso) return "noma'lum";
  return new Date(iso).toLocaleDateString("uz-UZ", { day: "numeric", month: "long" });
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
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Provayder balanslari</h2>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Har bir provayderning o&apos;z hisobidagi joriy davr uchun ishlatilgan miqdori — API key&apos;ga
        tegishli hisobning umumiy holati (faqat shu ilova emas).
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>ElevenLabs (TTS)</div>
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

            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>OpenAI (STT + LLM)</div>
              {data.openai.ok ? (
                <p style={{ margin: 0 }}>
                  Oxirgi 30 kun: <strong>${data.openai.data.last30DaysUsd.toFixed(2)}</strong>
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>{data.openai.error}</p>
              )}
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Muxlisa AI (STT)</div>
              <p className="muted" style={{ margin: 0 }}>{data.muxlisa.error}</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
