// Trimmed from the e-content monolith's lib/config.js — only the fields
// this standalone AI call agent actually reads. See the other feature's
// config.js if you ever need to compare against the full original.
export const config = {
  uyJoyApiBase: process.env.UY_JOY_API_BASE || "https://api.uy-joy.uz/api/public/product",
  uyJoyCatalogUrl: process.env.UY_JOY_CATALOG_URL || "https://api.uy-joy.uz/api/public/main/catalog/search",

  // How many AI calls may run at the same time — kept low by default since
  // it's bounded by the ElevenLabs/OpenAI account's own concurrency limits,
  // not by anything this app itself needs.
  maxConcurrentCalls: Number(process.env.MAX_CONCURRENT_CALLS) || 3,

  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
    // "v3 Conversational" — purpose-built for live conversation latency
    // (~280ms) rather than plain "v3"'s slower, more dramatic delivery.
    callModelId: process.env.ELEVENLABS_CALL_MODEL_ID || "eleven_v3_conversational",
  },

  // Uzbekistan-built, Uzbek-specialized STT/TTS provider — one of 3
  // switchable STT options (see lib/aiCallService.js's STT_PROVIDERS).
  muxlisa: {
    apiKey: process.env.MUXLISA_API_KEY || "",
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    // ElevenLabs' own ASR was reported to badly mishear Uzbek speech, so
    // OpenAI transcribes by default instead (still switchable, see above).
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe",
    // The call agent's "brain", via the Responses API's function/tool
    // calling (see lib/aiCallAgent.js).
    callModel: process.env.OPENAI_CALL_MODEL || "gpt-5.6-terra",
  },
};
