# AI Qo'ng'iroq Agent

E-content.uz loyihasidan ajratib olingan, mustaqil AI ovozli qo'ng'iroq agenti — brauzer orqali mijoz bilan jonli suhbat (Web Audio API), OpenAI Responses API orqali javob tayyorlash, ElevenLabs/OpenAI/Muxlisa orqali ovoz tanish va TTS, uy-joy.uz katalogidan mulk qidirish.

Asosiy loyiha (e-content)dan farqi: bu yerda oddiy bitta-adminlik login/parol tizimi ishlatiladi (to'liq foydalanuvchi/rol tizimi emas).

## Talab qilinadigan tashqi xizmatlar

- **Postgres baza** (Neon tavsiya etiladi) — `DATABASE_URL` / `DATABASE_URL_UNPOOLED`
- **Vercel Blob** — audio fayllarni (salomlashish, tayyor javoblar, mulk javoblari) keshlash uchun — `BLOB_READ_WRITE_TOKEN`
- **OpenAI API kaliti** — agentning "miya"si (Responses API) va standart STT
- **ElevenLabs API kaliti** — ovoz sintezi (TTS) va muqobil STT
- **Muxlisa AI API kaliti** (ixtiyoriy) — muqobil, o'zbek tiliga ixtisoslashgan STT
- **Telegram bot tokeni** (ixtiyoriy) — ariza qoldirilganda xodimlar guruhiga xabar yuborish uchun

## Mahalliy ishga tushirish

```bash
npm install
cp .env.example .env.local
# .env.local faylini to'ldiring (kamida: ADMIN_USERNAME, ADMIN_PASSWORD,
# SESSION_SECRET, DATABASE_URL, BLOB_READ_WRITE_TOKEN, OPENAI_API_KEY,
# ELEVENLABS_API_KEY)
npx prisma db push
npm run dev
```

`http://localhost:3000` ga kirib, `.env.local`da o'rnatgan login/parol bilan kiring.

## Vercel'ga joylashtirish (yangi akkauntda)

1. Ushbu papkani (`ai-call-agent`) alohida Git repositoriyaga joylashtiring (`git init`, `git add -A`, `git commit`, keyin GitHub/GitLab'ga push qiling).
2. Yangi Vercel akkauntda shu repodan yangi loyiha yarating.
3. **Environment Variables** bo'limida `.env.example`dagi barcha kerakli qiymatlarni kiriting (ayniqsa `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`).
4. Postgres baza yo'q bo'lsa — Vercel'ning o'z Storage bo'limidan Neon integratsiyasini ulash mumkin (avtomatik `DATABASE_URL` beradi).
5. Vercel Blob uchun ham Storage bo'limidan yangi Blob Store yarating — `BLOB_READ_WRITE_TOKEN` avtomatik qo'shiladi.
6. Deploy qiling. Birinchi deploydan keyin, agar `prisma db push` avtomatik ishlamagan bo'lsa, lokal terminaldan `.env.local`ga production `DATABASE_URL`ni vaqtincha qo'yib `npx prisma db push` ishga tushiring (jadvallarni yaratish uchun, faqat bir marta kerak).

## Birinchi sozlash (deploy'dan keyin)

`/ai-qongiroq-sozlamalar` sahifasida:
1. **STT provayder** — ChatGPT/ElevenLabs/Muxlisa orasidan tanlang (standart: ChatGPT).
2. **System Message** — kerak bo'lsa AI'ning xatti-harakat qoidalarini tahrirlang.
3. **Tayyor javoblar kutubxonasi** — quyidagi kalitlar bilan yozuv qo'shib, har biriga "Audio yaratish" tugmasini bosing:
   - `searching_filler` — javob kutilayotganda aytiladigan gap (masalan "Bir daqiqa...")
   - `silence_check` — mijoz uzoq jim qolganda aytiladigan gap (masalan "Eshitib turibsizmi?")

Bu ikkalasi generatsiya qilinmaguncha, tizim ularning o'rniga har safar jonli (sekinroq) ElevenLabs chaqiruviga tushib turadi — funksional jihatdan ishlayveradi, shunchaki tezroq bo'lishi uchun oldindan tayyorlab qo'yish tavsiya etiladi.

## Struktura

```
lib/            — biznes-mantiq (agent, STT/TTS, mulk qidiruv, autentifikatsiya)
app/            — sahifalar va API route'lar
components/     — React komponentlar (qo'ng'iroq vidjeti, sozlamalar panellari)
proxy.js        — barcha sahifa/API'ni login talab qiladigan qilib himoya qiladi
prisma/         — baza sxemasi (6 ta mustaqil jadval, boshqa hech narsaga bog'liq emas)
```
