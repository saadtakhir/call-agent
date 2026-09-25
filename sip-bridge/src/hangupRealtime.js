// Must match lib/callHangupRealtime.js's hangupChannelName exactly on the
// main app's side — that's what an admin's "Tugatish" click broadcasts on.
export function hangupChannelName(sessionId) {
  return `call-hangup:${sessionId}`;
}
