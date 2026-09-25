"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useConfirm } from "./useConfirm";

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

const CHANNEL_LABELS = { widget: "Brauzer", sip: "SIP", telegram: "Telegram" };
const CHANNEL_FILTERS = [
  { key: "", label: "Barchasi" },
  { key: "widget", label: "Brauzer" },
  { key: "sip", label: "SIP" },
  { key: "telegram", label: "Telegram" },
];

/** All calls this app has ever handled (see lib/aiCallCapacity.js's
 * listCallHistory) — distinct from ActiveCallsPanel, which only shows
 * what's live right now. Telefon raqam stays "Noma'lum" for every SIP
 * call until the Asterisk dialplan is extended to actually pass
 * CALLERID(num) through the AudioSocket integration; nothing captures it
 * yet. */
export default function CallHistoryPanel({ canDelete = false }) {
  const { confirm, dialog } = useConfirm();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const query = channel ? `&channel=${channel}` : "";
        const res = await fetch(`/api/ai-call/call-history?page=${page}${query}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Xatolik");
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [page, channel]);

  function chooseChannel(key) {
    setChannel(key);
    setPage(1);
  }

  async function removeCall(call) {
    if (!(await confirm(`${formatDateTime(call.createdAt)} qo'ng'iroqni tarixdan o'chirishni tasdiqlaysizmi?`))) return;
    setDeletingId(call.sessionId);
    setError("");
    try {
      const res = await fetch(`/api/ai-call/call-history?sessionId=${encodeURIComponent(call.sessionId)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Xatolik");
      setData((prev) => ({
        ...prev,
        calls: prev.calls.filter((c) => c.sessionId !== call.sessionId),
        total: prev.total - 1,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId("");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {data?.counts && (
        <div className="tab-toggle" style={{ width: "fit-content", marginBottom: 18 }}>
          {CHANNEL_FILTERS.map((f) => (
            <button key={f.key} className={channel === f.key ? "active" : ""} onClick={() => chooseChannel(f.key)}>
              {f.label} {f.key ? `(${data.counts[f.key] ?? 0})` : `(${data.counts.widget + data.counts.sip + data.counts.telegram})`}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : data.calls.length === 0 ? (
        <p className="muted">Hozircha qo&apos;ng&apos;iroqlar yo&apos;q.</p>
      ) : (
        <>
          <div className="table-card">
          <div className="table-scroll">
            <table className="analog-table">
              <thead>
                <tr>
                  <th>T/r</th>
                  <th>Sana va vaqt</th>
                  <th>Telefon raqam</th>
                  <th>Kanal</th>
                  <th>Foydalanuvchi</th>
                  <th>Davomiyligi (daq:son)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.calls.map((call, i) => (
                  <tr key={call.sessionId}>
                    <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td>{formatDateTime(call.createdAt)}</td>
                    <td>{call.callerNumber || <span className="muted">Noma&apos;lum</span>}</td>
                    <td>{CHANNEL_LABELS[call.channel] || call.channel}</td>
                    <td>{call.startedByUsername || <span className="muted">—</span>}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatDuration(call.durationSeconds)}
                      {call.active && <span className="muted"> (davom etmoqda)</span>}
                    </td>
                    <td>
                      {canDelete && !call.active && (
                        <button
                          className="btn btn-danger btn-icon"
                          onClick={() => removeCall(call)}
                          disabled={deletingId === call.sessionId}
                          title="Tarixdan o'chirish"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      {dialog}
    </div>
  );
}
