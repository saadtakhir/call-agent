import { getPbxRegistrationStatus, reloadPjsip } from "./asteriskStatus.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

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
