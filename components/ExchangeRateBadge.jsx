"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";

const REFRESH_MS = 30 * 60 * 1000; // matches the server-side CBU cache TTL (1h) closely enough

/** Live USD/UZS rate (see /api/exchange-rate, lib/exchangeRate.js) shown
 * in the sidebar purely as a convenience reference for whoever's looking
 * at Xarajatlar's so'm figures — not tied to any permission, since it's
 * public CBU data and every signed-in user sees the sidebar anyway. */
export default function ExchangeRateBadge() {
  const [rate, setRate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/exchange-rate");
        const data = await res.json();
        if (!cancelled && res.ok) setRate(data.rate);
      } catch {
        // Best-effort — the badge just doesn't render if this fails.
      }
    }
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!rate) return null;

  return (
    <div className="exchange-rate-badge">
      <span className="exchange-rate-badge-icon">
        <DollarSign size={16} />
      </span>
      <div className="exchange-rate-badge-text">
        <div className="exchange-rate-badge-label">USD/UZS</div>
        <div className="exchange-rate-badge-value">{Math.round(rate).toLocaleString()} so&apos;m</div>
      </div>
    </div>
  );
}
