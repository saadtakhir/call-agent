"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Loader2, Play, Plus, Save, Trash2 } from "lucide-react";
import { useConfirm } from "./useConfirm";

const SECRET_MASK = "********";
const PARAM_TYPES = ["string", "number", "boolean"];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const BUILTIN_SAMPLES = {
  get_property_info: { regions: "Urganch shahri", category: "kvartira" },
};

function newCustomTool() {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    enabled: true,
    params: [],
    http: { method: "GET", url: "https://", headers: [], bodyTemplate: "" },
    timeoutMs: 8000,
  };
}

function sampleArgsFor(tool) {
  return Object.fromEntries(tool.params.filter((p) => p.name).map((p) => [p.name, p.type === "number" ? 1 : p.type === "boolean" ? true : "namuna"]));
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div className="muted" style={{ fontSize: "0.78rem", marginTop: 3 }}>{hint}</div>}
    </label>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
      {label}
    </label>
  );
}

function StatsLine({ stat }) {
  if (!stat) return <span className="muted" style={{ fontSize: "0.8rem" }}>So&apos;nggi 7 kunda chaqirilmagan</span>;
  return (
    <span style={{ fontSize: "0.8rem" }}>
      <span className="muted">7 kun: </span>
      {stat.calls} chaqiruv · <span style={{ color: stat.errors ? "var(--danger, #c0392b)" : undefined }}>{stat.errors} xato</span> · o&apos;rtacha {stat.avgMs} ms
      {stat.lastError && <div style={{ color: "var(--danger, #c0392b)", marginTop: 2 }}>Oxirgi xato: {stat.lastError}</div>}
    </span>
  );
}

/** Runs a tool once with the JSON arguments typed here and shows the raw
 * outcome — for built-ins by name, for custom tools the unsaved draft. */
