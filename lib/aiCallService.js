import crypto from "node:crypto";
import { config } from "./config.js";
import { getSetting, setSetting } from "./appSettings.js";
import { REGION_NAMES, correctPlaceNames } from "./huduDirectory.js";
import { uploadBuffer } from "./blobService.js";
import { numberToUzbekWords, toOrdinalUzbekWords } from "./uzbekNumberWords.js";
import { detectLanguage } from "./language.js";

// Spoken once, deterministically, at the very start of a call — fixed in
// code rather than left to the AI agent's own judgment, since "say this
// greeting only on the first turn" is exactly the kind of instruction an
// LLM can forget, repeat, or reword over a long session. The widget plays
// this (see app/api/ai-call/greeting/route.js) before the mic is ever
// armed, so it never goes through STT or the agent at all. Written with the
// correctly spelled brand name — toSpokenForm (below) rewrites it to the
// phonetic form ONLY for what's actually sent to TTS.
export const CALL_GREETING_TEXT =
  "Assalomu alaykum! Men E-rieltor.uz yordamchisiman. Qaysi mulk haqida ma'lumot olmoqchisiz? Mulk ID raqamini ayting.";

// 22.05kHz / 32kbps MP3 — plenty for a spoken voice call (it is played to a
// phone speaker or downsampled to 8kHz for SIP anyway), and ~4x smaller than
// the previous mp3_44100_128. A property announcement clip was ~465 kB
// (~29s), which a phone on a weak/tethered connection kept failing to
// download ("Failed to fetch") right after an ID was spoken. Part of the
// greeting's and per-property audio's cache hash (see getCachedGreetingAudio
// / lib/propertyAudioCache.js), so changing this regenerates them once.
export const TTS_OUTPUT_FORMAT = "mp3_22050_32";

const ONES_WORDS = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS_WORDS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];

/** Spells out one 3-digit group the way a person reads a property id aloud
 * — always "bir yuz uch" for 103, never the bare "yuz uch" — unlike
 * lib/uzbekNumberWords.js's numberToUzbekWords (used for prices/areas),
 * which deliberately drops the leading "bir" for exactly-N-hundred values.
 * Kept separate rather than reusing that function since the two contexts
 * want different conventions. */
function threeDigitGroupToWords(n) {
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const ones = remainder % 10;
  const words = [];
  if (hundreds > 0) words.push(ONES_WORDS[hundreds], "yuz");
  if (tens > 0) words.push(TENS_WORDS[tens]);
  if (ones > 0) words.push(ONES_WORDS[ones]);
  return words.join(" ") || "nol";
}

/** ElevenLabs reads "E-rieltor.uz" literally — as a hyphen and a URL's
 * ".uz" — instead of the brand name, so anything actually spoken needs the
 * phonetic spelling substituted first. Also spells out property ids (always
 * 6 digits, read by callers/agents as two 3-digit groups — e.g. "103109" as
 * "bir yuz uch bir yuz to'qqiz") instead of leaving raw digits for TTS to
 * guess how to pronounce. Applied ONLY to the copy handed to
 * streamElevenLabsSpeech; the caller/log/transcript always keeps the
 * correctly written form (see the greeting and turn routes, which pass the
 * unmodified text through the X-Reply-Text header). */
const UZ_MONTH_NAMES = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** Russian/English text: everything below is Uzbek-specific (Uzbek number
 * words, ordinals, phone grouping, ...) and would garble it — a Russian
 * sentence containing "120" must not get "bir yuz yigirma" spliced in. The TTS
 * model reads digits natively in these languages, so numbers stay as digits
 * (thousands grouping collapsed — "650 000 000" -> "650000000" — so it is
 * spoken as one number), and only units and the brand name are rewritten. */
function toSpokenFormForeign(text, language) {
  const ru = language === "ru";
  let result = text.replace(/\by?e[-\s]?rieltor\.?\s?uz\b/gi, "Ye riyeltr uz");
  result = result.replace(/\s*\bm(?:²|2\b)/gi, ru ? " квадратных метров" : " square meters");
  result = result.replace(/\s*%/g, ru ? " процентов" : " percent");
  result = result.replace(/\bMFY\b/gi, ru ? "махалля" : "mahalla");
  result = result.replace(/\b\d{1,3}(?:[\s\u00a0]\d{3})+\b/g, (m) => m.replace(/[\s\u00a0]/g, ""));
  return result;
}

