"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

// Avoids toLocaleString(...) here — Vercel's Node runtime ships without
// full ICU locale data by default, so a locale like "uz-UZ" silently
// falls back to a garbled format instead of throwing (see the same fix
// in ProviderUsagePanel/ActiveCallsPanel).
function formatDateTime(iso) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()} ${h}:${m}`;
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CHANNEL_LABELS = { widget: "Brauzer", sip: "SIP" };

/** All calls this app has ever handled (see lib/aiCallCapacity.js's
 * listCallHistory) — distinct from ActiveCallsPanel, which only shows
 * what's live right now. Telefon raqam stays "Noma'lum" for every SIP
 * call until the Asterisk dialplan is extended to actually pass
 * CALLERID(num) through the AudioSocket integration; nothing captures it
 * yet. */
export default function CallHistoryPanel() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/ai-call/call-history?page=${page}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Xatolik");
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Qo&apos;ng&apos;iroqlar tarixi</h2>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Barcha vaqtdagi qo&apos;ng&apos;iroqlar — brauzer va SIP orqali kelganlarning barchasi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : data.calls.length === 0 ? (
        <p className="muted">Hozircha qo&apos;ng&apos;iroqlar yo&apos;q.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="analog-table">
              <thead>
                <tr>
                  <th>T/r</th>
                  <th>Sana va vaqt</th>
                  <th>Telefon raqam</th>
                  <th>Kanal</th>
                  <th>Davomiyligi</th>
                </tr>
              </thead>
              <tbody>
                {data.calls.map((call, i) => (
                  <tr key={call.sessionId}>
                    <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td>{formatDateTime(call.createdAt)}</td>
                    <td>{call.callerNumber || <span className="muted">Noma&apos;lum</span>}</td>
                    <td>{CHANNEL_LABELS[call.channel] || call.channel}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatDuration(call.durationSeconds)}
                      {call.active && <span className="muted"> (davom etmoqda)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn btn-outline btn-icon" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              <ChevronLeft size={14} />
            </button>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {page} / {totalPages} ({data.total} ta jami)
            </span>
            <button
              className="btn btn-outline btn-icon"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
