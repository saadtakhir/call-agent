import { config } from "./config.js";
import { numberToUzbekWords } from "./uzbekNumberWords.js";
import { resolveRegionIds } from "./huduDirectory.js";
import { cyrillicToLatinUz } from "./translit.js";
import { prisma } from "./prisma.js";

// uy-joy.uz's own real-estate company ids — the same set the public catalog
// search box itself filters to, copied from a captured browser request
// rather than documented anywhere.
const COMPANY_PARENT_IDS = [182, 191, 173, 153, 6, 299, 521, 620, 314, 793, 794, 846];

// The only 3 categories currently on sale (per the user, land plots aren't
// sold right now despite existing as a category on the site itself) — kept
// as a fixed allowlist rather than a lookup file like Hudud.json since
// there are only three of them, small enough to just put in the agent's own
// system prompt directly.
export const CATEGORY_IDS = {
  kvartira: 8, // Ko'p qavatli uylardagi xonadonlar
  xususiyUy: 12, // Uchastkalar, yakka tartibdagi uy-joylar, dachalar, xovli joylar
  tijoratBino: 19, // Do'kon, kafe, ishlab chiqarish, omborxona va boshqa noturar binolar
};

// A raw catalog item's own `category.name` is uy-joy.uz's internal
// transaction-type label (observed: "Сотиш" / "Sale", regardless of
// whether the listing is actually a kvartira, xususiy uy, or tijorat bino)
// — not a usable category name at all. This is our own clean label instead,
// keyed by the same ids as CATEGORY_IDS.
const CATEGORY_LABELS = {
  [CATEGORY_IDS.kvartira]: "Kvartira",
  [CATEGORY_IDS.xususiyUy]: "Xususiy uy",
  [CATEGORY_IDS.tijoratBino]: "Tijorat bino",
};

/** Runs uy-joy.uz's catalog search — `search` a listing id or free text
 * (same as typing into the site's own search box), `regions` a list of
 * uy-joy.uz's own region/district ids (same numbering the site's own filter
 * UI uses), `category` one of CATEGORY_IDS' values — and returns the
 * matching page's items plus the real total count (uy-joy.uz's own
 * `total` field, not just this page's item count). Any param can be omitted
 * (empty search + regions/category alone is a plain "browse this filter"
 * search, matching what the site's own filters do with no search text).
 * Used by the ElevenLabs voice agent's property-lookup tool (see
 * app/api/elevenlabs/property-info/route.js) — a different, looser lookup
 * than propertyService.js's fetchProperty (exact id-only GET), since the
 * agent's tool is meant to mirror what a human using the site would find.
 *
 * `productProcessType` defaults to null, which uy-joy.uz's own search
 * treats as "active listings only" — confirmed live: a known-sold id
 * (103974) returns zero results under null but one under the explicit
 * "SOLD" value, so already-sold properties never surface through the
 * agent's normal search by default. Callers pass "SOLD" explicitly only to
 * check whether a specific id that came back empty is empty because it's
 * sold (see lookupPropertyInfo) rather than because it never existed. */
