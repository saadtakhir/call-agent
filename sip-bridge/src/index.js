import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { AuthClient } from "./authClient.js";
import { startAudioSocketServer } from "./audiosocketServer.js";
import { startHeartbeat } from "./heartbeat.js";

const { APP_BASE_URL, SIP_BRIDGE_USERNAME, SIP_BRIDGE_PASSWORD, AUDIOSOCKET_PORT, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

for (const [key, value] of Object.entries({ APP_BASE_URL, SIP_BRIDGE_USERNAME, SIP_BRIDGE_PASSWORD })) {
  if (!value) {
    console.error(`[sip-bridge] Missing required env var: ${key} (see .env.example)`);
    process.exit(1);
  }
}

const authClient = new AuthClient({
  baseUrl: APP_BASE_URL,
  username: SIP_BRIDGE_USERNAME,
  password: SIP_BRIDGE_PASSWORD,
});

try {
  await authClient.login();
  console.log(`[sip-bridge] logged in to ${APP_BASE_URL} as ${SIP_BRIDGE_USERNAME}`);
} catch (err) {
  console.error(`[sip-bridge] login failed: ${err.message}`);
  process.exit(1);
}

// Optional — an instant "Tugatish" push (see callSession.js/hangupRealtime.js)
// on top of the existing slow polling fallback, which still works fine on
// its own if this isn't configured (see .env.example).
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
if (!supabase) console.warn("[sip-bridge] SUPABASE_URL/SUPABASE_ANON_KEY not set — hangup relies on the 30s poll only.");

const { getActiveCallCount } = startAudioSocketServer({
  port: Number(AUDIOSOCKET_PORT) || 8090,
  authClient,
  supabase,
});

startHeartbeat({ authClient, getActiveCallCount });
