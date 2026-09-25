import { toSpokenForm, parseSpokenPropertyId, TTS_OUTPUT_FORMAT } from "./aiCallService.js";
import { correctPlaceNames } from "./huduDirectory.js";
import { cyrillicToLatinUzCaption } from "./translit.js";
import {
  extractListingId,
  formatAreaForSpeech,
  formatPriceForSpeech,
  formatPriceGrouped,
  reformatSaleTermsDescription,
  UY_JOY_TIMEOUT_MS,
  LISTING_LIMIT,
} from "./uyJoyCatalogService.js";
import { getToolConfig } from "./aiTools.js";
import { getMaxConcurrentCalls, getMaxCallDurationMinutes } from "./aiCallCapacity.js";

// The read-only "Qoidalar" page (components/RulesPanel.jsx) is built from
// this list. Every "Natija" cell of a computed row is produced by running
// the REAL function on the example input, at request time — nothing here is
// a hand-written copy of what the code does, so the tables can't drift from
// the actual behavior. Only the "AI xulqi" section is static text (it
// describes System Message instructions, which are prose, not code).

const COLUMNS_EXAMPLE = ["Qoida", "Kirish (misol)", "Natija"];

function safe(fn) {
  try {
    const out = fn();
    return out == null || out === "" ? "(bo'sh)" : String(out);
  } catch (err) {
    return `(hisoblab bo'lmadi: ${err.message})`;
  }
}

function computed(rule, input, fn, shownInput = input) {
  return { cells: [rule, shownInput, safe(() => fn(input))], mono: [1] };
}

