"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, Volume2, Plus } from "lucide-react";
import { useConfirm } from "./useConfirm";

/** Admin panel for the call agent's canned-response library (see
 * lib/cannedResponses.js) — a fixed reply's audio is synthesized once here
 * and reused by every call afterward instead of hitting ElevenLabs live
 * each time. Editing an entry's text clears its cached audio (enforced
 * server-side) so "Audio yaratish" always needs re-running after a wording
 * change — reflected here by audioUrl going back to empty right after save. */
export default function CannedResponsesPanel() {
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatingId, setGeneratingId] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const [newKey, setNewKey] = useState("");
  const [newText, setNewText] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/ai-call/canned-responses");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setItems(data.items);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function createEntry() {
    if (!newKey.trim() || !newText.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/ai-call/canned-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey, text: newText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setItems((prev) => [...prev, data.item].sort((a, b) => a.key.localeCompare(b.key)));
      setNewKey("");
      setNewText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function saveText(item, text) {
    setSavingId(item.id);
    setError("");
    try {
      const res = await fetch(`/api/ai-call/canned-responses/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function generateAudio(item) {
    setGeneratingId(item.id);
    setError("");
    try {
      const res = await fetch(`/api/ai-call/canned-responses/${item.id}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)));
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingId(null);
    }
  }

  async function removeEntry(item) {
    if (!(await confirm(`"${item.key}" javobini o'chirishni tasdiqlaysizmi?`))) return;
    setError("");
    try {
      const res = await fetch(`/api/ai-call/canned-responses/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Tayyor javoblar kutubxonasi</h2>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Tez-tez takrorlanadigan javoblar (masalan &quot;tushunmadim&quot; xabari) uchun ovozni oldindan generatsiya qilib
        saqlaymiz — AI Agent javobi shu matn bilan aynan mos kelsa, ElevenLabs&apos;ga qayta murojaat qilinmaydi, tayyor
        ovoz darhol ijro etiladi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="section">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Yangi javob qo&apos;shish</div>
        <div className="add-channel-row">
          <input
            className="manage-input"
            style={{ maxWidth: 200 }}
            placeholder="kalit (masalan: fallback)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <input
            className="manage-input"
            style={{ flex: 1, minWidth: 260 }}
            placeholder="AI aynan aytadigan to'liq matn"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <button className="btn" onClick={createEntry} disabled={creating || !newKey.trim() || !newText.trim()}>
            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Qo&apos;shish
          </button>
        </div>
      </div>

      <div className="section">
        {loading ? (
          <p className="muted">Yuklanmoqda...</p>
        ) : items.length === 0 ? (
          <p className="muted">Hozircha tayyor javob yo&apos;q.</p>
        ) : (
          <div className="table-scroll">
            <table className="analog-table manage-table">
              <thead>
                <tr>
                  <th>Kalit</th>
                  <th>Matn</th>
                  <th>Audio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <CannedResponseRow
                    key={item.id}
                    item={item}
                    saving={savingId === item.id}
                    generating={generatingId === item.id}
                    onSaveText={(text) => saveText(item, text)}
                    onGenerate={() => generateAudio(item)}
                    onRemove={() => removeEntry(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog}
    </div>
  );
}

function CannedResponseRow({ item, saving, generating, onSaveText, onGenerate, onRemove }) {
  const [text, setText] = useState(item.text);
  const dirty = text.trim() !== item.text;

  return (
    <tr>
      <td style={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>{item.key}</td>
      <td style={{ minWidth: 260 }}>
        <textarea
          className="manage-input"
          style={{ width: "100%", minHeight: 50, resize: "vertical" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {dirty && (
          <button className="btn btn-outline" style={{ marginTop: 6 }} onClick={() => onSaveText(text)} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : "Saqlash"}
          </button>
        )}
      </td>
      <td>
        <span className={`status-pill ${item.audioUrl ? "status-green" : "status-gray"}`}>{item.audioUrl ? "Tayyor" : "Yo'q"}</span>
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-outline btn-icon" onClick={onGenerate} disabled={generating || dirty} title="Audio yaratish/yangilash">
            {generating ? <Loader2 size={14} className="spin" /> : <Volume2 size={14} />}
          </button>
          {item.audioUrl && (
            // Vercel Blob overwrites this same URL in place on regenerate
            // (lib/blobService.js) — without a cache-busting query param
            // keyed to updatedAt, the browser (or an intermediate cache)
            // would keep serving whatever it fetched from this exact URL
            // before, even after the underlying file actually changed.
            <a
              className="btn btn-outline btn-icon"
              href={`${item.audioUrl}?v=${encodeURIComponent(item.updatedAt)}`}
              target="_blank"
              rel="noreferrer"
              title="Tinglash"
            >
              ▶
            </a>
          )}
          <button className="btn btn-danger btn-icon" onClick={onRemove} title="O'chirish">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
