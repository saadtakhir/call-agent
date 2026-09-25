import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabasePublicConfig.js";

// Channel naming: one broadcast topic per call, so a hangup meant for one
// session can never be picked up by another — components/AiCallWidget.jsx
// and sip-bridge/src/callSession.js both subscribe to this exact same
// topic name for their own sessionId.
export function hangupChannelName(sessionId) {
  return `call-hangup:${sessionId}`;
}

/** Pushes an instant "hang up now" event to whichever client (browser
 * widget or sip-bridge) is subscribed to this call's channel — called
 * right after requestHangup's DB flag write (see
 * app/api/ai-call/hangup/route.js), which stays in place as a slower
 * (30s) polling fallback in case this broadcast is ever missed (a
 * dropped Realtime connection, a momentary Supabase outage, ...).
 *
 * Uses Supabase's plain REST "Broadcast from server" endpoint
 * (https://supabase.com/docs/guides/realtime/broadcast#broadcast-from-the-server)
 * rather than the JS SDK's socket-based channel.send() — this runs inside
 * a short-lived Vercel function that has no business holding its own
 * WebSocket open just to fire one message, so a plain HTTP POST is both
 * simpler and a better fit. Best-effort: a failed broadcast never fails
 * the actual hangup request, since the DB flag + polling fallback still
 * gets the call ended within 30s regardless. */
export async function broadcastHangup(sessionId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return; // not configured — polling fallback still works
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ topic: hangupChannelName(sessionId), event: "hangup", payload: {} }],
      }),
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
