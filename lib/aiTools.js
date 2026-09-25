import { after } from "next/server";
import { config as appConfig } from "./config.js";
import { getSetting, setSetting } from "./appSettings.js";
import { prisma } from "./prisma.js";
import { lookupPropertyInfo, searchCatalog } from "./uyJoyCatalogService.js";
import { createPropertyLead } from "./propertyLeadService.js";

// Everything about the AI agent's tools that an admin can change from the
// Toollar settings tab (components/ToolsPanel.jsx): turning the two
// built-in tools on/off, rewording what the model is told about them,
// tuning their limits, and defining entirely new HTTP-backed tools — saved
// as one JSON blob in AppSetting, so none of it needs a redeploy.

const SETTING_KEY = "aiCallToolsConfig";
const CACHE_TTL_MS = 15_000; // per serverless instance — a save elsewhere shows up here within this long
const MAX_CUSTOM_TOOLS = 30;
const MAX_RESPONSE_CHARS = 6000;

/** Header values are never sent back to the browser — the UI shows this
 * instead, and a save that still contains it keeps the stored value. */
export const SECRET_MASK = "********";

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
const HEADER_RE = /^[A-Za-z0-9-]{1,64}$/;
const PARAM_TYPES = ["string", "number", "boolean"];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// The two tools the agent shipped with — these definitions are the DEFAULTS;
// an admin's saved description/parameter wording (see applyOverrides) is
// layered on top without touching them.
export const BUILTIN_TOOL_DEFS = [
  {
    type: "function",
    name: "get_property_info",
    description:
      "E-rieltor.uz'dagi mulk haqida ma'lumot qidiradi. Mulk ID raqami, hudud nomi va/yoki mulk turi ma'lum bo'lganda chaqiring — narx, joylashuv va boshqa xususiyatlarni qaytaradi.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Mulk ID raqami (6 xonali, faqat raqam) — mavjud bo'lsa." },
        regions: {
          type: "string",
          description: "Hudud nomi(lari), vergul bilan ajratilgan — masalan \"Xorazm viloyati, Shovot tumani\". ID emas, NOM yuboring.",
        },
        category: { type: "string", description: "Mulk turi: \"kvartira\", \"xususiy uy\" yoki \"tijorat bino\"." },
        minPrice: { type: "number", description: "Mijoz aytgan minimal narx (so'mda) — natija juda ko'p bo'lganda qidiruvni toraytirish uchun." },
        maxPrice: { type: "number", description: "Mijoz aytgan maksimal narx (so'mda) — natija juda ko'p bo'lganda qidiruvni toraytirish uchun." },
        minArea: { type: "number", description: "Mijoz aytgan minimal maydon (kvadrat metrda) — natija juda ko'p bo'lganda qidiruvni toraytirish uchun." },
        maxArea: { type: "number", description: "Mijoz aytgan maksimal maydon (kvadrat metrda) — natija juda ko'p bo'lganda qidiruvni toraytirish uchun." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_property_lead",
    description: "Mijoz sotib olishga qiziqqanda yoki qo'shimcha ma'lumot kerak bo'lganda, uning ismi va telefon raqamini ariza sifatida qabul qiladi.",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Mijoz qiziqqan mulkning ID raqami." },
        name: { type: "string", description: "Mijozning ismi." },
        phone: { type: "string", description: "Mijozning telefon raqami." },
        note: { type: "string", description: "Mijoz nima haqida qiziqqani (qisqacha)." },
      },
      required: ["name", "phone"],
      additionalProperties: false,
    },
  },
];

const BUILTIN_NAMES = BUILTIN_TOOL_DEFS.map((d) => d.name);

// Appended to the system prompt while a built-in tool is switched off, so
// the prompt's own instructions ("always call get_property_info...") don't
// leave the model stuck trying to use something it no longer has.
const DISABLED_NOTES = {
  get_property_info:
    "DIQQAT: get_property_info funksiyasi hozircha O'CHIRILGAN. Mulk ma'lumotini ola olmaysiz va o'zingizdan hech narsa to'qib chiqarmang — mijozga mulklar bazasi hozir vaqtincha ishlamayotganini muloyimlik bilan ayting va xohlasa, ariza qoldirishni taklif qiling.",
  create_property_lead:
    "DIQQAT: create_property_lead funksiyasi hozircha O'CHIRILGAN. Ariza qabul qila olmaysiz — ism va telefon so'ramang; mijozga hozircha ariza qabul qilinmayotganini ayting va keyinroq qayta qo'ng'iroq qilishini so'rang.",
};