function TestBox({ payload, initialArgs }) {
  const [argsText, setArgsText] = useState(() => JSON.stringify(initialArgs, null, 2));
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState(null);

  async function run() {
    setRunning(true);
    setOut(null);
    try {
      let args;
      try {
        args = JSON.parse(argsText || "{}");
      } catch {
        throw new Error("Argumentlar to'g'ri JSON emas.");
      }
      const res = await fetch("/api/ai-call/tools/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, args }),
      });
      setOut(await res.json());
    } catch (err) {
      setOut({ ok: false, error: err.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8 }}>
      <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Sinab ko&apos;rish</div>
      <textarea
        className="manage-input"
        style={{ width: "100%", minHeight: 70, fontFamily: "monospace", fontSize: "0.82rem" }}
        value={argsText}
        onChange={(e) => setArgsText(e.target.value)}
        spellCheck={false}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <button className="btn btn-outline" onClick={run} disabled={running} type="button">
          {running ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          Ishga tushirish
        </button>
        {out && (
          <span className={`status-pill ${out.ok ? "status-green" : "status-amber"}`}>
            {out.ok ? "Muvaffaqiyatli" : "Xato"}
            {out.ms != null && ` · ${out.ms} ms`}
          </span>
        )}
      </div>
      {out && (
        <pre
          style={{
            marginTop: 8,
            maxHeight: 260,
            overflow: "auto",
            fontSize: "0.78rem",
            background: "var(--surface-2, rgba(127,127,127,0.1))",
            padding: 10,
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(out.error ? { error: out.error } : out.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function BuiltinCard({ def, cfg, stat, onChange, limits, onLimits }) {
  const props = Object.entries(def.parameters.properties);
  const isSearch = def.name === "get_property_info";
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontWeight: 700 }}>{def.name}</div>
          <StatsLine stat={stat} />
        </div>
        <Toggle checked={cfg.enabled} onChange={(enabled) => onChange({ ...cfg, enabled })} label={cfg.enabled ? "Yoqilgan" : "O'chirilgan"} />
      </div>
      {!cfg.enabled && (
        <p className="muted" style={{ fontSize: "0.82rem", margin: "8px 0 0" }}>
          O&apos;chiq: model bu toolni ko&apos;rmaydi, system prompt&apos;ga esa &quot;bu funksiya hozircha ishlamayapti&quot; degan eslatma avtomatik qo&apos;shiladi.
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <Field label="Model uchun tavsif" hint="Model toolni qachon chaqirishini shu matn bo'yicha hal qiladi. Bo'sh qoldirsangiz, standart matn ishlatiladi.">
          <textarea
            className="manage-input"
            style={{ width: "100%", minHeight: 70 }}
            value={cfg.description}
            placeholder={def.description}
            onChange={(e) => onChange({ ...cfg, description: e.target.value })}
          />
        </Field>

        <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Parametrlar</div>
        {props.map(([pName, p]) => (
          <div key={pName} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: "0.82rem", minWidth: 120 }}>
              {pName} <span className="muted">({p.type})</span>
            </span>
            <input
              className="manage-input"
              style={{ flex: 1, minWidth: 200 }}
              value={cfg.paramDescriptions[pName] || ""}
              placeholder={p.description}
              onChange={(e) => onChange({ ...cfg, paramDescriptions: { ...cfg.paramDescriptions, [pName]: e.target.value } })}
            />
          </div>
        ))}

        {isSearch && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
            <Field label="Byudjet so'rash chegarasi" hint="Natijalar shundan ko'p bo'lsa va narx aytilmagan bo'lsa, AI ro'yxat o'rniga byudjetni so'raydi.">
              <input
                type="number"
                min={1}
                max={50}
                className="manage-input"
                style={{ width: 120 }}
                value={limits.listingLimit}
                onChange={(e) => onLimits({ ...limits, listingLimit: Number(e.target.value) })}
              />
            </Field>
            <Field label="Ro'yxatda ko'rsatiladigan maksimum" hint="Ro'yxat ko'rsatilganda eng ko'pi bilan nechta mulk aytiladi.">
              <input
                type="number"
                min={1}
                max={24}
                className="manage-input"
                style={{ width: 120 }}
                value={limits.maxListingsShown}
                onChange={(e) => onLimits({ ...limits, maxListingsShown: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}

        {BUILTIN_SAMPLES[def.name] ? (
          <TestBox payload={{ name: def.name }} initialArgs={BUILTIN_SAMPLES[def.name]} />
        ) : (
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
            Bu tool haqiqiy ariza yaratadi va xodimlarga Telegram xabar yuboradi, shuning uchun bu yerda sinab ko&apos;rish o&apos;chirilgan.
          </p>
        )}
      </div>
    </div>
  );
}

function CustomCard({ tool, stat, open, onToggleOpen, onChange, onDelete }) {
  const set = (patch) => onChange({ ...tool, ...patch });
  const setHttp = (patch) => onChange({ ...tool, http: { ...tool.http, ...patch } });
  const noBody = tool.http.method === "GET" || tool.http.method === "DELETE";

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontWeight: 700 }}>{tool.name || "(nomsiz tool)"}</div>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            {tool.http.method} {tool.http.url}
          </div>
          <StatsLine stat={stat} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Toggle checked={tool.enabled} onChange={(enabled) => set({ enabled })} label={tool.enabled ? "Yoqilgan" : "O'chirilgan"} />
          <button className="btn btn-outline btn-icon" onClick={onToggleOpen} type="button" title="Tahrirlash">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button className="btn btn-danger btn-icon" onClick={onDelete} type="button" title="O'chirish">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <Field label="Nomi" hint="Faqat lotin harflari, raqam va _ (masalan get_exchange_rate). Model toolni shu nom bilan chaqiradi.">
            <input className="manage-input" style={{ width: "100%", fontFamily: "monospace" }} value={tool.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Tavsif" hint="Model uchun: bu tool nima qiladi va qachon chaqirish kerak. Aniq yozing.">
            <textarea className="manage-input" style={{ width: "100%", minHeight: 70 }} value={tool.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>

          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Parametrlar (model shularni to&apos;ldirib yuboradi)</div>
          {tool.params.map((p, i) => {
            const setParam = (patch) => set({ params: tool.params.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input className="manage-input" style={{ width: 140, fontFamily: "monospace" }} placeholder="nomi" value={p.name} onChange={(e) => setParam({ name: e.target.value })} />
                <select className="manage-input" value={p.type} onChange={(e) => setParam({ type: e.target.value })}>
                  {PARAM_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <input className="manage-input" style={{ flex: 1, minWidth: 160 }} placeholder="tavsif (model uchun)" value={p.description} onChange={(e) => setParam({ description: e.target.value })} />
                <Toggle checked={p.required} onChange={(required) => setParam({ required })} label="majburiy" />
                <button className="btn btn-danger btn-icon" type="button" onClick={() => set({ params: tool.params.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button className="btn btn-outline" type="button" onClick={() => set({ params: [...tool.params, { name: "", type: "string", description: "", required: false }] })} disabled={tool.params.length >= 12}>
            <Plus size={14} /> Parametr qo&apos;shish
          </button>

          <div style={{ fontWeight: 600, fontSize: "0.85rem", margin: "18px 0 6px" }}>HTTP so&apos;rov</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <select className="manage-input" value={tool.http.method} onChange={(e) => setHttp({ method: e.target.value })}>
              {HTTP_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input className="manage-input" style={{ flex: 1, fontFamily: "monospace" }} placeholder="https://api.example.com/rate?ccy={{currency}}" value={tool.http.url} onChange={(e) => setHttp({ url: e.target.value })} />
          </div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 10px" }}>
            Manzil va body ichida <code>{"{{parametr_nomi}}"}</code> yozsangiz, model bergan qiymat shu joyga qo&apos;yiladi. Faqat https, ichki/lokal manzillarga ruxsat yo&apos;q.
            {noBody && " GET/DELETE'da manzilda ishlatilmagan parametrlar avtomatik ?kalit=qiymat ko'rinishida qo'shiladi."}
          </p>

          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Headerlar (masalan Authorization)</div>
          {tool.http.headers.map((h, i) => {
            const setHeader = (patch) => setHttp({ headers: tool.http.headers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input className="manage-input" style={{ width: 180 }} placeholder="Authorization" value={h.key} onChange={(e) => setHeader({ key: e.target.value })} />
                <input
                  className="manage-input"
                  style={{ flex: 1 }}
                  type="password"
                  autoComplete="off"
                  placeholder="Bearer ..."
                  value={h.value}
                  onFocus={(e) => h.value === SECRET_MASK && e.target.select()}
                  onChange={(e) => setHeader({ value: e.target.value })}
                />
                <button className="btn btn-danger btn-icon" type="button" onClick={() => setHttp({ headers: tool.http.headers.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button className="btn btn-outline" type="button" onClick={() => setHttp({ headers: [...tool.http.headers, { key: "", value: "" }] })} disabled={tool.http.headers.length >= 10}>
            <Plus size={14} /> Header qo&apos;shish
          </button>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "6px 0 0" }}>
            Header qiymatlari bazada saqlanadi va bu yerda ko&apos;rsatilmaydi (yulduzchalar). O&apos;zgartirmasangiz, eskisi saqlanib qoladi.
          </p>

          {!noBody && (
            <Field label="Body shabloni (JSON)" hint={'Bo\'sh qoldirsangiz, barcha parametrlar JSON obyekt sifatida yuboriladi. Masalan: {"chat": "{{chat_id}}", "amount": "{{amount}}"} — qo\'shtirnoqsiz {{amount}} son turini saqlaydi.'}>
              <textarea className="manage-input" style={{ width: "100%", minHeight: 80, fontFamily: "monospace", fontSize: "0.82rem" }} value={tool.http.bodyTemplate} onChange={(e) => setHttp({ bodyTemplate: e.target.value })} spellCheck={false} />
            </Field>
          )}

          <Field label="Kutish vaqti (ms)" hint="1000–20000. Shundan oshsa so'rov to'xtatiladi va model xato oladi.">
            <input type="number" min={1000} max={20000} step={500} className="manage-input" style={{ width: 140 }} value={tool.timeoutMs} onChange={(e) => set({ timeoutMs: Number(e.target.value) })} />
          </Field>

          <TestBox key={tool.params.map((p) => p.name).join(",")} payload={{ draft: tool }} initialArgs={sampleArgsFor(tool)} />
        </div>
      )}
    </div>
  );
}

const CHECKS = [
  { target: "property", title: "Mulklar API (uy-joy.uz)", hint: "get_property_info shu manzildan ma'lumot oladi." },
  { target: "openai", title: "OpenAI", hint: "AI javoblari va ovozni matnga aylantirish. Kalit, hisob balansi va model shu yerda tekshiriladi." },
  { target: "elevenlabs", title: "ElevenLabs", hint: "Matnni ovozga aylantirish. Oylik belgilar limiti ham ko'rsatiladi." },
  { target: "idpath", title: "Mulk ID yo'li (bosqichma-bosqich)", hint: "ID aytilganda sodir bo'ladigan ishlarni (baza, uy-joy, audio) alohida vaqt bilan o'lchaydi. Sekinlik yoki uzilish qaysi bosqichdaligini ko'rsatadi." },
  { target: "agent", title: "AI agent (to'liq sinov)", hint: "Haqiqiy 'salom' xabari bilan butun agent zanjirini ishga tushiradi (prompt, toollar, OpenAI, baza). Telegram/qo'ng'iroqdagi xatoning aniq sababini ko'rsatadi." },
];

function describeOk(h) {
  const parts = [`Ishlayapti · ${h.ms} ms`];
  if (h.model) parts.push(h.model);
  if (h.reply) parts.push(`javob: "${h.reply}"`);
  if (h.limit != null) parts.push(`${h.used?.toLocaleString?.() ?? h.used} / ${h.limit.toLocaleString()} belgi`);
  return parts.join(" · ");
}

/** Settings tab for everything about the AI agent's tools — see lib/aiTools.js. */
export default function ToolsPanel() {
  const { confirm, dialog } = useConfirm();
  const [defaults, setDefaults] = useState([]);
  const [stats, setStats] = useState({});
  const [config, setConfig] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // Per-target result / pending state for the connection checks, keyed by target name.
  const [health, setHealth] = useState({});
  const [checking, setChecking] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai-call/tools");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik");
        setDefaults(data.defaults);
        setStats(data.stats || {});
        setConfig(data.config);
        setSavedJson(JSON.stringify(data.config));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = config !== null && JSON.stringify(config) !== savedJson;

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/ai-call/tools", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setConfig(data.config);
      setSavedJson(JSON.stringify(data.config));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function checkHealth(target) {
    setChecking((c) => ({ ...c, [target]: true }));
    try {
      const res = await fetch(`/api/ai-call/tools/health?target=${target}`);
      const result = await res.json();
      setHealth((h) => ({ ...h, [target]: result }));
    } catch (err) {
      setHealth((h) => ({ ...h, [target]: { ok: false, error: err.message } }));
    } finally {
      setChecking((c) => ({ ...c, [target]: false }));
    }
  }

  async function removeCustom(tool) {
    if (!(await confirm(`"${tool.name || "nomsiz tool"}" toolini o'chirishni tasdiqlaysizmi? (Saqlash tugmasini bosgandan keyin kuchga kiradi.)`))) return;
    setConfig((c) => ({ ...c, custom: c.custom.filter((t) => t.id !== tool.id) }));
  }

  if (loading) return <p className="muted">Yuklanmoqda...</p>;
  if (!config) return <div className="error-banner">{error || "Yuklab bo'lmadi."}</div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 18 }}>
        AI agent ishlatadigan funksiyalar (toollar). Bu yerdagi o&apos;zgarishlar Saqlash bosilgach taxminan 15 soniya ichida keyingi gaplardan boshlab qo&apos;llanadi — kod
        o&apos;zgartirish yoki qayta deploy shart emas. Toollar ovozli qo&apos;ng&apos;iroqda ham, Telegram&apos;da ham bir xil ishlaydi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Ulanishlar holati</div>
        {CHECKS.map((chk) => {
          const h = health[chk.target];
          return (
            <div
              key={chk.target}
              style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--border)" }}
            >
              <Activity size={16} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{chk.title}</div>
                <div className="muted" style={{ fontSize: "0.78rem" }}>{chk.hint}</div>
              </div>
              {h && (
                <span className={`status-pill ${h.ok ? "status-green" : "status-amber"}`} style={{ maxWidth: 420, whiteSpace: "normal" }}>
                  {h.ok ? describeOk(h) : `Xato${h.error ? `: ${h.error}` : ""}`}
                </span>
              )}
              <button className="btn btn-outline" onClick={() => checkHealth(chk.target)} disabled={checking[chk.target]} type="button">
                {checking[chk.target] ? <Loader2 size={14} className="spin" /> : <Activity size={14} />}
                Tekshirish
              </button>
              {h?.stages && (
                <div style={{ flexBasis: "100%", fontSize: "0.8rem", paddingLeft: 28 }}>
                  {h.stages.map((s, i) => (
                    <div key={i} style={{ color: s.ok ? undefined : "var(--danger, #c0392b)" }}>
                      {s.ok ? "✓" : "✗"} {s.name} — <strong>{s.ms} ms</strong>
                      {s.detail ? <span className="muted"> · {s.detail}</span> : null}
                    </div>
                  ))}
                  {h.ms != null && (
                    <div style={{ marginTop: 4 }}>
                      Jami: <strong>{h.ms} ms</strong>
                      {h.note ? <span className="muted"> · {h.note}</span> : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h3 style={{ margin: "0 0 10px" }}>Tayyor toollar</h3>
      {defaults.map((def) => (
        <BuiltinCard
          key={def.name}
          def={def}
          cfg={config.builtin[def.name]}
          stat={stats[def.name]}
          onChange={(next) => setConfig((c) => ({ ...c, builtin: { ...c.builtin, [def.name]: next } }))}
          limits={config.limits}
          onLimits={(limits) => setConfig((c) => ({ ...c, limits }))}
        />
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "26px 0 10px", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Qo&apos;shimcha toollar (HTTP)</h3>
        <button
          className="btn"
          type="button"
          disabled={config.custom.length >= 30}
          onClick={() => {
            const tool = newCustomTool();
            setConfig((c) => ({ ...c, custom: [...c.custom, tool] }));
            setOpenId(tool.id);
          }}
        >
          <Plus size={14} /> Yangi tool
        </button>
      </div>
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        Har qanday tashqi servisga (o&apos;zingizning API, valyuta kursi, CRM, webhook...) HTTP so&apos;rov yuboradigan yangi funksiya qo&apos;shing. Model uni tavsifga qarab
        o&apos;zi chaqiradi va javobni gapiga qo&apos;shadi. Yangi tool ishlashi uchun System Message&apos;da ham uni qachon ishlatishni yozib qo&apos;ysangiz yaxshi bo&apos;ladi.
      </p>
      {config.custom.length === 0 ? (
        <p className="muted">Hozircha qo&apos;shimcha tool yo&apos;q.</p>
      ) : (
        config.custom.map((tool) => (
          <CustomCard
            key={tool.id}
            tool={tool}
            stat={stats[tool.name]}
            open={openId === tool.id}
            onToggleOpen={() => setOpenId(openId === tool.id ? null : tool.id)}
            onChange={(next) => setConfig((c) => ({ ...c, custom: c.custom.map((t) => (t.id === tool.id ? next : t)) }))}
            onDelete={() => removeCustom(tool)}
          />
        ))
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, position: "sticky", bottom: 0, padding: "12px 0", background: "var(--bg, transparent)" }}>
        <button className="btn" onClick={save} disabled={saving || !dirty} type="button">
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          Saqlash
        </button>
        {dirty && (
          <button className="btn btn-outline" type="button" onClick={() => setConfig(JSON.parse(savedJson))} disabled={saving}>
            O&apos;zgarishlarni bekor qilish
          </button>
        )}
        {dirty && <span className="status-pill status-amber">Saqlanmagan o&apos;zgarishlar</span>}
        {saved && <span className="status-pill status-green">Saqlandi</span>}
      </div>
      {dialog}
    </div>
  );
}
