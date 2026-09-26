// Lets the caller end the call by voice ("telefonni o'chir", "boshqa savolim
// yo'q, rahmat", "goodbye"): the model adds END_CALL_MARKER at the very end
// of its farewell, runAgentTurn strips it, and the /turn route tells the
// widget / sip-bridge (X-End-Call header) to hang up once the farewell has
// finished playing. Kept in code, like LANGUAGE_POLICY, so it applies even
// to a customized stored System Message.

export const END_CALL_MARKER = "[[END_CALL]]";

export const END_CALL_POLICY = `SUHBATNI YAKUNLASH (MAJBURIY, boshqa qoidalardan USTUN):
Mijoz suhbatni tugatmoqchi ekanini bildirsa — masalan "telefonni o'chir", "boshqa savolim yo'q, rahmat", "bo'ldi, rahmat", "gaplashib bo'ldik", "xayr", "yo'q, rahmat" (siz "Yana savolingiz bormi?" deb so'raganingizdan keyin), ruscha "у меня больше нет вопросов, спасибо", "до свидания", inglizcha "no more questions, thanks", "goodbye" — quyidagicha qiling: mijoz tilida BIR QISQA xayrlashuv gapi ayting (masalan "Rahmat, sog' bo'ling!") va javobning ENG OXIRIGA aynan ${END_CALL_MARKER} belgisini qo'shing. Bunday javobda YANGI SAVOL BERMANG ("Yana savolingiz bormi?" DEMANG). Tizim shundan keyin qo'ng'iroqni o'zi yakunlaydi.
Faqat aniq yakunlash niyati bo'lsagina belgini qo'shing. Ma'lumot olgach oddiy "rahmat" deyish (yoki "rahmat, yana bir savol...") yakunlash EMAS — bunda suhbat davom etadi. Belgini boshqa hech qachon ishlatmang.`;

const FAREWELL = {
  uz: "Rahmat, sog' bo'ling!",
  ru: "Спасибо, до свидания!",
  en: "Thank you, goodbye!",
};

// Backstop for when the model says goodbye but forgets the marker: a short
// reply that is a farewell and asks nothing back also ends the call.
const FAREWELL_RE =
  /(xayr|sog['‘’ʻ]?\s?bo['‘’ʻ]?ling|omad\s+tilayman|до свидания|всего доброго|всего хорошего|прощайте|good\s?bye|\bbye\b|have a (nice|good|great) day|take care)/i;

function isFarewell(text) {
  const t = String(text || "").trim();
  return t.length > 0 && t.length <= 120 && !t.includes("?") && FAREWELL_RE.test(t);
}

/** { text, endCall } — the reply without the marker. A reply that was only
 * the marker still gets a spoken farewell in the call's language. */
export function stripEndCallMarker(text, language = "uz") {
  const raw = String(text || "");
  if (!raw.includes(END_CALL_MARKER)) return { text: raw, endCall: isFarewell(raw) };
  const cleaned = raw.split(END_CALL_MARKER).join("").trim();
  return { text: cleaned || FAREWELL[language] || FAREWELL.uz, endCall: true };
}
