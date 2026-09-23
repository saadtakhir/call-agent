"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Link2 } from "lucide-react";

/** Status + one-click webhook (re)registration for the Telegram support
 * bot (see app/api/telegram/webhook/route.js) — replaces having to run
 * curl commands by hand every time the token, secret, or domain changes. */
export default function TelegramConfigPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function registerWebhook() {
    setRegistering(true);
    setRegisterMessage("");
    setError("");
    try {
      const res = await fetch("/api/telegram/setup-webhook", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setRegisterMessage(`Ulandi: ${data.webhookUrl}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Support Telegram bot (@erieltorbot) — mijozlar bilan matnli yozishmalarga xuddi qo&apos;ng&apos;iroq
        agenti kabi javob beradi. <code>/start</code> — salomlashish, <code>/reset</code> — suhbatni tozalash.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {registerMessage && <div className="success-banner">{registerMessage}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        status && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {status.botConfigured ? <CheckCircle2 size={16} color="var(--green)" /> : <XCircle size={16} color="var(--red)" />}
              <span>Bot tokeni: {status.botConfigured ? "sozlangan" : "sozlanmagan (TELEGRAM_SUPPORT_BOT_TOKEN)"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {status.secretConfigured ? <CheckCircle2 size={16} color="var(--green)" /> : <XCircle size={16} color="var(--red)" />}
              <span>Webhook sekreti: {status.secretConfigured ? "sozlangan" : "sozlanmagan (TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET)"}</span>
            </div>

            {status.webhook && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {status.webhook.url ? <CheckCircle2 size={16} color="var(--green)" /> : <XCircle size={16} color="var(--amber)" />}
                  <span>
                    Webhook: {status.webhook.url ? <code>{status.webhook.url}</code> : <span className="muted">ro&apos;yxatdan o&apos;tmagan</span>}
                  </span>
                </div>
                {status.webhook.pending_update_count > 0 && (
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                    Yetkazilmagan xabarlar: {status.webhook.pending_update_count}
                  </p>
                )}
                {status.webhook.last_error_message && (
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--red)" }}>
                    Oxirgi xato: {status.webhook.last_error_message}
                  </p>
                )}
              </>
            )}

            <div>
              <button className="btn" onClick={registerWebhook} disabled={registering || !status.botConfigured || !status.secretConfigured}>
                {registering ? <Loader2 size={14} className="spin" /> : status.webhook?.url ? <RefreshCw size={14} /> : <Link2 size={14} />}
                {status.webhook?.url ? "Qayta ulash" : "Webhookni ulash"}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
