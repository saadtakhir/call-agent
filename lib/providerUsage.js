import { config } from "./config.js";

/** Reads a provider's own account-wide usage/quota for the current billing
 * period straight from their API — a quick "is this plan about to run
 * out" check, distinct from this app's own per-call usage logging (see
 * lib/callUsage.js), which tracks OUR calls specifically rather than
 * whatever else might share the same API key. */
export async function getElevenLabsUsage() {
  if (!config.elevenLabs.apiKey) throw new Error("ELEVENLABS_API_KEY sozlanmagan.");
  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": config.elevenLabs.apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs xatosi (${res.status})`);
  const data = await res.json();
  return {
    tier: data.tier || null,
    characterCount: data.character_count ?? null,
    characterLimit: data.character_limit ?? null,
    nextResetAt: data.next_character_count_reset_unix
      ? new Date(data.next_character_count_reset_unix * 1000).toISOString()
      : null,
    status: data.status || null,
  };
}

// OpenAI's usage/costs endpoints (/v1/organization/usage/*,
// /v1/organization/costs) need a separate organization-level Admin API key
// (api.usage.read scope) — the regular OPENAI_API_KEY used for actual
// calls has no permission to read them, so there's nothing to fetch here
// yet. See OPENAI_ADMIN_API_KEY in .env.example once that's added.
export async function getOpenAiUsage() {
  const adminKey = process.env.OPENAI_ADMIN_API_KEY;
  if (!adminKey) throw new Error("OPENAI_ADMIN_API_KEY sozlanmagan — bu oddiy API key'dan farqli, tashkilot sozlamalaridan Admin key yarating.");

  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const res = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${since}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI xatosi (${res.status})`);
  const data = await res.json();
  const totalUsd = (data.data || []).reduce((sum, bucket) => {
    const bucketTotal = (bucket.results || []).reduce((s, r) => s + (r.amount?.value || 0), 0);
    return sum + bucketTotal;
  }, 0);
  return { last30DaysUsd: totalUsd };
}

// Muxlisa AI's API docs don't currently document a balance/usage endpoint
// — nothing to call yet. Revisit if/when they publish one.
export async function getMuxlisaUsage() {
  throw new Error("Muxlisa AI hozircha balans/xarajat API'sini taqdim etmaydi.");
}
