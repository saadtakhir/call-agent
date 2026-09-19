"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SIP_PROXY_OPTIONS } from "@/lib/sipProxyOptions";

/** PBX (FreePBX/Asterisk) SIP credentials the sip-bridge/ VPS service
 * registers with — live-editable here instead of a static .env, the same
 * reasoning as every other setting on this page. See sip-bridge/README.md
 * for how the bridge fetches this same config at startup. */
export default function SipConfigPanel() {
  const [extension, setExtension] = useState("");
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState("");
  const [proxy, setProxy] = useState("none");
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/sip-config");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setExtension(data.extension || "");
        setPassword(data.password || "");
        setDomain(data.domain || "");
        setProxy(data.proxy || "none");
        setSaved(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ai-call/sip-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension, password, domain, proxy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setExtension(data.extension || "");
      setPassword(data.password || "");
      setDomain(data.domain || "");
      setProxy(data.proxy || "none");
      setSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    saved !== null &&
    (extension !== (saved.extension || "") ||
      password !== (saved.password || "") ||
      domain !== (saved.domain || "") ||
      proxy !== (saved.proxy || "none"));

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>SIP sozlamalari</h2>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>PBX tizimingiz uchun ulanish sozlamalari</p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda...</p>
      ) : (
        <>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <h3 style={{ margin: "0 0 4px" }}>SIP hisob ma&apos;lumotlari</h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: "0.85rem" }}>
              Bu hisob ma&apos;lumotlari agentni PBX bilan ro&apos;yxatdan o&apos;tkazish uchun ishlatiladi
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: "0.85rem" }}>Kengaytma *</label>
                <input
                  className="manage-input"
                  value={extension}
                  onChange={(e) => setExtension(e.target.value)}
                />
              </div>
              <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: "0.85rem" }}>SIP paroli *</label>
                <input
                  className="manage-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            <label style={{ fontSize: "0.85rem" }}>SIP domeni (ixtiyoriy)</label>
            <input
              className="manage-input"
              style={{ maxWidth: 320 }}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Tizim standartidan foydalanish uchun bo&apos;sh qoldiring
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            <label style={{ fontSize: "0.85rem" }}>SIP Proxy Server</label>
            <select
              className="manage-input"
              style={{ maxWidth: 320 }}
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
            >
              {SIP_PROXY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Ba&apos;zi provayderlar geografik jihatdan cheklangan bo&apos;lishi mumkin — agar ulanishda muammo
              bo&apos;lsa, boshqa serverni tanlab ko&apos;ring
            </p>
          </div>

          <button className="btn" onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 size={14} className="spin" />}
            Saqlash
          </button>
        </>
      )}
    </div>
  );
}