function defaultConfig() {
  return {
    builtin: Object.fromEntries(BUILTIN_NAMES.map((n) => [n, { enabled: true, description: "", paramDescriptions: {} }])),
    limits: { listingLimit: 5, maxListingsShown: 8 },
    custom: [],
  };
}

function intInRange(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function str(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/** Rejects anything but a plain public https URL. Custom tools make the
 * SERVER call whatever an admin typed in, so this at least keeps that off
 * localhost, private/link-local ranges (incl. the cloud metadata address)
 * and non-https schemes. It does not resolve DNS — a hostname that points
 * at a private address would slip through — but Vercel functions have no
 * private network to reach anyway. */
export function assertSafeUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("URL noto'g'ri.");
  }
  if (url.protocol !== "https:") throw new Error("Faqat https:// manzillarga ruxsat beriladi.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost") || host.startsWith("[")) {
    throw new Error("Ichki/lokal manzilga ruxsat yo'q.");
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const priv =
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
    if (priv) throw new Error("Ichki/lokal manzilga ruxsat yo'q.");
  }
  return url;
}

function normalizeCustomTool(input, previousTools, seenNames) {
  const name = str(input?.name, 64);
  if (!NAME_RE.test(name)) throw new Error(`Tool nomi noto'g'ri: "${name}" — faqat lotin harflari, raqam va _ (harf bilan boshlanishi kerak).`);
  if (BUILTIN_NAMES.includes(name)) throw new Error(`"${name}" — tayyor tool nomi, boshqa nom tanlang.`);
  if (seenNames.has(name)) throw new Error(`"${name}" nomi takrorlangan.`);
  seenNames.add(name);

  const description = str(input?.description, 1000);
  if (!description) throw new Error(`"${name}": tavsif kerak — model shu matn bo'yicha toolni qachon chaqirishni hal qiladi.`);

  const paramNames = new Set();
  const params = (Array.isArray(input?.params) ? input.params : []).slice(0, 12).map((p) => {
    const pn = str(p?.name, 64);
    if (!NAME_RE.test(pn)) throw new Error(`"${name}": parametr nomi noto'g'ri: "${pn}".`);
    if (paramNames.has(pn)) throw new Error(`"${name}": "${pn}" parametri takrorlangan.`);
    paramNames.add(pn);
    return {
      name: pn,
      type: PARAM_TYPES.includes(p?.type) ? p.type : "string",
      description: str(p?.description, 300),
      required: p?.required === true,
    };
  });

  const method = HTTP_METHODS.includes(input?.http?.method) ? input.http.method : "GET";
  const url = str(input?.http?.url, 1000);
  // Validated with placeholders filled in, since {{x}} itself isn't URL-safe.
  assertSafeUrl(url.replace(/\{\{\w+\}\}/g, "x"));

  const id = str(input?.id, 64) || crypto.randomUUID();
  const previous = previousTools?.find((t) => t.id === id);
  const headers = (Array.isArray(input?.http?.headers) ? input.http.headers : []).slice(0, 10).map((h) => {
    const key = str(h?.key, 64);
    if (!HEADER_RE.test(key)) throw new Error(`"${name}": header nomi noto'g'ri: "${key}".`);
    let value = String(h?.value ?? "").slice(0, 2000);
    if (value === SECRET_MASK) {
      const old = previous?.http?.headers?.find((x) => x.key.toLowerCase() === key.toLowerCase());
      if (!old) throw new Error(`"${name}": "${key}" headerining qiymatini qayta kiriting.`);
      value = old.value;
    }
    return { key, value };
  });

  const bodyTemplate = String(input?.http?.bodyTemplate ?? "").slice(0, 4000);
  if (bodyTemplate.trim() && method !== "GET" && method !== "DELETE") {
    const probe = fillBody(bodyTemplate, Object.fromEntries(params.map((p) => [p.name, p.type === "number" ? 1 : p.type === "boolean" ? true : "x"])));
    try {
      JSON.parse(probe);
    } catch {
      throw new Error(`"${name}": Body shabloni to'g'ri JSON emas.`);
    }
  }

  return {
    id,
    name,
    description,
    enabled: input?.enabled !== false,
    params,
    http: { method, url, headers, bodyTemplate },
    timeoutMs: intInRange(input?.timeoutMs, 1000, 20000, 8000),
  };
}