export async function getRuleSections() {
  const toolConfig = await getToolConfig();
  const [maxConcurrent, maxDurationMinutes] = await Promise.all([getMaxConcurrentCalls(), getMaxCallDurationMinutes()]);

  return [
    {
      id: "numbers",
      title: "1. Raqamlarni so'zga aylantirish",
      intro:
        "Ovozga aylantiriladigan (ElevenLabs) har qanday matn avval shu qoidalardan o'tadi — ovozga hech qachon raqam ko'rinishida berilmaydi. Bu qoida ElevenLabs'ga boradigan yagona funksiyaning ichiga o'rnatilgan, shuning uchun uni hech bir joyda unutib bo'lmaydi. Telegram va ekrandagi matnda esa raqamlar odatdagidek raqam ko'rinishida qoladi.",
      columns: COLUMNS_EXAMPLE,
      rows: [
        computed("Oddiy son", "120 oy", toSpokenForm),
        computed("Minglar (bo'sh joy bilan yozilgan)", "1 305 926 700 so'm", toSpokenForm),
        computed("Minglar (nuqta bilan yozilgan)", "1.305.926 dona", toSpokenForm),
        computed("Kasr — o'ndan (1 xona)", "5.5 foiz", toSpokenForm),
        computed("Kasr — yuzdan (2 xona)", "5.05 foiz", toSpokenForm),
        computed("Kasr — yuzdan, ikki xonali qism", "12.75 foiz", toSpokenForm),
        computed("Kasr — vergul bilan", "2,5 million so'm", toSpokenForm),
        computed("Foiz belgisi", "15% yillik ustama", toSpokenForm),
        computed("Maydon (m²)", "544 m²", toSpokenForm),
        computed("Sana (avval yil, tartib sonlar bilan)", "23.09.2026", toSpokenForm),
        computed("Vaqt", "10:00 da", toSpokenForm),
        computed("Telefon raqami (guruhlab o'qiladi)", "55 517 22 20", toSpokenForm),
        computed("Mulk ID raqami (6 xonali, ikki guruh)", "142130", toSpokenForm),
        computed("Raqam + qo'shimcha", "2-qavat, 9 qavatli uy", toSpokenForm),
      ],
    },
    {
      id: "pronunciation",
      title: "2. Maxsus so'zlar (talaffuz)",
      intro: "Ba'zi so'zlar ovozda noto'g'ri o'qilishi mumkin, shuning uchun ovozga berishdan oldin almashtiriladi. Ekrandagi matnda asl yozuvi qoladi.",
      columns: COLUMNS_EXAMPLE,
      rows: [
        computed("Brend nomi", "E-rieltor.uz yordamchisiman", toSpokenForm),
        computed("MFY qisqartmasi", "Elabod MFY", toSpokenForm),
        computed("\"zakalat\" so'zi", "zakalat to'lanadi", toSpokenForm),
        computed("Savdo turi nomi", "savdo kim oshdi savdo ko'rinishida bo'lib o'tadi", toSpokenForm),
      ],
    },
    {
      id: "price-area",
      title: "3. Narx va maydonni yaxlitlash",
      intro:
        "Mijozga hech qachon haqiqiy narxdan kam narx aytilmasligi uchun narx yuqoriga yaxlitlanadi, maydon esa pastga (kasr qismi tashlab yuboriladi).",
      columns: COLUMNS_EXAMPLE,
      rows: [
        computed("Narx — yuqoriga, butun so'mgacha (raqamda)", "650000000.01", (v) => `${formatPriceGrouped(v)} so'm`),
        computed("Narx — yuqoriga (so'z bilan, ba'zi javob shablonlarida)", "650000000.01", formatPriceForSpeech),
        computed("Maydon — pastga, kasr tashlanadi", "433.8", formatAreaForSpeech, "433.8 m²"),
      ],
    },
    {
      id: "sale-terms",
      title: "4. Sotuv shartlari matnini tozalash",
      intro:
        "E-lonlardagi erkin yozilgan sotuv shartlari matni ovozda o'qishga noqulay bo'lgan takroriy shablonlar bo'yicha tuzatiladi. Boshqa matn o'zgarishsiz qoladi. Tuzatilgan matn oldiga \"Ushbu obyektning sotuv shartlari.\" qo'shiladi.",
      columns: COLUMNS_EXAMPLE,
      rows: [
        computed("Nuqtali vergul (;) — pauza qilib yubormaslik uchun vergulga", "5 foiz boshlang'ich badal to'lash; 15 foiz ustama to'lash", reformatSaleTermsDescription),
        computed("Noto'g'ri yozilgan \"oy\" (kirill \"оу\", lotin \"ou\") to'g'rilanadi", "120 оу muddatga to'lash", reformatSaleTermsDescription),
        computed("Muddat va imtiyozli davr iborasi", "120 oy (24 oy imtiyoz) muddatga bo'lib-bo'lib to'lash sharti bilan savdoga chiqarilgan", reformatSaleTermsDescription),
        computed("\"bo'lib-bo'lib\" — ikki so'z qilib yoziladi", "bo'lib-bo'lib to'lash", reformatSaleTermsDescription),
        computed("\"savdolarga chiqarilmoqda\" tugallangan shaklga", "120 oy muddatga to'lash sharti bilan savdolarga chiqarilmoqda", reformatSaleTermsDescription),
        computed("\"...sharti bilan\" da to'xtagan jumla tugallanadi", "120 oy muddatga to'lash sharti bilan", reformatSaleTermsDescription),
      ],
    },
    {
      id: "translit",
      title: "5. Kirill yozuvini lotinga o'tkazish",
      intro: "uy-joy.uz'dagi ko'p matnlar kirill yozuvida. Ovoz modeli lotin yozuvidagi o'zbekchani to'g'ri o'qiydi, shuning uchun manbadan olingan zahoti lotinga o'giriladi.",
      columns: COLUMNS_EXAMPLE,
      rows: [
        computed("Manzil", "Кукумбой кўчаси,157-уй", cyrillicToLatinUzCaption),
        computed("Maxsus harflar (ғ, қ, ҳ, ў)", "Ғиждувон, Қўқон, Ҳазорасп", cyrillicToLatinUzCaption),
        computed("Hudud nomi", "Урганч шаҳри", cyrillicToLatinUzCaption),
      ],
    },
    {
      id: "stt",
      title: "6. Ovozdan matnga o'tkazishdagi tuzatishlar",
      intro: "Mijoz gapini matnga aylantirgandan keyin, AI'ga berishdan oldin, ishonchli tuzatiladigan narsalar.",
      columns: COLUMNS_EXAMPLE,
      rows: [
        computed("So'z bilan aytilgan ID — raqamga", "bir yuz qirq ikki bir yuz o'ttiz", parseSpokenPropertyId),
        computed("ID ichida nol bo'lsa", "bir yuz o'n to'qqiz nol to'qson sakkiz", parseSpokenPropertyId),
        computed("Hudud nomi yaqin so'zdan tuzatiladi", "urganch shaxri kvartira", correctPlaceNames),
        computed("Mulk ID'ni ajratib olish (eng uzun raqam ID hisoblanadi)", "113, 444", (v) => extractListingId(v)),
        computed("Xona soni/maydon ID bilan aralashmaydi", "3 xonali 90 kv.m 142130", (v) => extractListingId(v)),
      ],
    },
    {
      id: "ai",
      title: "7. AI xulq qoidalari",
      intro:
        "Bular kod emas, AI'ga System Message orqali berilgan ko'rsatmalar (\"AI xulqi\" bo'limida tahrirlanadi) — bu yerda ularning standart holati qisqacha ko'rsatilgan. Shu bo'limda tahrir qilingan bo'lsa, haqiqiy xulq undan farq qilishi mumkin.",
      columns: ["Qoida", "Nima qiladi", "Misol"],
      rows: [
        { cells: ["Tasdiqlash majburiy", "ID, hudud yoki tur aytilgach, qidirishdan oldin eshitganini qaytarib aytadi va tasdiq kutadi.", "Tushunarli, ID raqamingiz 142130, to'g'rimi?"] },
        { cells: ["Javob savol bilan tugaydi", "Suhbat osilib qolmasligi uchun deyarli har javob qisqa savol bilan tugaydi.", "Yana savolingiz bormi?"] },
        { cells: ["Ro'yxat shakli", "Bir nechta mulk topilsa, har birini bir xil shaklda aytadi, ID so'ramaydi.", "Istiqlol mahallasida - 650 000 000 so'm"] },
        { cells: ["Natija ko'p bo'lsa", "Ro'yxat o'rniga taxminiy byudjetni so'raydi.", "Taxminan necha so'mgacha byudjetingiz bor?"] },
        { cells: ["Telefon raqami shakli", "Ariza uchun raqamni doim 9 xonali, guruhlab yozadi va tasdiqlaydi.", "55 517 22 20"] },
        { cells: ["Ariza olish tartibi", "Ism va telefonni tasdiqlaydi, keyin ariza yaratadi.", "Ma'lumotlaringizni qabul qildim, xodimlar tez orada bog'lanishadi."] },
        { cells: ["Maxfiylik", "Hudud yoki kategoriyaning ichki ID raqamini hech qachon aytmaydi, faqat nomlarini.", "Xorazm viloyati (ID emas)"] },
        { cells: ["Sotilgan mulk", "Ma'lumot bermaydi; boshqa qidiruvni taklif qiladi, keyin ariza olishni taklif qiladi.", "Bu mulk allaqachon sotilgan ekan..."] },
        { cells: ["Operator so'ralsa", "Operatorga ulay olmasligini aytib, qayta qo'ng'iroq uchun ariza taklif qiladi.", "Hozircha operatorga ulash imkoniyatim yo'q..."] },
        { cells: ["Tabiiy ohang", "Erkin javoblarni qisqa tan olish bilan boshlaydi; shablon matnlar (mulk javobi, sotuv shartlari) so'zma-so'z aytiladi.", "Tushunarli / Albatta / Xo'p"] },
      ],
    },
    {
      id: "limits",
      title: "8. Joriy chegaralar va qiymatlar",
      intro: "Tizimning hozir amaldagi sonli sozlamalari (bu jadval faqat ko'rsatadi, o'zgartirish tegishli bo'limlarda).",
      columns: ["Qiymat", "Hozirgi", "Qayerda o'zgartiriladi"],
      rows: [
        { cells: ["Byudjet so'rash chegarasi (natija shundan ko'p bo'lsa)", String(toolConfig.limits.listingLimit), `Toollar bo'limi (standart: ${LISTING_LIMIT})`] },
        { cells: ["Ro'yxatda aytiladigan maksimum mulk", String(toolConfig.limits.maxListingsShown), "Toollar bo'limi"] },
        { cells: ["uy-joy.uz so'rovi kutish vaqti", `${UY_JOY_TIMEOUT_MS / 1000} soniya`, "Kodda"] },
        { cells: ["Bir vaqtdagi suhbatlar soni", String(maxConcurrent), "Chegara bo'limi"] },
        { cells: ["Maksimal suhbat davomiyligi", `${maxDurationMinutes} daqiqa`, "Chegara bo'limi"] },
        { cells: ["Ovoz audio formati", TTS_OUTPUT_FORMAT, "Kodda"] },
      ],
    },
  ];
}