export function toSpokenForm(text) {
  const language = detectLanguage(text);
  if (language !== "uz") return toSpokenFormForeign(text || "", language);
  let result = (text || "").replace(/\by?e[-\s]?rieltor\.?\s?uz\b/gi, "Ye riyeltr uz");
  // "95 m²" (an area figure) needs to come out as "to'qson besh metr
  // kvadrat", not with the "m²" glyph read literally — swapped for the
  // words BEFORE the digit-spelling rules below run, so the number in
  // front of it still gets converted normally by the generic catch-all.
  // (No trailing \b after "²" — it isn't a word character, so a boundary
  // almost never actually follows it; "2" already works fine with one.)
  result = result.replace(/\s*\bm(?:²|2\b)/gi, " metr kvadrat");
  // Same idea for "5%" (sale-terms percentages) -> "5 foiz", so the digit
  // in front still gets spelled out normally afterward ("besh foiz").
  result = result.replace(/\s*%/g, " foiz");
  // uy-joy.uz names a mahalla like "Elabod MFY" — read as "Elabod
  // mahallasi", not the abbreviation letter-by-letter. Chat display keeps
  // "MFY" as-is (see formatMahallaName in lib/uyJoyCatalogService.js).
  result = result.replace(/\bMFY\b/gi, "mahallasi");
  // "zakalat" (the auction pledge, see buildAuctionReplyTemplate) reads
  // more naturally to ElevenLabs as "zaqlat" — chat display keeps the
  // correctly spelled "zakalat".
  result = result.replace(/\bzakalat\b/gi, "zaqlat");
  // "kim oshdi savdo" (the auction TYPE — see buildAuctionReplyTemplate)
  // read as a quoted term, not a run-on phrase.
  result = result.replace(/\bsavdo kim oshdi savdo ko'rinishida\b/gi, `savdo "Kim oshdi savdo" ko'rinishida`);
  // An auction date ("23.09.2026") is read year-first, both numbers as
  // ORDINALS ("ikki ming yigirma oltinchi yil yigirma uchinchi sentabr") —
  // real Uzbek date order, and not a shape any of the cardinal-number
  // rules below could produce on their own, so this runs as its own rule
  // ahead of them. Dotted digit groups don't overlap with anything those
  // rules look for (they key off spaces or bare 3-digit runs), so this can
  // safely run first without fighting them for the same text.
  result = result.replace(
    /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g,
    (_match, day, month, year) => `${toOrdinalUzbekWords(Number(year))} yil ${toOrdinalUzbekWords(Number(day))} ${UZ_MONTH_NAMES[Number(month) - 1]}`
  );
  // A clock time ("10:00") reads as two plain numbers, not a single
  // combined one, with the conjunctive "-u" on the hour — "o'nu nol nol",
  // "to'qqizu o'ttiz" — with the minutes read digit-pair-by-digit when
  // they're "00" (a bare "nol" alone would lose the fact there are two zero
  // digits there). The hour takes "-yu" instead when its last word ends in
  // a vowel ("ikkiyu o'n besh", "oltiyu", "yigirmayu").
  result = result.replace(/\b(\d{1,2}):(\d{2})\b/g, (_match, hour, minute) => {
    const hourWords = numberToUzbekWords(Number(hour));
    const hourWithConjunction = /[aeiou]$/.test(hourWords) ? `${hourWords}yu` : `${hourWords}u`;
    // "00" -> "nol nol"; a leading zero ("05") keeps its own "nol" ("nol besh").
    const minuteWords = minute === "00" ? "nol nol" : minute[0] === "0" ? `nol ${numberToUzbekWords(Number(minute[1]))}` : numberToUzbekWords(Number(minute));
    return `${hourWithConjunction} ${minuteWords}`;
  });
  // A number + hyphen + word ("2-qavat", "9-sinf", "25-sentabr", "2026-yil")
  // is an ORDINAL in Uzbek: "ikkinchi qavat". Two exceptions where the number
  // stays a plain count: a following adjective ending in "-li" ("9-qavatli
  // uy" = "to'qqiz qavatli uy", "3-xonali" = "uch xonali") and "ta". The
  // ordinal ending written out itself ("2-chi", "2-inchi") is just the
  // ordinal, with no word after it to keep.
  result = result.replace(/\b(\d{1,4})-(?:inchi|nchi|chi)\b/gi, (_m, n) => toOrdinalUzbekWords(Number(n)));
  result = result.replace(/\b(\d{1,4})-([A-Za-z'‘’ʻʼ]+)/g, (_m, n, word) => {
    const attributive = /li$/i.test(word) || word.toLowerCase() === "ta";
    return `${attributive ? numberToUzbekWords(Number(n)) : toOrdinalUzbekWords(Number(n))} ${word}`;
  });
  // A phone number ("55 517 22 20", the ariza flow's confirmation format —
  // see the system prompt's section 8) reads as FOUR separate numbers, one
  // per group ("ellik besh besh yuz o'n yetti yigirma ikki yigirma"), not
  // one giant combined number — MUST run before the space-grouped-number
  // rule below, which would otherwise swallow the first two groups ("55
  // 517") into a single "ellik besh ming besh yuz o'n yetti" the same way
  // it correctly does for an actual price.
  result = result.replace(
    /\b(\d{2})[\s-](\d{3})[\s-](\d{2})[\s-](\d{2})\b/g,
    (_match, g1, g2, g3, g4) =>
      `${numberToUzbekWords(Number(g1))} ${numberToUzbekWords(Number(g2))} ${numberToUzbekWords(Number(g3))} ${numberToUzbekWords(Number(g4))}`
  );
  // Dot-grouped thousands ("1.305.926") are ONE number, not "bir.uch yuz
  // besh..." — runs before the decimal rule below (which only ever matches
  // 1-2 fractional digits, so the two can't overlap).
  result = result.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, (m) => numberToUzbekWords(Number(m.replace(/\./g, ""))));
  // A decimal is read the Uzbek way, the fraction with its denominator:
  // "5.5" -> "besh butun o'nda besh" (tenths), "5.05" / "5.25" -> "besh
  // butun yuzda besh" / "besh butun yuzda yigirma besh" (hundredths). Left
  // alone, the generic digit rule below would speak it as "besh.besh" with a
  // dropped-in pause. At most 2 fractional digits (and never followed by
  // another digit), so a thousands-dotted "1.305.926" is not mistaken for one.
  result = result.replace(/(\d+)[.,](\d{1,2})(?!\d)/g, (_match, whole, frac) => {
    const denominator = frac.length === 1 ? "o'nda" : "yuzda";
    return `${numberToUzbekWords(Number(whole))} butun ${denominator} ${numberToUzbekWords(Number(frac))}`;
  });
  // Space-grouped numbers (a price like "650 000 000") MUST be spelled out
  // as one whole number BEFORE the 6-digit-id-pair rule below gets a
  // chance at it — otherwise "650 000 000" parses as the id pair "650 000"
  // ("olti yuz ellik nol") plus a leftover "000" ("nol"), never as
  // "olti yuz ellik million". A plain 6-digit id has no spaces at all, so
  // it never matches this rule regardless of which one runs first. Also
  // covers any other number (sale-terms percentages, counts, years, ...)
  // ElevenLabs would otherwise misread, e.g. "2 300" as "2" then "300"
  // instead of "ikki ming uch yuz".
  result = result.replace(/\b\d{1,3}(?:[\s ]\d{3})+\b/g, (m) => numberToUzbekWords(Number(m.replace(/[\s ]/g, ""))));
  result = result.replace(
    /\b(\d{3})[\s-]?(\d{3})\b/g,
    (_match, g1, g2) => `${threeDigitGroupToWords(Number(g1))} ${threeDigitGroupToWords(Number(g2))}`
  );
  result = result.replace(/\d+/g, (m) => numberToUzbekWords(Number(m)));
  return result;
}

/** Transcribes one recorded utterance via OpenAI's speech-to-text, chosen
 * over ElevenLabs' own ASR specifically because it handles Uzbek far more
 * reliably (per live testing). `language: "uz"` is REJECTED by this
 * endpoint outright (400 invalid_value — Uzbek isn't in Whisper's
 * recognized ISO-639-1 list, confirmed live), whose own error message says
 * to hint the language via `prompt` instead. `prompt` isn't a validated
 * enum — it biases the model's vocabulary/orthography toward whatever
 * sample text it's given, so a real Uzbek sentence (with correct
 * apostrophes and real-estate-domain words, matching what callers actually
 * say) works far better here than a generic "this is Uzbek" description.
 * The 14 real region names (from the same Hudud.json used elsewhere) are
 * woven in dynamically — the ~209 districts can't fit in this short a
 * hint, which is what correctPlaceNames (below) is for instead. */
// A phrase that only ever appears in our OWN prompt hint below, never in
// genuine caller speech — used to detect Whisper's own "hallucination"
// failure mode: given a very short/quiet clip it has low confidence in, it
// sometimes doesn't transcribe silence or a guess, it literally echoes the
// prompt text back verbatim as if that were what it heard (confirmed live:
// a two-word utterance came back as the entire region-list prompt).
const STT_HALLUCINATION_MARKER = "kabi hududlaridagi, jumladan";

// The prompt hint's own worked example — "bir yuz o'ttiz bir uch yuz qirq
// uch" — is a second, more subtle hallucination target: given a short/quiet
// clip, Whisper has been observed returning this exact id (confirmed live,
// as the DIGITS "131343" rather than the spelled-out words) instead of
// admitting no confident transcription, on unrelated short utterances. Any
// fixed example risks becoming this kind of attractor — this treats an
// exact match to OUR OWN example, in either form, as no real speech.
const STT_EXAMPLE_ID_PHRASE = "bir yuz o'ttiz bir uch yuz qirq uch";
const STT_EXAMPLE_ID_DIGITS = "131343";

// Keyed WITHOUT apostrophes (see normalizeIdToken below) — Whisper doesn't
// consistently use the same apostrophe glyph for "to'rt"/"to'qqiz"/"o'n"/
// "o'ttiz" (straight ', curly '/', modifier-letter ʻ/ʼ, or none at all all
// show up across runs), so matching was silently failing on those 4 words
// whenever it picked a variant our old straight-or-curly-only normalizer
// didn't convert — which then made parseSpokenPropertyId bail out on the
// WHOLE id, not just that one digit, leaving the raw spoken words for the
// LLM to guess at (the exact failure mode this function exists to avoid).
const ID_ONES_WORDS = { bir: 1, ikki: 2, uch: 3, tort: 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, toqqiz: 9 };
const ID_TENS_WORDS = { on: 10, yigirma: 20, ottiz: 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, toqson: 90 };
const ID_NUMBER_WORD_SET = new Set([...Object.keys(ID_ONES_WORDS), ...Object.keys(ID_TENS_WORDS), "yuz", "nol"]);

function normalizeIdToken(raw) {
  return raw
    .toLowerCase()
    .replace(/['‘’ʻʼ`´]/g, "") // any apostrophe-like glyph — dropped, not converted
    .replace(/[^\p{L}]/gu, "");
}