/** Validates and cleans a config coming from the UI (or storage). `previous`
 * is the currently saved config — only used to restore masked header values. */
export function normalizeToolConfig(input, previous = null) {
  const base = defaultConfig();
  const builtin = {};
  for (const name of BUILTIN_NAMES) {
    const c = input?.builtin?.[name] || {};
    const def = BUILTIN_TOOL_DEFS.find((d) => d.name === name);
    const paramDescriptions = {};
    for (const [p, d] of Object.entries(c.paramDescriptions || {})) {
      if (def.parameters.properties[p] && typeof d === "string" && d.trim()) paramDescriptions[p] = d.trim().slice(0, 300);
    }
    builtin[name] = { enabled: c.enabled !== false, description: str(c.description, 1000), paramDescriptions };
  }

  const limits = {
    listingLimit: intInRange(input?.limits?.listingLimit, 1, 50, base.limits.listingLimit),
    maxListingsShown: intInRange(input?.limits?.maxListingsShown, 1, 24, base.limits.maxListingsShown),
  };

  const seenNames = new Set();
  const list = Array.isArray(input?.custom) ? input.custom : [];
  if (list.length > MAX_CUSTOM_TOOLS) throw new Error(`Eng ko'pi bilan ${MAX_CUSTOM_TOOLS} ta qo'shimcha tool.`);
  const custom = list.map((t) => normalizeCustomTool(t, previous?.custom, seenNames));

  return { builtin, limits, custom };
}

/** Same config with every header value replaced by SECRET_MASK — what the
 * browser is allowed to see. */
export function toPublicConfig(config) {
  return {
    ...config,
    custom: config.custom.map((t) => ({
      ...t,
      http: { ...t.http, headers: t.http.headers.map((h) => ({ key: h.key, value: h.value ? SECRET_MASK : "" })) },
    })),
  };
}

let cache = { at: 0, value: null };

