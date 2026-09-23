"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, Brain } from "lucide-react";

/** The Telegram support bot's own usage/cost (see lib/callUsage.js's
 * getTelegramUsageSummary) — kept separate from CallUsagePanel since a
 * text chat has no STT/TTS cost at all and no meaningful "duration" the
 * way a phone call does; cost is reported per chat instead of per
 * minute. */
export default function TelegramUsagePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/telegram-usage");
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
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Telegram bot (barcha vaqt)</div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.85rem" }}>
        Matnli suhbat — STT va TTS ishlatilmaydi, faqat javob tayyorlash (LLM) xarajati bor.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        data && (
          <div className="card">
            <div className="stat-card-grid" style={{ marginBottom: 16 }}>
              <div>
                <div className="stat-card-icon"><MessageSquareText size={15} /></div>
                <div className="stat-card-label">Suhbatlar (chatlar)</div>
                <div className="stat-card-value">{data.chatCount}</div>
              </div>
              <div>
                <div className="stat-card-icon"><Brain size={15} /></div>
                <div className="stat-card-label">LLM token (kirish/keshlangan/chiqish)</div>
                <div className="stat-card-value" style={{ fontSize: "1.1rem" }}>
                  {data.llmInputTokens.toLocaleString()} / {data.llmCachedTokens.toLocaleString()} /{" "}
                  {data.llmOutputTokens.toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>Taxminiy xarajat (LLM, OpenAI)</div>
              <p style={{ margin: 0 }}>
                Jami: <strong>${data.llmCostUsd.toFixed(4)}</strong>
                {data.llmCostUsdPerChat !== null && (
                  <span className="muted"> (1 chatga o&apos;rtacha ${data.llmCostUsdPerChat.toFixed(4)})</span>
                )}
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
