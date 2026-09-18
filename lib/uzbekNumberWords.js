// Uzbek number-to-words — built specifically so the AI voice agent reads
// prices/areas naturally instead of a voice model reading raw digits one at
// a time or mangling large numbers. Handles 0 up to the trillions, which
// comfortably covers real-estate prices (observed up to ~1.5 milliard so'm).

const ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];
const SCALES = ["", "ming", "million", "milliard", "trillion"];

/** 0-999 -> words. "yuz" alone for exactly a bare hundred with nothing
 * after it (matches common Uzbek usage — "yuz so'm", not "bir yuz so'm")
 * — but "bir yuz yigirma", not just "yuz yigirma", once tens/ones follow,
 * the same way a full number in the hundreds is actually read aloud.
 * Scale words above this (ming/million/...) get an explicit "bir" prefix
 * unconditionally instead, in numberToUzbekWords, since dropping it there
 * reads as more ambiguous regardless of what follows. */
function threeDigitsToWords(n) {
  const words = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const ones = remainder % 10;
  if (hundreds > 0) {
    if (hundreds > 1 || remainder > 0) words.push(ONES[hundreds]);
    words.push("yuz");
  }
  if (tens > 0) words.push(TENS[tens]);
  if (ones > 0) words.push(ONES[ones]);
  return words.join(" ");
}

/** Spells out a non-negative integer in Uzbek (e.g. 40939 ->
 * "qirq ming to'qqiz yuz o'ttiz to'qqiz"). Callers needing a specific
 * rounding direction (price rounds up, area rounds down — see
 * lib/uyJoyCatalogService.js) round before calling this; it only ever
 * spells out whatever integer it's given. */
export function numberToUzbekWords(n) {
  const value = Math.trunc(Math.abs(n));
  if (value === 0) return "nol";

  const groups = [];
  let rest = value;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (group === 0) continue;
    if (i === 0) {
      parts.push(threeDigitsToWords(group));
    } else {
      const groupWords = group === 1 ? "bir" : threeDigitsToWords(group);
      parts.push(`${groupWords} ${SCALES[i]}`);
    }
  }
  return (n < 0 ? "minus " : "") + parts.join(" ");
}

const ORDINAL_VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Turns a cardinal number's spelled-out form into its ordinal — e.g. 23
 * -> "yigirma uchinchi", 2026 -> "ikki ming yigirma oltinchi" — by
 * suffixing only the LAST word, the same way Uzbek actually forms a
 * compound ordinal (never "yigirma uchinchi uch" or similar on every
 * word). -nchi after a vowel ending, -inchi otherwise, so "olti" becomes
 * "oltinchi" rather than the double-i "oltiinchi". Used for spoken dates
 * (see toSpokenForm's date rule in lib/aiCallService.js) — Uzbek reads a
 * day-of-month and year as ordinals ("yigirma uchinchi sentabr", "ikki
 * ming yigirma oltinchi yil"), not as plain cardinal counts. */
export function toOrdinalUzbekWords(n) {
  const words = numberToUzbekWords(n).split(" ");
  const last = words.pop();
  const suffix = ORDINAL_VOWELS.has(last[last.length - 1]) ? "nchi" : "inchi";
  return [...words, `${last}${suffix}`].join(" ");
}