async function readStoredConfig() {
  try {
    const raw = await getSetting(SETTING_KEY, null);
    return raw ? normalizeToolConfig(JSON.parse(raw)) : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export async function getToolConfig() {
  if (cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const value = await readStoredConfig();
  cache = { at: Date.now(), value };
  return value;
}

export async function saveToolConfig(input) {
  const previous = await readStoredConfig();
  const next = normalizeToolConfig(input, previous);
  await setSetting(SETTING_KEY, JSON.stringify(next));
  cache = { at: 0, value: null };
  return next;
}

function applyOverrides(def, c) {
  const tool = JSON.parse(JSON.stringify(def));
  if (c.description) tool.description = c.description;
  for (const [p, d] of Object.entries(c.paramDescriptions)) {
    if (tool.parameters.properties[p]) tool.parameters.properties[p].description = d;
  }
  return tool;
}

function buildCustomSchema(t) {
  return {
    type: "function",
    name: t.name,
    description: t.description,
    parameters: {
      type: "object",
      properties: Object.fromEntries(t.params.map((p) => [p.name, { type: p.type, ...(p.description ? { description: p.description } : {}) }])),
      required: t.params.filter((p) => p.required).map((p) => p.name),
      additionalProperties: false,
    },
  };
}

/** What the agent actually gets for one turn: the tool list to hand the
 * model, plus system-prompt notes for any built-in tool that's switched off. */
export async function getActiveTools() {
  const config = await getToolConfig();
  const tools = [];
  const notes = [];
  for (const def of BUILTIN_TOOL_DEFS) {
    const c = config.builtin[def.name];
    if (!c.enabled) {
      notes.push(DISABLED_NOTES[def.name]);
      continue;
    }
    tools.push(applyOverrides(def, c));
  }
  for (const t of config.custom) if (t.enabled) tools.push(buildCustomSchema(t));
  return { tools, notes, config };
}

// ---------- execution ----------

function numberArg(value) {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : null;
}

async function executeBuiltin(name, args, config) {
  if (name === "get_property_info") {
    const { status, body } = await lookupPropertyInfo({
      search: args.search ? String(args.search).trim() : "",
      regionsRaw: args.regions ? String(args.regions).trim() : "",
      categoryRaw: args.category ?? null,
      minPrice: numberArg(args.minPrice),
      maxPrice: numberArg(args.maxPrice),
      minArea: numberArg(args.minArea),
      maxArea: numberArg(args.maxArea),
      limits: config.limits,
    });
    return { result: body, failed: status >= 500 };
  }
  if (name === "create_property_lead") {
    try {
      const lead = await createPropertyLead({
        propertyId: args.propertyId ? String(args.propertyId).trim() : "",
        name: args.name ? String(args.name).trim() : null,
        phone: args.phone ? String(args.phone).trim() : null,
        note: args.note ? String(args.note).trim() : null,
      });
      return { result: { ok: true, leadId: lead.id }, failed: false };
    } catch (err) {
      return { result: { error: err.message }, failed: true };
    }
  }
  return { result: { error: `Noma'lum funksiya: ${name}` }, failed: true };
}

function coerceArgs(tool, args) {
  const out = {};
  for (const p of tool.params) {
    const v = args?.[p.name];
    if (v === undefined || v === null || v === "") {
      if (p.required) throw new Error(`"${p.name}" parametri majburiy.`);
      continue;
    }
    if (p.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`"${p.name}" son bo'lishi kerak.`);
      out[p.name] = n;
    } else if (p.type === "boolean") {
      out[p.name] = v === true || v === "true";
    } else {
      out[p.name] = String(v).slice(0, 2000);
    }
  }
  return out;
}

function escapeJsonString(s) {
  return JSON.stringify(String(s)).slice(1, -1);
}

/** `"{{x}}"` (a placeholder that is the whole JSON value) keeps the
 * argument's real type; `{{x}}` inside a longer string is escaped in. */
function fillBody(template, args) {
  return template
    .replace(/"\{\{(\w+)\}\}"/g, (_m, n) => JSON.stringify(args[n] ?? null))
    .replace(/\{\{(\w+)\}\}/g, (_m, n) => escapeJsonString(args[n] ?? ""));
}

async function executeCustomTool(tool, args) {
  const a = coerceArgs(tool, args);
  const { method, headers: headerList, bodyTemplate } = tool.http;

  const usedInUrl = new Set();
  const urlString = tool.http.url.replace(/\{\{(\w+)\}\}/g, (_m, n) => {
    usedInUrl.add(n);
    return encodeURIComponent(String(a[n] ?? ""));
  });
  const url = assertSafeUrl(urlString);

  const noBody = method === "GET" || method === "DELETE";
  if (noBody) {
    for (const [k, v] of Object.entries(a)) if (!usedInUrl.has(k)) url.searchParams.set(k, String(v));
  }

  const headers = { Accept: "application/json" };
  for (const h of headerList) headers[h.key] = h.value;
  let body;
  if (!noBody) {
    body = bodyTemplate.trim() ? fillBody(bodyTemplate, a) : JSON.stringify(a);
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual", // a redirect could point somewhere assertSafeUrl never saw
    signal: AbortSignal.timeout(tool.timeoutMs),
  });
  const text = await res.text();
  const truncated = text.length > MAX_RESPONSE_CHARS;
  const clipped = truncated ? text.slice(0, MAX_RESPONSE_CHARS) : text;
  let data = clipped;
  if (!truncated) {
    try {
      data = JSON.parse(clipped);
    } catch {
      // Not JSON — hand the model the plain text.
    }
  }
  return {
    result: { status: res.status, ok: res.ok, data, ...(truncated ? { truncated: true } : {}) },
    failed: !res.ok,
    error: res.ok ? null : `HTTP ${res.status}`,
  };
}

function logToolCall(toolName, ok, durationMs, error) {
  const write = () => {
    prisma.toolCallLog
      .create({ data: { toolName, ok, durationMs, error: error ? String(error).slice(0, 300) : null } })
      .catch(() => {});
    // Keep the table small — the stats only look back a week anyway.
    if (Math.random() < 0.02) {
      prisma.toolCallLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } }).catch(() => {});
    }
  };
  try {
    after(write);
  } catch {
    write();
  }
}

/** The agent's single entry point for running a tool call — see
 * lib/aiCallAgent.js. Never throws: a failure becomes an {error} the model
 * can read and react to, and every call is logged for the stats view. */
export async function runTool(name, args, config) {
  const started = Date.now();
  try {
    let outcome;
    if (BUILTIN_NAMES.includes(name)) {
      if (!config.builtin[name].enabled) return { error: `${name} funksiyasi o'chirilgan.` };
      outcome = await executeBuiltin(name, args, config);
    } else {
      const tool = config.custom.find((t) => t.name === name && t.enabled);
      if (!tool) return { error: `Noma'lum yoki o'chirilgan funksiya: ${name}` };
      outcome = await executeCustomTool(tool, args);
    }
    logToolCall(name, !outcome.failed, Date.now() - started, outcome.error || (outcome.failed ? outcome.result?.error : null));
    return outcome.result;
  } catch (err) {
    const message = err.name === "TimeoutError" ? "So'rov vaqti tugadi (timeout)." : err.message;
    logToolCall(name, false, Date.now() - started, message);
    return { error: message };
  }
}

