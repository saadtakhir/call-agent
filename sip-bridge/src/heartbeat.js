const HEARTBEAT_INTERVAL_MS = 30_000;

/** Periodically tells the app "the bridge process is alive and reachable"
 * plus how many calls it's currently bridging — shown as the online/
 * offline badges on the SIP sozlamalari panel (see lib/sipStatus.js).
 * Reflects the Node process, not Asterisk's own SIP registration state
 * with FreePBX, since checking that would need AMI/CLI access this
 * service doesn't have. */
export function startHeartbeat({ authClient, getActiveCallCount }) {
  async function send() {
    try {
      await authClient.apiFetch("/api/ai-call/sip-heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeCalls: getActiveCallCount() }),
      });
    } catch (err) {
      console.error(`[sip-bridge] heartbeat failed: ${err.message}`);
    }
  }

  send();
  return setInterval(send, HEARTBEAT_INTERVAL_MS);
}
