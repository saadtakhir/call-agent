import { getPbxRegistrationStatus, reloadPjsip } from "./asteriskStatus.js";

// Was 30s — the very thing this heartbeat exists to do (prove the bridge
// is alive, hand it commands) still works fine at this slower pace, and
// it was by far the single biggest contributor to this app's Vercel
// function-invocation/CPU usage (a heartbeat firing every 30s, all day,
// every day, against every other route combined). See STALE_AFTER_MS in
// lib/sipStatus.js, which had to grow along with this — it's derived from
// this same interval (missing "a couple in a row" before flagging
// offline), not an independent number.
const HEARTBEAT_INTERVAL_MS = 120_000;

/** Periodically tells the app "the bridge process is alive and reachable",
 * how many calls it's currently bridging, and whether Asterisk is actually
 * registered with the PBX — shown on the SIP sozlamalari panel (see
 * lib/sipStatus.js) so the real registration state is visible there
 * instead of only via SSH. The heartbeat response doubles as the only
 * channel the app has to hand this VPS a command (there's no way to reach
 * in directly) — currently just the "Qayta ulanish" button's reconnect
 * request, picked up here within one heartbeat interval. */
export function startHeartbeat({ authClient, getActiveCallCount }) {
  async function send() {
    try {
      const pbx = await getPbxRegistrationStatus();
      const res = await authClient.apiFetch("/api/ai-call/sip-heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeCalls: getActiveCallCount(),
          pbxRegistered: pbx.registered,
          pbxStatusDetail: pbx.detail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.reconnectRequested) {
        console.log("[sip-bridge] reconnect requested — reloading pjsip");
        await reloadPjsip().catch((err) => console.error(`[sip-bridge] pjsip reload failed: ${err.message}`));
      }
    } catch (err) {
      console.error(`[sip-bridge] heartbeat failed: ${err.message}`);
    }
  }

  send();
  return setInterval(send, HEARTBEAT_INTERVAL_MS);
}
