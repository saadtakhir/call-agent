import { getSetting, setSetting } from "./appSettings.js";

const KEYS = {
  lastHeartbeatAt: "sipLastHeartbeatAt",
  activeCalls: "sipActiveCalls",
  pbxRegistered: "sipPbxRegistered",
  pbxStatusDetail: "sipPbxStatusDetail",
};

// The Vercel app has no way to reach INTO the VPS (no persistent
// connection, serverless functions can't hold one open) — the only signal
// it has that sip-bridge is alive is the bridge periodically PUSHING a
// heartbeat here (see sip-bridge/src/heartbeat.js). Missing a couple in a
// row means the process crashed, lost network, or the VPS itself is down.
const STALE_AFTER_MS = 90_000;

export async function recordHeartbeat({ activeCalls, pbxRegistered, pbxStatusDetail }) {
  await Promise.all([
    setSetting(KEYS.lastHeartbeatAt, new Date().toISOString()),
    setSetting(KEYS.activeCalls, String(activeCalls ?? 0)),
    setSetting(KEYS.pbxRegistered, pbxRegistered ? "true" : "false"),
    setSetting(KEYS.pbxStatusDetail, pbxStatusDetail || ""),
  ]);
}

export async function getSipStatus() {
  const [lastHeartbeatAt, activeCalls, pbxRegistered, pbxStatusDetail] = await Promise.all([
    getSetting(KEYS.lastHeartbeatAt, ""),
    getSetting(KEYS.activeCalls, "0"),
    getSetting(KEYS.pbxRegistered, "false"),
    getSetting(KEYS.pbxStatusDetail, ""),
  ]);

  const lastSeenMs = lastHeartbeatAt ? Date.parse(lastHeartbeatAt) : 0;
  const online = lastSeenMs > 0 && Date.now() - lastSeenMs < STALE_AFTER_MS;

  return {
    online,
    activeCalls: Number(activeCalls) || 0,
    lastHeartbeatAt: lastHeartbeatAt || null,
    // Stale unless the bridge itself is currently online — an old
    // "Registered" from before a crash would otherwise keep showing green.
    pbxRegistered: online && pbxRegistered === "true",
    pbxStatusDetail: online ? pbxStatusDetail || null : null,
  };
}