/** Consumes one "hundred group" (e.g. "bir yuz o'n to'qqiz" -> 119, or
 * "nol to'qson sakkiz" -> 98) starting at tokens[start], returning both the
 * value and how many tokens it used. Mirrors how a person actually reads a
 * 3-digit chunk aloud: an optional hundreds marker ("<ones> yuz", bare
 * "yuz", or an explicit "nol" for a leading zero), then optional tens, then
 * optional ones. */
function consumeIdGroup(tokens, start) {
  let i = start;
  let hundreds = 0;
  if (tokens[i] === "nol") {
    hundreds = 0;
    i++;
  } else if (ID_ONES_WORDS[tokens[i]] !== undefined && tokens[i + 1] === "yuz") {
    hundreds = ID_ONES_WORDS[tokens[i]];
    i += 2;
  } else if (tokens[i] === "yuz") {
    hundreds = 1;
    i++;
  }
  let tens = 0;
  if (ID_TENS_WORDS[tokens[i]] !== undefined) {
    tens = ID_TENS_WORDS[tokens[i]];
    i++;
  }
  let ones = 0;
  if (ID_ONES_WORDS[tokens[i]] !== undefined) {
    ones = ID_ONES_WORDS[tokens[i]];
    i++;
  }
  return { value: hundreds * 100 + tens + ones, used: i - start };
}

