import "dotenv/config";
import { AuthClient } from "./authClient.js";
import { startAudioSocketServer } from "./audiosocketServer.js";
import { startHeartbeat } from "./heartbeat.js";

const { APP_BASE_URL, SIP_BRIDGE_USERNAME, SIP_BRIDGE_PASSWORD, AUDIOSOCKET_PORT } = process.env;

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

const { getActiveCallCount } = startAudioSocketServer({
  port: Number(AUDIOSOCKET_PORT) || 8090,
  authClient,
});

startHeartbeat({ authClient, getActiveCallCount });
