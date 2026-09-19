import { getPbxRegistrationStatus } from "./asteriskStatus.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

/** Periodically tells the app "the bridge process is alive and reachable",
 * how many calls it's currently bridging, and whether Asterisk is actually
 * registered with the PBX — shown on the SIP sozlamalari panel (see
 * lib/sipStatus.js) so the real registration state is visible there
 * instead of only via SSH. */
export function startHeartbeat({ authClient, getActiveCallCount }) {
  async function send() {
    try {
      const pbx = await getPbxRegistrationStatus();
      await authClient.apiFetch("/api/ai-call/sip-heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeCalls: getActiveCallCount(),
          pbxRegistered: pbx.registered,
          pbxStatusDetail: pbx.detail,
        }),
      });
    } catch (err) {
      console.error(`[sip-bridge] heartbeat failed: ${err.message}`);
    }
  }

  send();
  return setInterval(send, HEARTBEAT_INTERVAL_MS);
}
