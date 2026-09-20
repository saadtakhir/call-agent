import { getSetting, setSetting } from "./appSettings.js";

const KEYS = {
  lastHeartbeatAt: "sipLastHeartbeatAt",
  activeCalls: "sipActiveCalls",
  pbxRegistered: "sipPbxRegistered",
  pbxStatusDetail: "sipPbxStatusDetail",
  reconnectRequested: "sipReconnectRequested",
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

/** Set by the "Qayta ulanish" button (see components/SipStatusBadges.jsx)
 * and picked up by the bridge on its NEXT heartbeat (up to ~30s later) —
 * there's no way to reach into the VPS directly, so the heartbeat it
 * already sends every 30s doubles as the only channel to hand it a
 * command. Consumed (cleared) the moment a heartbeat picks it up, so it
 * fires exactly once per button click. */
export async function requestReconnect() {
  await setSetting(KEYS.reconnectRequested, "true");
}

export async function consumeReconnectRequest() {
  const requested = (await getSetting(KEYS.reconnectRequested, "false")) === "true";
  if (requested) await setSetting(KEYS.reconnectRequested, "false");
  return requested;
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