/** Finds a spoken 6-digit property id — two 3-digit "yuz" groups, e.g. "bir
 * yuz o'n to'qqiz, nol to'qson sakkiz" -> "119098" — in a transcript and
 * replaces it with plain digits. Confirmed live (twice) that instructing
 * the n8n AI Agent to do this conversion itself just doesn't work reliably
 * — it either mis-parses a leading-zero group or doesn't recognize the
 * words as an id at all and never calls get_property_info. This is exactly
 * the kind of "must be reliable" task this project always ends up doing in
 * code instead of trusting a prompt to follow — see e.g. sanitizePropertyForAgent's
 * own reasoning in lib/uyJoyCatalogService.js. Only replaces a run that
 * cleanly segments into exactly two 3-digit groups; anything else (a
 * single group, 3+, a genuinely ambiguous reading) is left as-is. */
export function parseSpokenPropertyId(text) {
  if (!text) return text;
  const tokens = text.split(/(\s+)/);
  const wordIndices = [];
  tokens.forEach((t, i) => {
    if (t.trim()) wordIndices.push(i);
  });
  const normalized = wordIndices.map((idx) => normalizeIdToken(tokens[idx]));

  let bestRun = null;
  let i = 0;
  while (i < normalized.length) {
    if (!ID_NUMBER_WORD_SET.has(normalized[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < normalized.length && ID_NUMBER_WORD_SET.has(normalized[j])) j++;
    if (!bestRun || j - i > bestRun.end - bestRun.start) bestRun = { start: i, end: j };
    i = j;
  }
  if (!bestRun) return text;

  const runTokens = normalized.slice(bestRun.start, bestRun.end);
  const groups = [];
  let pos = 0;
  while (pos < runTokens.length) {
    const { value, used } = consumeIdGroup(runTokens, pos);
    if (used === 0) return text; // shouldn't happen, but never loop forever
    groups.push(value);
    pos += used;
  }
  if (groups.length !== 2) return text;

  const digits = groups.map((g) => String(g).padStart(3, "0")).join("");
  const runIdxs = wordIndices.slice(bestRun.start, bestRun.end);
  const newTokens = [...tokens];
  newTokens[runIdxs[0]] = digits;
  for (let k = 1; k < runIdxs.length; k++) newTokens[runIdxs[k]] = "";
  return newTokens.join("").replace(/\s+/g, " ").trim();
}

// Which speech-to-text provider actually runs — switchable live from
// /ai-qongiroq-sozlamalar (see app/api/ai-call/stt-provider/route.js)
// without a redeploy, since which one transcribes Uzbek better in practice
// is exactly the kind of thing that needs live A/B testing to answer, not a
// one-time code decision.
const STT_PROVIDER_SETTING_KEY = "aiCallSttProvider";
export const STT_PROVIDERS = ["openai", "elevenlabs", "muxlisa"];

export async function getSttProvider() {
  return getSetting(STT_PROVIDER_SETTING_KEY, "openai");
}

export async function setSttProvider(provider) {
  if (!STT_PROVIDERS.includes(provider)) throw new Error(`Noma'lum STT provayder: ${provider}`);
  await setSetting(STT_PROVIDER_SETTING_KEY, provider);
  return provider;
}

/** OpenAI's Whisper-family endpoint (gpt-4o-transcribe) — has no official
 * Uzbek support (a `language: "uz"` param is REJECTED outright, 400
 * invalid_value), so it's biased toward Uzbek purely via the `prompt` hint
 * below instead. Returns "" on a detected hallucination (see the markers
 * above this function) rather than throwing — the caller treats that the
 * same as silence. */
async function transcribeWithOpenAI(buffer, filename, mimeType, language = "uz") {
  if (!config.openai.apiKey) throw new Error("OPENAI_API_KEY o'rnatilmagan.");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType || "audio/wav" }), filename || "turn.wav");
  form.append("model", config.openai.transcribeModel);
  // Russian/English turn: no language forced (the caller may still switch
  // back to Uzbek, which a forced "ru" would ruin) and no Uzbek-flavoured
  // prompt — plain auto-detection returns the digits/words as spoken.
  if (language === "uz") form.append(
    "prompt",
    `Salom! Men O'zbekistonning ${REGION_NAMES.join(", ")} ${STT_HALLUCINATION_MARKER} Urganch, Xonqa, Shovot, ` +
      "Qo'qon, Marg'ilon tumanlaridagi kvartira, xususiy uy yoki noturar bino (tijorat bino) narxi va hududi " +
      "haqida so'rayapman. Mulk ID raqamini bir yuz o'ttiz bir uch yuz qirq uch deb, ya'ni uch xonadan guruhlab " +
      "aytaman."
  );

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openai.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI STT xatosi: ${res.status} ${body}`);
  }
  const data = await res.json();
  const rawText = (data.text || "").trim();
  const rawWordsOnly = rawText
    .toLowerCase()
    .replace(/[^\p{L}' ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  // Only flags a BARE "131343" (the whole utterance, once punctuation is
  // stripped, is nothing but that digit run) as the hallucinated example —
  // a longer sentence that happens to mention that id among real words is
  // left alone, since that's plausibly a genuine (if coincidental) request.
  const isBareExampleDigits = rawText.replace(/[\d.,!?\s]/g, "").length === 0 && rawText.replace(/\D/g, "") === STT_EXAMPLE_ID_DIGITS;
  if (rawText.includes(STT_HALLUCINATION_MARKER) || rawWordsOnly === STT_EXAMPLE_ID_PHRASE || isBareExampleDigits) {
    return "";
  }
  return rawText;
}

/** ElevenLabs' Scribe endpoint — unlike OpenAI's, its `language_code`
 * param officially accepts "uz" (ISO-639-1), so no prompt-hint trickery is
 * needed to bias it toward Uzbek at all. `keyterms` is Scribe's own
 * structured equivalent of that hint (a plain word list, not a sentence a
 * low-confidence clip could echo back), used here for the same region
 * names OpenAI's prompt hint carries. Same account/API key already used
 * for TTS — no separate provider to sign up for. */
async function transcribeWithElevenLabs(buffer, filename, mimeType) {
  if (!config.elevenLabs.apiKey) throw new Error("ELEVENLABS_API_KEY o'rnatilmagan.");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType || "audio/wav" }), filename || "turn.wav");
  form.append("model_id", "scribe_v2");
  form.append("language_code", "uz");
  for (const name of REGION_NAMES) form.append("keyterms", name);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabs.apiKey },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs STT xatosi: ${res.status} ${body}`);
  }
  const data = await res.json();
  return (data.text || "").trim();
}

