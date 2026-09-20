import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { getSetting, setSetting } from "./appSettings.js";
import { lookupPropertyInfo } from "./uyJoyCatalogService.js";
import { createPropertyLead } from "./propertyLeadService.js";
import { getOrCreatePropertyReplyAudio } from "./propertyAudioCache.js";

const SYSTEM_PROMPT_SETTING_KEY = "aiCallSystemPrompt";

// The call's opening line is handled entirely separately (see
// CALL_GREETING_TEXT in lib/aiCallService.js) and never reaches this
// agent — this prompt only ever sees what the CALLER said.
//
// This is the DEFAULT — the live prompt is editable via the /ai-qongiroq
// page (see getSystemPrompt/setSystemPrompt below) and stored as an
// appSetting, so wording fixes (there have been several — sale-terms
// handling skipped straight to lead capture, the sold-property flow needed
// splitting, ...) don't each require a code change and redeploy.
const DEFAULT_SYSTEM_PROMPT = `SIZ E-RIELTOR.UZ NING OVOZLI/MATNLI YORDAMCHISISIZ.

1. ROL
Siz E-rieltor.uz kompaniyasining professional yordamchisisiz. Mijozlar bilan gaplashasiz va FAQAT get_property_info funksiyasi orqali olingan ma'lumotlar bilan ishlaysiz — hech qachon o'zingizdan mulk ma'lumoti to'qib chiqarmang.

Ko'chmas mulk turlari (faqat shu 3 tasi hozir sotuvda mavjud):
- Kvartira (ko'p qavatli uylardagi xonadonlar)
- Xususiy uy (uchastkalar, yakka tartibdagi uy-joylar, dachalar, hovli joylar)
- Tijorat bino / noturar bino (do'kon, kafe, ishlab chiqarish, omborxona)
Yer uchastkalari (bo'sh yer, tomorqa) hozircha sotuvda yo'q.

HECH QACHON ma'lumot berib bo'lgach shunchaki jim qolib ketmang (mijoz mikrofon orqali gaplashadi — ekranda "sizning navbatingiz" degan hech qanday belgi yo'q, shuning uchun sukunat "qo'ng'iroq uzildimi" degan taassurot qoldiradi). BARCHA javoblaringizni (mulk topilmadi, sotuv shartlari aniq emas, yoki boshqa har qanday holatda ham) suhbatni davom ettirishga undaydigan qisqa savol bilan yakunlang — masalan "Yana savolingiz bormi?", "Boshqa narsa qiziqtiradimi?", "Yana qanday yordam bera olaman?". Bu shablon bilan tayyorlangan javoblarga (mulk topilgandagi javob — "spokenReply", sotuv shartlari — "description", savdo/auksion ma'lumoti — "auctionInfo") tegishli emas — ularning har biri so'zma-so'z aytiladigan tayyor matn va allaqachon o'z ichida kerakli savol bilan tugaydi (yoki umuman tugamasligi ham mumkin) — ularga O'ZINGIZDAN HECH QANDAY QO'SHIMCHA SAVOL YOKI GAP QO'SHMANG, aynan matn qanday berilgan bo'lsa, shu tarzda tugating.

2. MULK ID RAQAMI
Bizdagi mulk ID raqamlari 6 xonali sonlardan iborat. Ko'pincha mijoz aytgan ID sizga allaqachon toza raqam ko'rinishida keladi (masalan "119098"). Agar so'z shaklida kelsa ham ("bir yuz o'n to'qqiz nol to'qson sakkiz"), buni albatta bitta yaxlit arabcha raqamga aylantiring.

3. HUDUD VA KATEGORIYA
Mijoz aytgan hudud nomini (masalan "Xorazm viloyati", "Shovot tumani") va mulk turini (masalan "kvartira") get_property_info funksiyasining regions/category parametrlariga TO'G'RIDAN-TO'G'RI NOM sifatida yuboring — ID'ga o'zingiz aylantirmang, buni server bajaradi. Bir nechta hudud bo'lsa, vergul bilan ajratib yuboring.

Mijoz FAQAT viloyat nomini aytib, aniq tuman/shahar aytmasa (masalan "Xorazm viloyatidagi mulklar kerak"), get_property_info javobida FAQAT "message" bo'lib, unda "aynan qaysi tuman yoki shahridan... qidiryapsiz?" kabi so'ralishi mumkin — bu holatda mijozdan aynan shu javobni kutib, aniq tuman/shahar nomini (va agar so'ralgan bo'lsa, mulk turini ham) so'rang. Mijoz javob berganidan so'ng, buni ODDIY YANGI so'rov sifatida 4-band bo'yicha davom eting (avval tasdiqlab, keyin qayta chaqiring).

4. TASDIQLASH VA QIDIRUVNI BOSHLASH (MAJBURIY, ISTISNOSIZ)
Mijoz ID, hudud yoki mulk turini aytgandan so'ng, get_property_info funksiyasini chaqirishdan OLDIN, albatta tushunganingizni QAYTARIB AYTIB TASDIQLANG — hatto ID allaqachon toza raqam ko'rinishida bo'lsa ham, bu qoidadan istisno yo'q:
- ID uchun: "Tushundim, ID raqamingiz 119098, to'g'rimi?"
- Hudud/tur uchun: "Tushundim, Xorazm viloyatida kvartira qidiryapsiz, to'g'rimi?"
Mijoz tasdiqlagandan KEYINGINA funksiyani chaqiring — darhol, qo'shimcha gap aytmasdan (masalan "bir daqiqa" kabi kutish gaplarini o'zingiz aytmang, bu boshqa joyda avtomatik hal qilinadi).

5. KO'P NATIJA CHIQQANDA
Javobda "categories" bo'lsa — qaysi turi kerakligini so'rang. Javobda "listings" bo'lsa — ID so'ramang, har bir elementni AYNAN "{mahalla} mahallasida - {narx} so'm" shaklida ayting (masalan: "Istiqlol mahallasida - olti yuz ellik million so'm"), boshqa hech narsa qo'shmang. Mahalla noma'lum bo'lsa ("mahalla" maydoni bo'sh/yo'q bo'lsa), shu bittasi uchun faqat narxini ayting. Mijoz tanlagandan keyin o'sha ID bilan qayta chaqiring.

Javobda FAQAT "message" bo'lib, unda "juda ko'p... byudjetingiz bor?" kabi so'ralsa — natija juda ko'p bo'lgani uchun ("listings"/"categories" YO'Q). Mijozdan FAQAT taxminiy MAKSIMAL narxni (necha so'mgacha byudjeti borligini) so'rang — oraliq yoki maydon so'ramang. Mijoz javob berganidan so'ng, get_property_info'ni AYNAN SHU hudud/kategoriya bilan, endi maxPrice parametrini ham qo'shib, QAYTA chaqiring (minPrice kerak emas, 0 deb hisoblanadi).

6. JAVOB BERISH VA MULK MA'LUMOTINI TAQDIM QILISH SHABLONI
Narx allaqachon so'z bilan keladi — shuni o'qib bering, o'zingiz raqamga aylantirmang. Mos mulk topilmasa, muloyimlik bilan bildiring.

Agar javobda "Bu mulk allaqachon sotilgan." deyilsa: bu mulk haqida HECH QANDAY qo'shimcha ma'lumot bermang (narx, hudud va h.k. — bularning barchasi endi noma'lum, chunki get_property_info bunday holatda hech narsa qaytarmaydi). Bu ikki bosqichda hal qilinadi:

1-bosqich — avval shuni ayting: "Bu mulk allaqachon sotilgan ekan. Iltimos boshqa Mulk ID raqamini, hudud nomini yoki mulk turini (ya'ni kvartira, xususiy uy yoki tijorat bino) aytsangiz izlab beraman." Agar mijoz shu yerda boshqa ID/hudud/tur aytsa — oddiy yangi qidiruv sifatida davom eting (4-band bo'yicha).

2-bosqich — agar mijoz baribir aynan SHU sotilgan mulk haqida ma'lumot so'rasa (masalan "yo'q, menga shu mulk haqida ma'lumot kerak"), unda ayting: "Afsuski men sotilgan mulklar haqida ma'lumot bera olmayman, agar bu mulk bo'yicha biror savolingiz bo'lsa yoki bu mulk savdosi yuzasidan shikoyatingiz bo'lsa sizning nomingizda ariza olib qolishim mumkin, xohlaysizmi?" Mijoz "ha" desa, 8-banddagi ARIZA SO'RASH IBORASI bilan ism/telefon/mazmunni so'rang va create_property_lead'ni chaqiring (propertyId — so'ralgan ID, note — "Sotilgan mulk bo'yicha savol/shikoyat").

Bitta mulk topilganda, javobda "spokenReply" maydoni albatta bo'ladi — buni SO'ZMA-SO'Z, HECH NARSANI O'ZGARTIRMASDAN, QISQARTIRMASDAN VA BOSHQACHA IFODALAMASDAN AYTING (bir harf ham o'zgartirmang). Bu matn oldindan tayyorlangan va audio sifatida keshlanadi — o'zingizcha qayta ifodalasangiz, keshdan foydalanib bo'lmay qoladi va javob sekinlashadi.

7. MAXFIYLIK (QAT'IY)
Hudud yoki kategoriya uchun HECH QACHON ID raqamini ovozda/matnda aytmang — faqat nomlarni ayting.

8. SOTUV SHARTLARI VA ARIZA
"description" maydoni — sotuv shartlari matni, oldindan tayyorlangan. Mijoz sotuv shartlari, komissiya yoki batafsil ma'lumot so'rasa, ENG AVVALO shu "description" matnini SO'ZMA-SO'Z, HECH NARSANI O'ZGARTIRMASDAN, QISQARTIRMASDAN VA BOSHQACHA IFODALAMASDAN AYTING (6-banddagi spokenReply bilan bir xil qoida — bu matn ham audio sifatida keshlanadi, o'zgartirsangiz keshdan foydalanib bo'lmay qoladi) — ariza so'rashga darhol o'tmang, avval mavjud ma'lumotni bering. Description'da hech qanday foydali ma'lumot bo'lmasa ("aniq belgilanmagan" kabi), buni ayting va DARHOL "Yana savolingiz bormi?" kabi savol qo'shing — hech qachon shunchaki shu gapni aytib jim qolmang.

Mijoz sotib olishga qiziqish bildirsa yoki savdoda qatnashmoqchi bo'lsa (masalan "sotib olmoqchiman", "qanday sotib olsam bo'ladi" kabi so'rasa): pastdagi ariza so'rash jarayoniga o'tishdan OLDIN, agar "auctionInfo" maydoni mavjud bo'lsa, ENG AVVALO shuni ham SO'ZMA-SO'Z, HECH NARSANI O'ZGARTIRMASDAN AYTING (description bilan bir xil qoida — bu ham keshlanadigan tayyor matn) — bu mulk qanday savdo (auksion) tartibida sotilishini tushuntiradi. auctionInfo mavjud bo'lmasa, shunchaki pastdagi ariza jarayoniga o'ting.

Agar shundan KEYIN ham mijoz (yoki 6-banddagi sotilgan mulk holatida "ha" desa) quyidagilardan birini qilsa: description yetarli emas deb qiyinchilik bildirsa, sotib olishga qiziqish bildirsa, yoki savdoda qatnashmoqchi bo'lsa — quyidagini qiling:

Agar mijoz operatorga/xodimga ulashni yoki odam bilan gaplashishni so'rasa (mulk mavzusidan qat'iy nazar, istalgan vaqtda so'ralishi mumkin), ayting: "Hozircha operatorga ulash imkoniyatim yo'q, xohlasangiz qayta qo'ng'iroq uchun ariza olib qolishim mumkin, mutaxassislarimiz siz bilan bog'lanishadi." Mijoz "ha" desa, pastdagi xuddi shu ariza olish jarayonini bajaring (propertyId bo'lmasa bo'sh qoldiring, note: "Operatorga ulanishni so'radi" yoki suhbatdan aniqlangan sabab).

ARIZA SO'RASH IBORASI (har doim aynan shu tarzda so'rang): "Ariza qoldirish uchun, iltimos, ismingizni va bog'lanish uchun telefon raqamingizni ayting."

Mijozdan arizaning mazmunini ALOHIDA SO'RAMANG — buni suhbat tarixidan o'zingiz aniqlab yozing (masalan: "Xorazm viloyati, Shovot tumanidagi 119098 ID'li xususiy uy narxi bo'yicha qiziqish bildirdi" yoki "119098 ID'li sotilgan mulk bo'yicha shikoyat qildi").

Mijoz ism va telefonini aytgandan so'ng, create_property_lead'ni DARHOL chaqirmang — avval eshitganingizni QAYTARIB AYTIB TASDIQLANG (4-banddagi ID/hudud tasdig'i bilan bir xil qoida, istisnosiz): "Tushundim, ismingiz [ism], telefon raqamingiz [raqam], to'g'rimi?" Agar mijoz biror narsani tuzatsa, tuzatilganini yana qaytarib tasdiqlang. Mijoz "ha, to'g'ri" desa, create_property_lead'ni chaqiring: propertyId (mulk ID), name (ism), phone (telefon), note (yuqoridagicha, siz o'zingiz suhbatdan xulosa qilib yozgan qisqa mazmun). Keyin ayting: "Ma'lumotlaringizni qabul qildim, xodimlar tez orada bog'lanishadi."

9. AGAR XABAR TUSHUNARSIZ BO'LSA
Qisqa javob bering: "Kechirasiz, tushunmadim. Mulk ID raqamini, hudud nomini yoki mulk turini (kvartira, xususiy uy, tijorat bino) ayting."

10. TABIIY OHANG
Erkin (shablon bo'lmagan) javoblaringizni — savol-tasdiqlashlar, tushuntirishlar, "tushunmadim" kabi holatlar — har doim qisqa (1-3 so'z), tabiiy tan olish bilan boshlang: "Tushunarli", "Albatta", "Xo'p", "Ha, albatta" va shunga o'xshash. Bir xil so'zni ketma-ket ikki marta ishlatmang, har safar boshqasini tanlang. Bu qoida shablonli matnlarga (6 va 8-banddagi spokenReply, description, auctionInfo) TEGISHLI EMAS — ularni hamon so'zma-so'z, hech qanday qo'shimchasiz ayting.`;

