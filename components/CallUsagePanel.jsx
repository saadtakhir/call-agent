"use client";

import { useEffect, useState } from "react";

function formatMinutes(seconds) {
  return (seconds / 60).toFixed(1);
}

const STT_PROVIDER_LABELS = { openai: "OpenAI", elevenlabs: "ElevenLabs", muxlisa: "Muxlisa AI" };

/** This app's OWN per-call usage totals (see lib/callUsage.js, recorded by
 * app/api/ai-call/turn/route.js on every turn) — distinct from
 * ProviderUsagePanel's account-wide provider quotas, since this only ever
 * reflects OUR calls specifically. */
export default function CallUsagePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/call-usage");
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
    <div className="section">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Bizning qo&apos;ng&apos;iroqlarimiz (barcha vaqt)</div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.85rem" }}>
        Har bir qo&apos;ng&apos;iroqda haqiqatda ishlatilgan STT/LLM/TTS miqdori — faqat shu ilova orqali
        o&apos;tgan qo&apos;ng&apos;iroqlar.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        data && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 16 }}>
              <div>
                <div className="muted" style={{ fontSize: "0.78rem" }}>Qo&apos;ng&apos;iroqlar</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{data.callCount}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "0.78rem" }}>STT (daqiqa)</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{formatMinutes(data.sttSeconds)}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "0.78rem" }}>LLM token (kirish/keshlangan/chiqish)</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {data.llmInputTokens.toLocaleString()} / {data.llmCachedTokens.toLocaleString()} /{" "}
                  {data.llmOutputTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "0.78rem" }}>TTS belgilar</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{data.ttsCharacters.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>Taxminiy xarajat (faqat tasdiqlangan narxlar bo&apos;yicha)</div>
              <p style={{ margin: "0 0 4px" }}>
                LLM (OpenAI): <strong>${data.llmCostUsd.toFixed(4)}</strong>
              </p>
              <p style={{ margin: "0 0 4px" }}>
                TTS (ElevenLabs): <strong>${data.ttsCostUsd.toFixed(4)}</strong>
              </p>
              <p style={{ margin: 0 }}>
                STT ({STT_PROVIDER_LABELS[data.currentSttProvider] || data.currentSttProvider}):{" "}
                {data.sttCostKnown ? (
                  <strong>{Math.round(data.sttCostSom).toLocaleString()} so&apos;m</strong>
                ) : (
                  <span className="muted">narxi tasdiqlanmagan (faqat Muxlisa uchun narx tasdiqlangan)</span>
                )}
              </p>
              {data.callCount > 0 && (
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10, marginBottom: 0 }}>
                  O&apos;rtacha suhbat davomiyligi: {(data.sttSeconds / data.callCount).toFixed(1)}s (bu faqat
                  gapirilgan audio, jimlik hisobga olinmagan)
                </p>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