/** Muxlisa AI — an Uzbekistan-built STT/TTS service specialized for Uzbek
 * (and its regional dialects), unlike the two general multilingual models
 * above. Its sync endpoint takes the audio under an "audio" form field (no
 * language param — the service is Uzbek-only, nothing to select) and
 * replies with `{ text }` on success, or `{ detail }` on a 4xx error. */
async function transcribeWithMuxlisa(buffer, filename, mimeType) {
  if (!config.muxlisa.apiKey) throw new Error("MUXLISA_API_KEY o'rnatilmagan.");

  const form = new FormData();
  form.append("audio", new Blob([buffer], { type: mimeType || "audio/wav" }), filename || "turn.wav");

  const res = await fetch("https://service.muxlisa.uz/api/v2/stt", {
    method: "POST",
    headers: { "x-api-key": config.muxlisa.apiKey },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Muxlisa STT xatosi: ${res.status} ${body.detail || ""}`);
  }
  const data = await res.json();
  return (data.text || "").trim();
}

const STT_TRANSCRIBERS = {
  openai: transcribeWithOpenAI,
  elevenlabs: transcribeWithElevenLabs,
  muxlisa: transcribeWithMuxlisa,
};

/** `language` is the language the AI last replied in (see AiCallSession.language)
 * — i.e. the language the caller is most likely speaking now. For Russian/
 * English the selected provider is bypassed in favour of OpenAI: Muxlisa is
 * Uzbek-only and would return garbage. */
export async function transcribeAudio(buffer, filename, mimeType, { language = "uz" } = {}) {
  if (language !== "uz") {
    return (await transcribeWithOpenAI(buffer, filename, mimeType, language)) || "";
  }
  const provider = await getSttProvider();
  const rawText = await (STT_TRANSCRIBERS[provider] || transcribeWithOpenAI)(buffer, filename, mimeType);
  if (!rawText) return "";
  return parseSpokenPropertyId(correctPlaceNames(rawText));
}

/** Calls ElevenLabs' streaming speech endpoint and returns the raw fetch
 * Response so the caller can pipe `res.body` straight through to the
 * browser instead of buffering the whole clip in the serverless function
 * first. Uses callModelId ("v3 Conversational"), not the plain "v3" the
 * rest of the app's TTS (lib/ttsService.js) uses — this is the one path
 * where generation latency directly delays the caller hearing anything.
 *
 * RULE: text handed to TTS never contains digits — every number is spelled
 * out in Uzbek words ("120 oy" -> "bir yuz yigirma oy"). toSpokenForm does
 * that, and it's applied HERE, at the single point every ElevenLabs request
 * goes through, so a caller (existing or future) can't forget it. Callers
 * that already ran it are unaffected — it is idempotent (already-spelled
 * text has no digits left to convert). */
export async function streamElevenLabsSpeech(text) {
  if (!config.elevenLabs.apiKey) throw new Error("ELEVENLABS_API_KEY o'rnatilmagan.");
  const spokenText = toSpokenForm(text);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabs.voiceId}/stream?output_format=${TTS_OUTPUT_FORMAT}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabs.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: spokenText,
      model_id: config.elevenLabs.callModelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs xatosi: ${res.status} ${body}`);
  }
  return res;
}

