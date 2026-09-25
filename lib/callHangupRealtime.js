import { after } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ACTIVE_SESSIONS_CHANNEL, ACTIVE_SESSIONS_EVENT } from "./supabasePublicConfig.js";

// Channel naming: one broadcast topic per call, so a hangup meant for one
// session can never be picked up by another — components/AiCallWidget.jsx
// and sip-bridge/src/callSession.js both subscribe to this exact same
// topic name for their own sessionId.
export function hangupChannelName(sessionId) {
  return `call-hangup:${sessionId}`;
}

/** Uses Supabase's plain REST "Broadcast from server" endpoint
 * (https://supabase.com/docs/guides/realtime/broadcast#broadcast-from-the-server)
 * rather than the JS SDK's socket-based channel.send() — this runs inside
 * short-lived Vercel functions that have no business holding their own
 * WebSocket open just to fire one message, so a plain HTTP POST is both
 * simpler and a better fit. Best-effort: a failed broadcast never fails
 * the request that triggered it — every caller also has a slower fallback
 * (a 30s poll for hangups, a 60s refetch for the active-calls list). */
async function broadcast(topic, event) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return; // not configured — polling fallbacks still work
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload: {} }] }),
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}

/** Pushes an instant "hang up now" event to whichever client (browser
 * widget or sip-bridge) is subscribed to this call's channel — called
 * right after requestHangup's DB flag write (see
 * app/api/ai-call/hangup/route.js), which stays in place as a slower
 * (30s) polling fallback in case this broadcast is ever missed. */
export function broadcastHangup(sessionId) {
  return broadcast(hangupChannelName(sessionId), "hangup");
}

/** Tells any open Faol suhbatlar page to refetch — called whenever a call
 * starts or ends (see lib/aiCallCapacity.js). Deferred with Next's after()
 * so it never adds latency to the call start/end request itself, while
 * still being guaranteed to complete on a serverless function that would
 * otherwise be frozen the moment the response goes out. */
export function notifyActiveSessionsChanged() {
  const send = () => broadcast(ACTIVE_SESSIONS_CHANNEL, ACTIVE_SESSIONS_EVENT);
  try {
    after(send);
  } catch {
    send(); // not inside a request scope — fire it directly
  }
}
