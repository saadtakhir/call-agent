// Deliberately its OWN tiny file, separate from lib/config.js (which holds
// real secrets like OPENAI_API_KEY) — components/AiCallWidget.jsx is a
// "use client" component that needs these two values in the browser
// bundle, and importing anything from lib/config.js there would risk
// bundling real secrets alongside them. Both of these are meant to be
// public: NEXT_PUBLIC_-prefixed vars are inlined into the client bundle by
// Next.js at build time (that's the whole point of the prefix), and
// Supabase's "anon" key is designed to be exposed in a browser the same
// way a Firebase client config is — it only grants access to whatever
// Realtime/Postgres policies explicitly allow, nothing by default.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