const GREETING_BLOB_PATH = "ai-call/greeting.mp3";
const GREETING_HASH_SETTING_KEY = "aiCallGreetingTextHash";
const GREETING_URL_SETTING_KEY = "aiCallGreetingAudioUrl";

function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

/** CALL_GREETING_TEXT never changes between calls, so its audio doesn't
 * either — hitting ElevenLabs fresh on every single call start was pure
 * waste (API cost + latency) for a clip that's always identical. This
 * synthesizes it once and caches the result in Vercel Blob, keyed by a hash
 * of the text itself so editing CALL_GREETING_TEXT in code automatically
 * invalidates the old cached audio instead of needing a manual reset. */
export async function getCachedGreetingAudio() {
  const currentHash = hashText(`${TTS_OUTPUT_FORMAT}|${CALL_GREETING_TEXT}`);
  const [storedHash, storedUrl] = await Promise.all([
    getSetting(GREETING_HASH_SETTING_KEY, ""),
    getSetting(GREETING_URL_SETTING_KEY, ""),
  ]);

  if (storedHash === currentHash && storedUrl) {
    const cached = await fetch(storedUrl, { cache: "no-store" }).catch(() => null);
    if (cached?.ok) return Buffer.from(await cached.arrayBuffer());
    // Cached blob is missing/unreachable — fall through and regenerate.
  }

  const speechRes = await streamElevenLabsSpeech(toSpokenForm(CALL_GREETING_TEXT));
  const buffer = Buffer.from(await speechRes.arrayBuffer());
  const url = await uploadBuffer(GREETING_BLOB_PATH, buffer, "audio/mpeg");
  await Promise.all([setSetting(GREETING_HASH_SETTING_KEY, currentHash), setSetting(GREETING_URL_SETTING_KEY, url)]);
  return buffer;
}