export async function searchCatalog({ search = "", regions = [], category = null, productProcessType = null } = {}) {
  const res = await fetch(config.uyJoyCatalogUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      search: String(search || ""),
      category,
      regions,
      priceUnit: "UZS",
      pageFilter: { page: 1, size: 24 },
      variations: {},
      sort: "NEWEST",
      companyParentIds: COMPANY_PARENT_IDS,
      categoryCode: null,
      min: null,
      max: null,
      productProcessType,
      realtorRecommended: false,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Qidiruv xatosi: ${res.status}`);
  const body = await res.json();
  const items = body?.data || [];
  return { items, total: body?.total ?? items.length };
}

/** Runs one searchCatalog per known category (in parallel) to get an exact
 * per-category count for whatever search/regions filter is already
 * narrowed down — used when a browse-style query (no specific listing id)
 * matches more than one property and no category was given yet, so the
 * agent can ask "which type?" instead of just handing back an arbitrary
 * one of several very different listings. Real per-category counts (via
 * each call's own `total`) rather than tallying the current page's items,
 * since a large result could have more matches than fit on one page. */
export async function countByCategory({ search = "", regions = [] } = {}) {
  const counts = await Promise.all(
    Object.values(CATEGORY_IDS).map(async (categoryId) => {
      const { total } = await searchCatalog({ search, regions, category: categoryId });
      return { category: CATEGORY_LABELS[categoryId], count: total };
    })
  );
  return counts.filter((c) => c.count > 0);
}

// Plain-name aliases for callers with no equivalent to ElevenLabs' own
// numeric-id system prompt (e.g. an n8n workflow's AI Agent, which would
// otherwise need to memorize 8/12/19 itself) — lets `category` be sent as
// a name instead, resolved server-side same as the numeric id path.
const CATEGORY_NAME_ALIASES = {
  kvartira: CATEGORY_IDS.kvartira,
  "xususiy uy": CATEGORY_IDS.xususiyUy,
  "xususiy uylar": CATEGORY_IDS.xususiyUy,
  "tijorat bino": CATEGORY_IDS.tijoratBino,
  "noturar bino": CATEGORY_IDS.tijoratBino,
};

/** Validates a category reference from the agent against CATEGORY_IDS —
 * anything else (including a category the site has but isn't for sale,
 * e.g. land plots) is dropped rather than passed through, since an
 * unrecognized or currently-unsellable category would just make
 * uy-joy.uz's own search return nothing. Accepts either the numeric id
 * (8/12/19) or one of CATEGORY_NAME_ALIASES' plain names, case-insensitive. */
export function parseCategoryId(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (Object.values(CATEGORY_IDS).includes(n)) return n;
  return CATEGORY_NAME_ALIASES[String(raw).trim().toLowerCase()] ?? null;
}

// uy-joy.uz's raw catalog item mixes ordinary listing attributes (repair
// status, area, floor count, ...) into the SAME `variations` array as real
// PII and internal-only fields — owner_phone, owner_fullname, user_phone,
// bank_staff_phone (a real phone number was observed in a live response),
// commission, sell_process/purchase_type/find_buyer/agreement (internal
// sales-process notes never meant for a caller). Several of the sensitive
// ones even share the same "PRODUCT"/"SALE" menu tags as the safe ones, so
// filtering by menu alone isn't enough. This is deliberately an ALLOWLIST
// (only these codes ever reach the agent) rather than a blocklist — a new
// field uy-joy.uz adds later defaults to hidden instead of defaulting to
// leaked.
const SAFE_VARIATION_CODES = new Set([
  "repair",
  "repair_status",
  "type_of_building",
  "housing_type",
  "architectural_style",
  "special_comfort",
  "more_premises",
  "area_all",
  "area_effective",
  "building_width_area",
  "floors_building",
  "floors",
  "basement_building_type",
  "land_ownership",
  "engineer_communications",
  "construction_completion",
  "year_construction_delivery",
  "auto_transport_place_state",
  "ceiling_height",
  "property_type",
  "site",
  "railway",
  "house_cover",
  "parking_available",
  "room_count",
  "rooms",
]);

// Which SAFE_VARIATION_CODES entries are an area in square meters — these
// get the same "words (number m2)" speech formatting as price, but rounded
// the other direction (see formatAreaForSpeech below). Everything else in
// SAFE_VARIATION_CODES (floor counts, percentages, a plain list/text value,
// ...) is read out as whatever uy-joy.uz already labeled it.
const AREA_VARIATION_CODES = new Set(["area_all", "area_effective", "building_width_area", "site"]);

/** Prices always round UP to the nearest whole so'm before being spelled
 * out — per the user: even a 0.01 so'm remainder should round to +1, never
 * down — then formatted as plain "<so'zlar> so'm", with no parenthesized
 * digit form — a voice agent only ever needs to speak the words, and the
 * digits invited it to read those out instead in practice. Returns null for
 * a missing/non-numeric price rather than "nol so'm", so
 * sanitizePropertyForAgent can omit the field entirely. */
function formatPriceForSpeech(rawPrice) {
  const n = Number(rawPrice);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.ceil(n);
  return `${numberToUzbekWords(rounded)} so'm`;
}

/** Areas always round DOWN (the fractional part is simply dropped, however
 * large — 433.8 -> 433, not 434) before being spelled out, the opposite
 * direction from price — per the user's own example. Same
 * "<so'zlar> metr kvadrat (<raqam> m2)" shape as price. */
function formatAreaForSpeech(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.floor(n);
  return `${numberToUzbekWords(rounded)} metr kvadrat (${rounded} m2)`;
}

/** A compact, safe-to-speak list (id/price/region only, no PII-adjacent
 * variations) for when a category was already given but still matches
 * several listings — there's nothing left to narrow by, so the agent reads
 * out a short list of candidates instead of an arbitrary single one, and
 * the caller can ask for a specific id from there. Capped at 8 — a voice
 * conversation can't usefully read out more than that anyway. */
export function summarizeListings(items) {
  return items.slice(0, 8).map((item) => ({
    id: item.id,
    price: formatPriceForSpeech(item.price),
    region: toLatin(item.region?.name) || null,
  }));
}

/** Strips a raw uy-joy.uz catalog item down to what's safe to hand to the
 * ElevenLabs agent (and, from there, speak to whoever is calling) — see
 * SAFE_VARIATION_CODES above for why this can't just be "everything except
 * a few fields". Exact GPS coordinates and internal viewer-count/offer
 * analytics are dropped too, alongside the whole PII-adjacent chunk of
 * variations. This is enforced here in code rather than left to the
 * agent's system prompt, since a prompt instruction ("don't mention X") is
 * only ever a suggestion the model can still get wrong — the data
 * shouldn't reach it in the first place.
 *
 * `price` and every area-in-m² attribute are spelled out in Uzbek words
 * (see formatPriceForSpeech/formatAreaForSpeech) rather than left as bare
 * numbers — a voice model reading "1580611384.8" digit-by-digit or
 * mis-rounding it is far less natural than it reading a pre-written
 * "bir milliard ... so'm". */
/** uy-joy.uz's own text fields (name, region names, variation labels/
 * values, the sale-terms description) come through as whatever script the
 * listing agent typed in — often still Cyrillic Uzbek, never normalized
 * site-side. Left as-is, this reaches the LLM's reply and then ElevenLabs
 * TTS untouched, which mispronounces it (Cyrillic Uzbek shares glyphs with
 * Russian Cyrillic but maps to different sounds — a voice model tuned for
 * Latin-script Uzbek reads it wrong). Transliterated once here, at the
 * source, rather than trusting every downstream consumer to remember to. */
function toLatin(text) {
  return text ? cyrillicToLatinUz(text) : text;
}

export function sanitizePropertyForAgent(raw) {
  if (!raw) return null;

  const attributes = (raw.variations || [])
    .filter((v) => SAFE_VARIATION_CODES.has(v.code))
    .map((v) => {
      const rawValue = v.valueLabel || v.value || null;
      const value = rawValue && AREA_VARIATION_CODES.has(v.code) ? formatAreaForSpeech(rawValue) || toLatin(rawValue) : toLatin(rawValue);
      // `code` is kept alongside label/value (not just for the agent's own
      // reference) so buildPropertyReplyTemplate below can deterministically
      // pick "the 2-3 that matter for THIS category" instead of guessing
      // from label text, which varies by listing.
      return { code: v.code, label: toLatin(v.label), value };
    })
    .filter((v) => v.value);

  return {
    id: raw.id,
    name: toLatin(raw.name) || null,
    price: formatPriceForSpeech(raw.price),
    category: CATEGORY_LABELS[raw.category?.id] || toLatin(raw.category?.name) || null,
    region: toLatin(raw.region?.name) || null,
    province: toLatin(raw.region?.parent?.name) || null,
    attributes,
  };
}

// Which 2-3 attribute codes matter most per category, in priority order —
// the first ones found (a listing rarely has every code) are used. Fixed
// per category rather than left to the agent's own judgment for two
// reasons: consistency (a caller asking about the same listing twice should
// hear the same summary) and — the actual point of this whole template —
// so the exact wording is stable enough to cache its synthesized audio (see
// lib/propertyAudioCache.js). Only codes SAFE_VARIATION_CODES already
// allows through are usable here.
const CATEGORY_REPLY_ATTRIBUTE_CODES = {
  [CATEGORY_IDS.kvartira]: ["room_count", "rooms", "area_all", "area_effective", "floors_building", "floors"],
  [CATEGORY_IDS.xususiyUy]: ["area_all", "site", "room_count", "rooms", "floors_building"],
  [CATEGORY_IDS.tijoratBino]: ["area_all", "floors_building", "engineer_communications", "type_of_building"],
};

const PROPERTY_REPLY_CLOSING_QUESTION = "Batafsil ma'lumot (sotuv shartlari) kerakmi, yoki sotib olishga qiziqasizmi?";

/** Builds the deterministic "found this listing" spoken reply — one
 * fixed-shape template per category (see CATEGORY_REPLY_ATTRIBUTE_CODES),
 * filled in with this specific property's own values. Previously this
 * paragraph was left to the LLM to compose freely each time (system prompt
 * section 6's "TARTIB shunday bo'lsin" instruction) — reworded slightly
 * differently turn to turn even for the identical listing, which made
 * per-property audio caching pointless (a cache keyed on exact text almost
 * never hits). The system prompt now tells the agent to repeat this
 * `spokenReply` verbatim instead of rephrasing it. Called with the ALREADY
 * sanitized property (so it reuses the same price/area wording the agent
 * itself sees) plus the raw category id (sanitizePropertyForAgent's own
 * `category` field is a display label, not the id CATEGORY_REPLY_ATTRIBUTE_CODES
 * is keyed by).
 *
 * `isSpecificLookup` leads the reply with the requested id itself (plain
 * digits here — toSpokenForm's own 6-digit-id regex spells it out the same
 * way it does everywhere else, e.g. "bir yuz uch bir yuz to'qqiz") when the
 * caller searched by id, since confirming which listing was found is worth
 * more than it costs there. Skipped for a browse-style query (region/
 * category only, no id given) — nothing to confirm back in that case, the
 * caller never said an id to begin with. Not a confidentiality issue like
 * region/category ids (see the system prompt's section 7) — this is the
 * SAME id the caller already gave, not an internal one. */
export function buildPropertyReplyTemplate(sanitized, categoryId, isSpecificLookup) {
  const priorityCodes = CATEGORY_REPLY_ATTRIBUTE_CODES[categoryId] || [];
  const picked = [];
  for (const code of priorityCodes) {
    if (picked.length >= 3) break;
    const attr = sanitized.attributes.find((a) => a.code === code);
    if (attr && !picked.includes(attr)) picked.push(attr);
  }
  const attrSentence = picked.length ? `${picked.map((a) => `${a.label} — ${a.value}`).join(", ")}.` : "";

  const locationPhrase = sanitized.province ? `${sanitized.province}, ${sanitized.region}` : sanitized.region;
  const typeLabel = sanitized.category || "mulk";
  const introSentence = isSpecificLookup
    ? `${sanitized.id} ID bo'yicha obyekt topildi, ${locationPhrase ? `${locationPhrase}da joylashgan ` : ""}${typeLabel}.`
    : `${locationPhrase ? `${locationPhrase}da ` : ""}${typeLabel} topildi.`;

  return [introSentence, `Narxi — ${sanitized.price}.`, attrSentence, PROPERTY_REPLY_CLOSING_QUESTION].filter(Boolean).join(" ");
}

function findVariationRaw(raw, code) {
  const v = (raw.variations || []).find((item) => item.code === code);
  return v?.value ?? null;
}

function findVariationValues(raw, code) {
  const v = (raw.variations || []).find((item) => item.code === code);
  return v?.values || [];
}

// Fixed order/wording matching how a person actually lists these out loud
// — "kanalizatsiya" gets no "ta'minoti" suffix, the other three do. Only
// the ones this SPECIFIC listing's engineer_communications actually lists
// are included, never all four unconditionally — a listing genuinely
// missing gas, say, shouldn't be told it has it.
const UTILITY_PHRASES = [
  ["water_supply", "Suv ta'minoti"],
  ["gas_supply", "gaz ta'minoti"],
  ["electric_lighting", "elektr energiya ta'minoti"],
  ["sewage", "kanalizatsiya"],
];

function buildUtilitiesSentence(values) {
  const present = UTILITY_PHRASES.filter(([code]) => values.includes(code)).map(([, label]) => label);
  return present.length ? `${present.join(", ")} mavjud.` : "";
}

/** Chat-display price grouping ("650 000 000") rather than a bare digit
 * run — both for on-screen readability and because toSpokenForm's
 * space-grouped-number rule is what turns this into "olti yuz ellik
 * million" for speech; a bare "650000000" would instead fall through to
 * its generic digit-by-digit rule and come out wrong. Rounds up, same
 * direction as formatPriceForSpeech above and for the same reason (never
 * quote a caller less than the real minimum). */
function formatPriceGrouped(rawPrice) {
  const n = Number(rawPrice);
  if (!Number.isFinite(n)) return null;
  return Math.ceil(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** uy-joy.uz's mahalla field is typically named like "Elabod MFY" (MFY =
 * mahalla fuqarolar yig'ini) — the abbreviation is dropped since the
 * template already supplies its own "mahallasida" suffix. */
function formatMahallaName(mfyName) {
  if (!mfyName) return null;
  const cleaned = toLatin(mfyName).replace(/\s*mfy$/i, "").trim();
  return cleaned || null;
}

const KVARTIRA_CLOSING_QUESTION = "Sotuv shartlari kerakmi yoki sotib olishga qiziqasizmi?";

/** Kvartira-specific reply template — a separate, more detailed shape than
 * buildPropertyReplyTemplate's generic one above (still used for xususiy
 * uy / tijorat bino, at least until they get their own dedicated templates
 * too). Works from the RAW catalog item directly rather than the
 * already-sanitized one, since it needs exact untouched numbers (room
 * count, both floor figures, area) that sanitizePropertyForAgent either
 * leaves as opaque uy-joy.uz label/value pairs or pre-formats into words
 * (area) for a different purpose.
 *
 * Deliberately built with plain DIGITS, not spelled-out words — this
 * becomes `spokenReply`, which the agent repeats verbatim as its own
 * reply text (so it's also what's shown as the on-screen transcript and
 * what property audio caching keys on, see lib/propertyAudioCache.js).
 * toSpokenForm (lib/aiCallService.js) converts the digits to words at the
 * point audio actually gets synthesized — this only has to get the digit
 * form right. */
export function buildKvartiraReplyTemplate(raw, mahallaName, isSpecificLookup) {
  const region = toLatin(raw.region?.name) || null;
  const province = toLatin(raw.region?.parent?.name) || null;
  const locationBase = [province, region].filter(Boolean).join(" ");

  const roomCount = findVariationRaw(raw, "room_count") ?? findVariationRaw(raw, "rooms");
  const floorsBuilding = findVariationRaw(raw, "floors_building");
  const floors = findVariationRaw(raw, "floors");
  const areaRaw = findVariationRaw(raw, "area_all") ?? findVariationRaw(raw, "area_effective");
  const area = areaRaw != null && Number.isFinite(Number(areaRaw)) ? Math.floor(Number(areaRaw)) : null;
  const price = formatPriceGrouped(raw.price);

  const placePhrase = mahallaName
    ? `${locationBase ? `${locationBase} ` : ""}${mahallaName} mahallasida`
    : locationBase
      ? `${locationBase}da`
      : "";
  const roomPhrase = roomCount ? `${roomCount} xonali ` : "";

  const sentences = [
    isSpecificLookup ? `ID ${raw.id} bo'yicha obyekt topildi.` : null,
    `Bu ${placePhrase ? `${placePhrase} joylashgan ` : ""}${roomPhrase}kvartira.`,
  ];

  if (floorsBuilding != null || floors != null) {
    const floorParts = [];
    if (floorsBuilding != null) floorParts.push(`Uy qavatliligi ${floorsBuilding}`);
    if (floors != null) floorParts.push(`joylashgan qavati ${floors}`);
    sentences.push(`${floorParts.join(", ")}.`);
  }
  if (area != null) sentences.push(`Foydali maydoni ${area} m².`);
  sentences.push(buildUtilitiesSentence(findVariationValues(raw, "engineer_communications")));
  if (price) sentences.push(`Boshlang'ich ${price} so'm.`);
  sentences.push(KVARTIRA_CLOSING_QUESTION);

  return sentences.filter(Boolean).join(" ");
}

// A fallback line for when no description exists at all — so the agent
// always gets a plain string in "description" and never needs its own
// conditional logic (see also lib/config.js for uyJoyApiBase).
const NO_DESCRIPTION_TEXT = "Sotuv shartlari aniq belgilanmagan.";

/** Fetches the per-id product detail endpoint (a completely different,
 * MUCH heavier response than the catalog search — confirmed live: it
 * includes the seller/agent/bank staff's real phone numbers, PINFL
 * (national id), bank account numbers, and legal documents) for the two
 * fields actually needed from it — a sale-terms description and the
 * mahalla (mfy) name, which the catalog search item doesn't carry at all —
 * everything else in that response is discarded immediately and never
 * returned, logged, or passed anywhere.
 *
 * The description lives in TWO different places depending on the listing,
 * confirmed live against real data: `productOrder.description` carries the
 * substantive sale conditions when present (e.g. "5% boshlang'ich badal,
 * 15% yillik ustama, 120 oy muddatga bo'lib to'lash" — installment/auction
 * terms), while the top-level `description` tends to hold something less
 * useful (a source reference like an OLX link, or just "Lot №: ...").
 * productOrder's is checked first for exactly that reason — it's the one
 * actually worth reading out to a caller — falling back to the top-level
 * field, and finally to NO_DESCRIPTION_TEXT if neither exists. Always
 * resolves to both fields, never throws — a failed lookup here shouldn't
 * break the whole property-info response. */
export async function fetchPropertyDetail(id) {
  try {
    const res = await fetch(`${config.uyJoyApiBase}/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { description: NO_DESCRIPTION_TEXT, mahallaName: null };
    const raw = await res.json();
    const orderDescription = typeof raw?.productOrder?.description === "string" ? raw.productOrder.description.trim() : "";
    const topLevelDescription = typeof raw?.description === "string" ? raw.description.trim() : "";
    const description = orderDescription ? toLatin(orderDescription) : toLatin(topLevelDescription) || NO_DESCRIPTION_TEXT;
    return { description, mahallaName: formatMahallaName(raw?.mfy?.name) };
  } catch {
    return { description: NO_DESCRIPTION_TEXT, mahallaName: null };
  }
}

/** ElevenLabs' tool config can't transform what the LLM sends before it
 * reaches us — so instead of trusting the agent to always pass a clean id
 * (it doesn't: observed real calls include "113, 444" and full free-text
 * descriptions instead of a number), this pulls the longest run of digits
 * out of whatever string arrives. A real listing id is always the longest
 * number in the text — short ones like room counts ("3 xonali") or areas
 * ("90 kv.m") lose out to it — and digits separated only by spaces/commas
 * ("113, 444") collapse into one run. Returns null if nothing digit-like is
 * found at all (a genuinely free-text query), letting the caller fall back
 * to searching the raw text as-is. */
export function extractListingId(raw) {
  const collapsedWhole = raw.replace(/[\s,]+/g, "");
  if (/^\d{3,}$/.test(collapsedWhole)) return collapsedWhole;

  const groups = raw.match(/\d(?:[\d\s,]{0,4}\d)*/g) || [];
  const candidates = groups.map((g) => g.replace(/[\s,]+/g, "")).filter((g) => g.length >= 3);
  if (!candidates.length) return null;
  return candidates.reduce((longest, g) => (g.length > longest.length ? g : longest));
}

/** The full get_property_info orchestration — resolves regions/category/
 * search, branches on ambiguity (categories breakdown / candidate listings
 * / single sanitized result), and logs to PropertyLookupLog. Shared by the
 * ElevenLabs webhook (app/api/elevenlabs/property-info/route.js, which just
 * wraps this in a NextResponse) and lib/aiCallAgent.js's own tool-calling
 * loop, which calls it directly as a function — no HTTP hop needed since
 * both run in the same process, unlike the earlier n8n-based setup this
 * replaces for the e-content-native call agent. `regionsRaw`/`categoryRaw`
 * are the still-unresolved values (numeric id, plain name, or comma-
 * separated list) — see resolveRegionIds/parseCategoryId. Returns
 * `{status, body}` instead of throwing/a NextResponse so either caller
 * shape can use it identically. */
export async function lookupPropertyInfo({ search = "", regionsRaw = "", categoryRaw = null } = {}) {
  const regions = resolveRegionIds(regionsRaw);
  const category = parseCategoryId(categoryRaw);

  if (!search && !regions.length && !category) {
    return { status: 400, body: { error: "\"search\", \"regions\" yoki \"category\" maydonlaridan kamida bittasi kerak." } };
  }

  const listingId = search ? extractListingId(search) : null;
  const resolvedSearch = listingId && listingId !== search ? listingId : null;
  const logExtra = { regions: regionsRaw || null, category: categoryRaw != null ? String(categoryRaw) : null };

  try {
    let items = [];
    let total = 0;
    if (listingId) {
      ({ items, total } = await searchCatalog({ search: listingId, regions, category }));
    }
    if (!items.length && (!listingId || listingId !== search)) {
      ({ items, total } = await searchCatalog({ search, regions, category }));
    }

    if (!items.length) {
      // A specific id that came back empty might exist but already be
      // sold — worth telling the caller precisely rather than the generic
      // "not found" (see searchCatalog's own note on productProcessType),
      // since "wrong id" and "right id, already sold" call for different
      // follow-up questions from whoever's asking.
      if (listingId) {
        const sold = await searchCatalog({ search: listingId, regions, category, productProcessType: "SOLD" });
        if (sold.items.length) {
          await prisma.propertyLookupLog.create({ data: { search, resolvedSearch, ...logExtra, found: false, title: "Sotilgan" } });
          return { status: 404, body: { error: "Bu mulk allaqachon sotilgan." } };
        }
      }
      await prisma.propertyLookupLog.create({ data: { search, resolvedSearch, ...logExtra, found: false, title: null } });
      return { status: 404, body: { error: "Bunday e'lon topilmadi." } };
    }

    // A true listing-id lookup always targets that one property — the
    // ambiguity-narrowing branches below only make sense for a browse-style
    // query with no specific id.
    const isSpecificLookup = !!listingId;

    if (!isSpecificLookup && total > 1) {
      if (category === null) {
        const categories = await countByCategory({ search, regions });
        await prisma.propertyLookupLog.create({
          data: { search, resolvedSearch, ...logExtra, found: true, title: `Taqsimot: ${total} ta (kategoriya so'ralmagan)` },
        });
        return {
          status: 200,
          body: {
            total,
            categories,
            message: `Jami ${total} ta mulk topildi: ${categories.map((c) => `${c.category} — ${c.count} ta`).join(", ")}. Qaysi turi qiziqtiradi?`,
          },
        };
      }

      const listings = summarizeListings(items);
      await prisma.propertyLookupLog.create({
        data: { search, resolvedSearch, ...logExtra, found: true, title: `Ro'yxat: ${total} ta (kategoriya berilgan)` },
      });
      return {
        status: 200,
        body: {
          total,
          listings,
          message: `Jami ${total} ta mos mulk topildi. Har birining narxini o'qib bering, mijoz tanlagandan keyin o'sha ID bilan qayta so'rang.`,
        },
      };
    }

    const first = items[0];
    await prisma.propertyLookupLog.create({ data: { search, resolvedSearch, ...logExtra, found: true, title: first.name || null } });

    const sanitized = sanitizePropertyForAgent(first);
    const detail = await fetchPropertyDetail(first.id);
    sanitized.description = detail.description;
    sanitized.spokenReply =
      first.category?.id === CATEGORY_IDS.kvartira
        ? buildKvartiraReplyTemplate(first, detail.mahallaName, isSpecificLookup)
        : buildPropertyReplyTemplate(sanitized, first.category?.id, isSpecificLookup);
    return { status: 200, body: sanitized };
  } catch (err) {
    await prisma.propertyLookupLog.create({ data: { search, resolvedSearch, ...logExtra, found: false, title: null } }).catch(() => {});
    return { status: 400, body: { error: err.message } };
  }
}
