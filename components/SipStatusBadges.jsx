"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, PhoneCall, Clock, ShieldCheck, ShieldAlert } from "lucide-react";

const POLL_MS = 5000;

function timeAgo(iso) {
  if (!iso) return "hech qachon";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s oldin`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m oldin`;
  const hours = Math.floor(minutes / 60);
  return `${hours}s oldin`;
}

/** Live status of sip-bridge/ — the Vercel app can't reach INTO the VPS
 * (no persistent connection), so this only ever reflects whatever the
 * bridge last PUSHED in its heartbeat (see /api/ai-call/sip-heartbeat and
 * lib/sipStatus.js), including Asterisk's own PJSIP registration state
 * with the PBX (read via the local `asterisk` CLI — see
 * sip-bridge/src/asteriskStatus.js). */
export default function SipStatusBadges() {
  const [status, setStatus] = useState(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ai-call/sip-status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // Best-effort — a missed poll just means the badges stay on
        // whatever they last showed until the next tick.
      }
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Re-renders the "X oldin" text every second even between polls, so it
  // doesn't look frozen while waiting for the next fetch.
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
      <span className={`status-pill ${status.online ? "status-green" : "status-gray"}`}>
        {status.online ? <Wifi size={13} /> : <WifiOff size={13} />}
        {status.online ? "Bridge onlayn" : "Bridge oflayn"}
      </span>
      <span className="status-pill status-gray">
        <PhoneCall size={13} />
        Faol qo&apos;ng&apos;iroqlar: {status.activeCalls}
      </span>
      <span className="status-pill status-gray">
        <Clock size={13} />
        Oxirgi aloqa: {timeAgo(status.lastHeartbeatAt)}
      </span>
      {status.online && (
        <span className={`status-pill ${status.pbxRegistered ? "status-green" : "status-amber"}`}>
          {status.pbxRegistered ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
          PBX: {status.pbxStatusDetail || (status.pbxRegistered ? "Registered" : "Noma'lum")}
        </span>
      )}
    </div>
  );
}
