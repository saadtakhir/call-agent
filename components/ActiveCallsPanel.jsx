"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { PhoneOff } from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ACTIVE_SESSIONS_CHANNEL, ACTIVE_SESSIONS_EVENT } from "@/lib/supabasePublicConfig";

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Slow safety-net refetch only — the list itself updates instantly via the
// Supabase Realtime broadcast below whenever a call starts or ends. This
// still matters for the one change no event announces: a call going stale
// (untouched past lib/aiCallCapacity.js's STALE_MS) just by time passing.
const FALLBACK_POLL_MS = 60000;

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Avoids toLocaleTimeString(...) here — Vercel's Node runtime ships
// without full ICU locale data by default, so a locale like "uz-UZ"
// silently falls back to a garbled format instead of throwing (see the
// same fix in ProviderUsagePanel's formatDate).
function formatTime(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const CHANNEL_LABELS = { widget: "Brauzer", sip: "SIP" };

/** Live-ish view of what's currently occupying a concurrent-call slot (see
 * lib/aiCallCapacity.js) — polled rather than pushed, since Vercel's
 * serverless functions can't hold a persistent WebSocket open (same
 * constraint noted in components/AiCallWidget.jsx's VAD comment). No
 * transcript/content is shown here, only that a call is active and for how
 * long. "Tugatish" flags the call for the widget/sip-bridge to hang up on
 * its own next poll (up to a few seconds later) — there's no way to reach
 * either directly. */
export default function ActiveCallsPanel() {
  const [sessions, setSessions] = useState(null);
  const [max, setMax] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [endingId, setEndingId] = useState("");
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ai-call/active-sessions");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setSessions(data.sessions);
        setMax(data.max);
        setError("");
      } catch (err) {
        setError(err.message);
      }
    }
    load();
    pollRef.current = setInterval(load, FALLBACK_POLL_MS);
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    const channel = supabase
      ? supabase
          .channel(ACTIVE_SESSIONS_CHANNEL)
          .on("broadcast", { event: ACTIVE_SESSIONS_EVENT }, () => load())
          .subscribe()
      : null;
    return () => {
      clearInterval(pollRef.current);
      clearInterval(tickRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function endSession(sessionId) {
    setEndingId(sessionId);
    try {
      await fetch(`/api/ai-call/hangup?sessionId=${encodeURIComponent(sessionId)}`, { method: "POST" });
      // Not refetching here — the widget/sip-bridge hasn't actually acted
      // on the hangup yet at this point, so an immediate reload would just
      // show the same still-active row. Once it does hang up, /end
      // broadcasts a change and the subscription above refetches.
    } catch (err) {
      setError(err.message);
    } finally {
      setEndingId("");
    }
  }

  const loading = sessions === null;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Qo&apos;ng&apos;iroq boshlanganda yoki tugaganda darhol yangilanadi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        <>
          <div className="section" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`status-pill ${sessions.length >= max ? "status-amber" : "status-green"}`}>
              {sessions.length} / {max} band
            </span>
          </div>

          <div className="section">
            {sessions.length === 0 ? (
              <p className="muted">Hozircha faol suhbat yo&apos;q.</p>
            ) : (
              <div className="table-card">
              <div className="table-scroll">
                <table className="analog-table">
                  <thead>
                    <tr>
                      <th>Sessiya</th>
                      <th>Kanal</th>
                      <th>Boshlangan</th>
                      <th>Davomiyligi (daq:son)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.sessionId}>
                        <td style={{ fontFamily: "monospace" }}>{s.sessionId.slice(0, 8)}...</td>
                        <td>{CHANNEL_LABELS[s.channel] || s.channel}</td>
                        <td>{formatTime(s.createdAt)}</td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatDuration(Math.max(0, Math.floor((now - new Date(s.createdAt).getTime()) / 1000)))}
                        </td>
                        <td>
                          <button
                            className="btn btn-danger btn-icon"
                            onClick={() => endSession(s.sessionId)}
                            disabled={endingId === s.sessionId}
                            title="Suhbatni majburan tugatish"
                          >
                            <PhoneOff size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
