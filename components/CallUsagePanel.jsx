"use client";

import { useEffect, useState } from "react";
import { Phone, Mic, Brain, Volume2 } from "lucide-react";

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
          <div className="card">
            <div className="stat-card-grid" style={{ marginBottom: 16 }}>
              <div>
                <div className="stat-card-icon"><Phone size={15} /></div>
                <div className="stat-card-label">Qo&apos;ng&apos;iroqlar</div>
                <div className="stat-card-value">{data.callCount}</div>
              </div>
              <div>
                <div className="stat-card-icon"><Mic size={15} /></div>
                <div className="stat-card-label">STT (daqiqa)</div>
                <div className="stat-card-value">{formatMinutes(data.sttSeconds)}</div>
              </div>
              <div>
                <div className="stat-card-icon"><Brain size={15} /></div>
                <div className="stat-card-label">LLM token (kirish/keshlangan/chiqish)</div>
                <div className="stat-card-value" style={{ fontSize: "1.1rem" }}>
                  {data.llmInputTokens.toLocaleString()} / {data.llmCachedTokens.toLocaleString()} /{" "}
                  {data.llmOutputTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="stat-card-icon"><Volume2 size={15} /></div>
                <div className="stat-card-label">TTS belgilar</div>
                <div className="stat-card-value">{data.ttsCharacters.toLocaleString()}</div>
              </div>
            </div>

            {data.totalCostSomPerMinute !== null && (
              <div
                style={{
                  background: "var(--accent-soft)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 16,
                }}
              >
                <div className="muted" style={{ fontSize: "0.78rem" }}>1 daqiqalik qo&apos;ng&apos;iroqning umumiy taxminiy narxi</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                  {Math.round(data.totalCostSomPerMinute).toLocaleString()} so&apos;m
                </div>
                <div className="muted" style={{ fontSize: "0.78rem" }}>
                  LLM + TTS + STT ({STT_PROVIDER_LABELS[data.currentSttProvider] || data.currentSttProvider}), $1 ={" "}
                  {Math.round(data.usdToUzsRate).toLocaleString()} so&apos;m (CBU kursi)
                  {!data.sttCostKnown && " — STT narxi bu jamiga kirmagan"}
                </div>
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>Taxminiy xarajat (faqat tasdiqlangan narxlar bo&apos;yicha)</div>
              <p style={{ margin: "0 0 4px" }}>
                LLM (OpenAI): <strong>${data.llmCostUsd.toFixed(4)}</strong>
                {data.llmCostUsdPerMinute !== null && (
                  <span className="muted"> (1 daqiqada ${data.llmCostUsdPerMinute.toFixed(4)})</span>
                )}
              </p>
              <p style={{ margin: "0 0 4px" }}>
                TTS (ElevenLabs): <strong>${data.ttsCostUsd.toFixed(4)}</strong>
                {data.ttsCostUsdPerMinute !== null && (
                  <span className="muted"> (1 daqiqada ${data.ttsCostUsdPerMinute.toFixed(4)})</span>
                )}
              </p>
              <p style={{ margin: 0 }}>
                STT ({STT_PROVIDER_LABELS[data.currentSttProvider] || data.currentSttProvider}):{" "}
                {data.sttCostKnown ? (
                  <>
                    <strong>{Math.round(data.sttCostSom).toLocaleString()} so&apos;m</strong>
                    {data.sttCostSomPerMinute !== null && (
                      <span className="muted"> (1 daqiqada {Math.round(data.sttCostSomPerMinute).toLocaleString()} so&apos;m)</span>
                    )}
                  </>
                ) : (
                  <span className="muted">narxi tasdiqlanmagan (faqat Muxlisa uchun narx tasdiqlangan)</span>
                )}
              </p>
              {data.callCount > 0 && (
                <>
                  <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10, marginBottom: 2 }}>
                    O&apos;rtacha qo&apos;ng&apos;iroq davomiyligi: {(data.totalCallSeconds / data.callCount).toFixed(0)}s —
                    yuqoridagi &quot;1 daqiqada&quot; narxlar shu asosda hisoblanadi (haddan tashqari uzun qo&apos;ng&apos;iroqlar
                    maks. sozlamadagi chegaragacha cheklab hisoblanadi)
                  </p>
                  <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0, marginBottom: 0 }}>
                    O&apos;rtacha gapirilgan audio: {(data.sttSeconds / data.callCount).toFixed(1)}s (jimlik hisobga olinmagan)
                  </p>
                </>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
