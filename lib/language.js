// Language handling for the three languages the agent serves: Uzbek (the
// default — every call opens in it), Russian and English. See
// LANGUAGE_POLICY below (given to the model on every turn), the STT switch in
// lib/aiCallService.js's transcribeAudio, and toSpokenForm's per-language
// number handling.

export const SUPPORTED_LANGUAGES = ["uz", "ru", "en"];

/** Appended to the system prompt on every turn (see lib/aiCallAgent.js) — in
 * code rather than only in the editable System Message so it always applies,
 * even when the stored prompt was customized. Written in Uzbek like the rest
 * of the prompt. */
export const LANGUAGE_POLICY = `TIL SIYOSATI (MAJBURIY):
Siz FAQAT uch tilda xizmat ko'rsatasiz: o'zbek (asosiy), rus va ingliz. Har qanday suhbat o'zbek tilida boshlanadi.
- Mijoz rus yoki ingliz tilida gapirsa yoki shu tilga o'tishni so'rasa, o'sha tilda javob bering va mijoz tilni o'zgartirmaguncha shu tilda davom eting. Mijoz o'zbekchaga qaytsa, siz ham qayting.
- Bu uch tildan boshqa tilni so'rasa (masalan nemis, arab, fransuz), o'sha tilda EMAS, muloyimlik bilan mijozning oxirgi tilida (yoki o'zbekcha) faqat o'zbek, rus va ingliz tillarida xizmat ko'rsata olishingizni ayting va qaysi biri qulay ekanini so'rang.
- Rus yoki ingliz tilida gaplashganda: mulk ma'lumotini (spokenReply, description, auctionInfo, listings, message) mazmunini o'zgartirmasdan, aniq va to'liq shu tilga tarjima qiling — hech narsani tashlab ketmang va to'qib chiqarmang. Raqam, narx, ID, hudud va mahalla nomlarini o'zgartirmang, raqamlarni RAQAM bilan yozing (so'z bilan emas). "So'zma-so'z ayting" qoidalari faqat o'zbek tili uchun; rus/ingliz tilida asosiy talab — mazmunning aniqligi.
- Tasdiqlash savollarini ham mijoz tilida bering ("Правильно?" / "Is that correct?"). Ariza uchun telefon raqamini har doim "XX XXX XX XX" shaklida yozing.
- Funksiyalarni (tool) chaqirganda parametrlarga (regions, category) HAR DOIM o'zbekcha nomlarni yuboring — masalan "Xorazm viloyati", "kvartira" — mijoz qaysi tilda gapirmasin.`;

// Words used to tell English from Uzbek in Latin-script text. Deliberately
// small: replies are short, so a handful of very common function words plus
// Uzbek-only markers separates them reliably in practice.
const EN_WORDS = new Set(
  "the and you your is are was to of for in on with please can could would will i we this that these those have has do does not yes no okay ok hello hi thank thanks sorry sure how what which where when property apartment house price help name phone number more question questions anything else continue speak language english".split(
    " "
  )
);
const UZ_WORDS = new Set(
  "va bilan uchun men siz sizga sizni mulk narx kerak qanday yordam ha yoq bu da ga dan ni bormi mi ham ariza telefon ism mahalla viloyat tuman shahar kvartira xususiy uy tijorat bino somi million raqam raqamini ayting tushundim albatta xop yana savolingiz qaysi hudud tur toqrimi kechirasiz salom assalomu alaykum".split(
    " "
  )
);

/** "uz" | "ru" | "en" for a piece of text (the AI's own reply, in practice).
 * Cyrillic-heavy text is Russian unless it uses Uzbek-Cyrillic letters;
 * Latin text is English only when it reads clearly English (English function
 * words, no Uzbek ones) — anything ambiguous stays "uz", the default.
 *
 * With { orNull: true } it returns null instead of guessing when the text
 * carries no language signal at all ("142130", "ID 142130.", "OK") — used to
 * decide whether to CHANGE a session's remembered language: a short,
 * signal-free reply must not flip an ongoing Russian conversation back to
 * Uzbek. */
export function detectLanguage(text, { orNull = false } = {}) {
  const fallback = orNull ? null : "uz";
  const s = String(text || "");
  const letters = s.match(/\p{L}/gu) || [];
  if (letters.length === 0) return fallback;

  const cyrillic = s.match(/[Ѐ-ӿ]/g) || [];
  if (cyrillic.length / letters.length > 0.5) {
    if (orNull && letters.length < 4) return null;
    return /[ЎўҚқҒғҲҳ]/.test(s) ? "uz" : "ru";
  }

  const tokens = s
    .toLowerCase()
    .replace(/['‘’ʻʼ`´]/g, "")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  let en = 0;
  let uz = 0;
  for (const t of tokens) {
    if (EN_WORDS.has(t)) en++;
    if (UZ_WORDS.has(t)) uz++;
  }
  // Uzbek-only orthography (o', g' as digraphs) is a strong Uzbek signal on its own.
  if (/\b\w*[og]['‘’ʻʼ]\w*/i.test(s)) uz += 2;
  if (orNull && en === 0 && uz === 0) return fallback;
  return en >= 1 && en > uz ? "en" : "uz";
}
