// The staff group that used to get elon-olish submissions via @add_ad_bot —
// reused for every comment/DM forward (Instagram, Facebook, YouTube) so
// alerts land in the same place staff already watch, and (via SocialThread)
// is where staff reply to relay an answer back.
export const SUPPORT_GROUP_CHAT_ID = "-1002734287812";

/** Escapes the characters Telegram's HTML parse_mode treats specially, so
 * arbitrary user-supplied text (comment/DM bodies, names) can't break the
 * surrounding <b>/<i> markup used in forwarded messages. */
export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