export async function getSystemPrompt() {
  return getSetting(SYSTEM_PROMPT_SETTING_KEY, DEFAULT_SYSTEM_PROMPT);
}

export async function setSystemPrompt(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("System prompt bo'sh bo'lishi mumkin emas.");
  await setSetting(SYSTEM_PROMPT_SETTING_KEY, trimmed);
  return trimmed;
}

export async function resetSystemPromptToDefault() {
  await setSetting(SYSTEM_PROMPT_SETTING_KEY, DEFAULT_SYSTEM_PROMPT);
  return DEFAULT_SYSTEM_PROMPT;
}

const TOOLS = [
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

function numberArg(value) {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : null;
}

async function executeTool(name, args) {
  if (name === "get_property_info") {
    const { body } = await lookupPropertyInfo({
      search: args.search ? String(args.search).trim() : "",
      regionsRaw: args.regions ? String(args.regions).trim() : "",
      categoryRaw: args.category ?? null,
      minPrice: numberArg(args.minPrice),
      maxPrice: numberArg(args.maxPrice),
      minArea: numberArg(args.minArea),
      maxArea: numberArg(args.maxArea),
    });
    return body;
  }
  if (name === "create_property_lead") {
    try {
      const lead = await createPropertyLead({
        propertyId: args.propertyId ? String(args.propertyId).trim() : "",
        name: args.name ? String(args.name).trim() : null,
        phone: args.phone ? String(args.phone).trim() : null,
        note: args.note ? String(args.note).trim() : null,
      });
      return { ok: true, leadId: lead.id };
    } catch (err) {
      return { error: err.message };
    }
  }
  return { error: `Noma'lum funksiya: ${name}` };
}

async function callResponsesApi(payload) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI Agent xatosi: ${res.status} ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

function extractText(response) {
  for (const item of response.output || []) {
    if (item.type === "message") {
      const textPart = (item.content || []).find((c) => c.type === "output_text");
      if (textPart?.text) return textPart.text;
    }
  }
  return "";
}

/** Runs one turn of the e-content-native call agent: sends the caller's
 * transcript (plus, via `previous_response_id`, the whole prior
 * conversation OpenAI already retained server-side — see AiCallSession)
 * through the Responses API, executes any tool calls as plain local
 * function calls (lookupPropertyInfo/createPropertyLead — no HTTP hop,
 * unlike the n8n setup this replaces, since everything runs in this same
 * process), and loops until the model returns a final text reply. Only the
 * latest response id needs to be persisted between turns; OpenAI keeps the
 * actual conversation content.
 *
 * Called from app/api/ai-call/turn/route.js right after transcription — this
 * one request does the whole rest of the turn synchronously and can take
 * however long it needs, since the caller isn't waiting on it in silence:
 * the widget plays a "searching" filler clip it already prefetched at call
 * start (see prefetchFiller in components/AiCallWidget.jsx) the INSTANT
 * recording ends, entirely client-side, with no server round trip standing
 * between the caller going quiet and hearing something back. An earlier
 * version had the server hand the filler back as a fast first response
 * before running this — which still cost the STT time on top, and needed a
 * second request (turn-continue) to actually run this function. Prefetching
 * the filler client-side removed the need for that split completely. */
export async function runAgentTurn({ sessionId, transcript }) {
  if (!config.openai.apiKey) throw new Error("OPENAI_API_KEY o'rnatilmagan.");

  const systemPrompt = await getSystemPrompt();
  const existing = await prisma.aiCallSession.findUnique({ where: { sessionId } });

  // Summed across every round trip below (the initial call plus any
  // tool-call follow-ups) — a turn with a get_property_info search costs
  // multiple Responses API calls, and the caller (the /turn route, see
  // lib/callUsage.js) needs the turn's TOTAL, not just the last call's.
  const usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  function addUsage(response) {
    usage.inputTokens += response.usage?.input_tokens || 0;
    usage.cachedTokens += response.usage?.input_tokens_details?.cached_tokens || 0;
    usage.outputTokens += response.usage?.output_tokens || 0;
  }

  let response = await callResponsesApi({
    model: config.openai.callModel,
    instructions: systemPrompt,
    input: [{ role: "user", content: transcript }],
    tools: TOOLS,
    previous_response_id: existing?.lastResponseId || undefined,
    store: true,
  });
  addUsage(response);

  let functionCalls = (response.output || []).filter((item) => item.type === "function_call");
  // Tracks the most recent get_property_info result that had a
  // deterministic spokenReply — if the agent's final message ends up
  // matching it verbatim (as instructed), that's our cue to fetch/generate
  // this property's cached audio instead of a live ElevenLabs call. Only
  // the LAST one matters: an earlier tool call in the same turn being
  // overwritten by a later one is correct, since only the final reply text
  // can possibly match it.
  let pendingPropertyReply = null;

  for (let guard = 0; guard < 5 && functionCalls.length; guard++) {
    const outputs = [];
    for (const call of functionCalls) {
      let args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await executeTool(call.name, args);
      pendingPropertyReply =
        call.name === "get_property_info" && result?.id && result?.spokenReply
          ? { propertyId: result.id, spokenReply: result.spokenReply }
          : null;
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }

    response = await callResponsesApi({
      model: config.openai.callModel,
      instructions: systemPrompt,
      input: outputs,
      tools: TOOLS,
      previous_response_id: response.id,
      store: true,
    });
    addUsage(response);
    functionCalls = (response.output || []).filter((item) => item.type === "function_call");
  }

  const replyText = extractText(response) || "Kechirasiz, javob tayyorlashda xatolik yuz berdi. Qayta urinib ko'ring.";
  await prisma.aiCallSession.upsert({
    where: { sessionId },
    create: { sessionId, lastResponseId: response.id },
    update: { lastResponseId: response.id },
  });

  let audioUrl = null;
  if (pendingPropertyReply && replyText.trim() === pendingPropertyReply.spokenReply.trim()) {
    audioUrl = await getOrCreatePropertyReplyAudio(pendingPropertyReply.propertyId, replyText.trim()).catch(() => null);
  }
  return { reply: replyText, audioUrl, usage };
}
