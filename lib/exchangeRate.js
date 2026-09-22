let cachedUsdToUzsRate = null;
let cachedRateAt = 0;
const RATE_CACHE_MS = 60 * 60 * 1000; // CBU updates once a day — no need to refetch more often than this

/** Live USD/UZS rate from the Central Bank of Uzbekistan's public API —
 * used by lib/callUsage.js (to combine USD and so'm costs into one
 * per-minute figure) and by the sidebar's exchange-rate badge. Fetched
 * fresh (short cache) rather than hardcoded, so it never goes stale
 * without anyone noticing. */
export async function getUsdToUzsRate() {
  if (cachedUsdToUzsRate && Date.now() - cachedRateAt < RATE_CACHE_MS) return cachedUsdToUzsRate;
  const res = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/");
  if (!res.ok) throw new Error(`CBU kursi xatosi (${res.status})`);
  const [data] = await res.json();
  const rate = Number(data?.Rate);
  if (!rate) throw new Error("CBU kursi noto'g'ri formatda qaytdi.");
  cachedUsdToUzsRate = rate;
  cachedRateAt = Date.now();
  return rate;
}