/** Admin "Sinab ko'rish" button — runs a tool right now with sample
 * arguments, even if it's switched off, and returns the raw outcome. Not
 * logged, so testing doesn't distort the stats. `draft` is an unsaved
 * custom tool exactly as it sits in the editor. */
export async function testTool({ name, draft, args }) {
  const config = await getToolConfig();
  const started = Date.now();
  try {
    let outcome;
    if (draft) {
      const tool = normalizeCustomTool(draft, config.custom, new Set());
      outcome = await executeCustomTool(tool, args || {});
    } else if (BUILTIN_NAMES.includes(name)) {
      outcome = await executeBuiltin(name, args || {}, config);
    } else {
      throw new Error("Noma'lum tool.");
    }
    return { ok: !outcome.failed, ms: Date.now() - started, result: outcome.result };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: err.name === "TimeoutError" ? "So'rov vaqti tugadi (timeout)." : err.message };
  }
}

/** Is uy-joy.uz's public catalog answering, and how fast? */
export async function checkPropertyApi() {
  const started = Date.now();
  try {
    const { items, total } = await searchCatalog({ search: "", regions: [19], category: 8 });
    return { ok: true, ms: Date.now() - started, total: total ?? items.length };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: err.name === "TimeoutError" ? "So'rov vaqti tugadi (timeout)." : err.message };
  }
}

/** One tiny real request with the DEPLOYED OpenAI key and call model — so
 * "the bot says an error happened" can be told apart into a bad/revoked key,
 * exhausted credit, or an unknown model, straight from the settings page. */
export async function checkOpenAi() {
  const started = Date.now();
  if (!appConfig.openai.apiKey) return { ok: false, ms: 0, error: "OPENAI_API_KEY o'rnatilmagan (Vercel'da yo'q yoki bo'sh)." };
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${appConfig.openai.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: appConfig.openai.callModel, input: "ping", max_output_tokens: 16, store: false }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - started;
    if (!res.ok) {
      const detail = data.error?.message || data.error?.code || "";
      return { ok: false, ms, error: `${res.status} ${detail}`.trim(), model: appConfig.openai.callModel };
    }
    return { ok: true, ms, model: appConfig.openai.callModel };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: err.name === "TimeoutError" ? "So'rov vaqti tugadi (timeout)." : err.message };
  }
}

/** ElevenLabs account status — mainly how much of the monthly character
 * quota is used, since running out is a common reason TTS suddenly fails. */
export async function checkElevenLabs() {
  const started = Date.now();
  if (!appConfig.elevenLabs.apiKey) return { ok: false, ms: 0, error: "ELEVENLABS_API_KEY o'rnatilmagan (Vercel'da yo'q yoki bo'sh)." };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": appConfig.elevenLabs.apiKey },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - started;
    if (!res.ok) {
      const detail = data.detail?.message || data.detail?.status || (typeof data.detail === "string" ? data.detail : "");
      return { ok: false, ms, error: `${res.status} ${detail}`.trim() };
    }
    return { ok: true, ms, used: data.character_count, limit: data.character_limit, status: data.status };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: err.name === "TimeoutError" ? "So'rov vaqti tugadi (timeout)." : err.message };
  }
}

/** Last 7 days per tool: calls, errors, average latency, latest failure.
 * Aggregated in JS from raw rows — Prisma's groupBy has misbehaved on this
 * project before (see lib/aiCallCapacity.js's listCallHistory). */
export async function getToolStats() {
  const rows = await prisma.toolCallLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { toolName: true, ok: true, durationMs: true, error: true, createdAt: true },
  });
  const stats = {};
  for (const r of rows) {
    const s = (stats[r.toolName] ||= { calls: 0, errors: 0, totalMs: 0, lastAt: r.createdAt, lastError: null });
    s.calls += 1;
    s.totalMs += r.durationMs;
    if (!r.ok) {
      s.errors += 1;
      if (!s.lastError) s.lastError = r.error || "Xato";
    }
  }
  for (const s of Object.values(stats)) {
    s.avgMs = Math.round(s.totalMs / s.calls);
    delete s.totalMs;
  }
  return stats;
}
