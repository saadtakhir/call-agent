import { prisma } from "./prisma.js";
import { streamElevenLabsSpeech, toSpokenForm } from "./aiCallService.js";
import { uploadBuffer } from "./blobService.js";

export async function listCannedResponses() {
  return prisma.cannedResponse.findMany({ orderBy: { key: "asc" } });
}

export async function createCannedResponse({ key, text }) {
  if (!key?.trim() || !text?.trim()) throw new Error("\"key\" va \"text\" kerak.");
  return prisma.cannedResponse.create({ data: { key: key.trim(), text: text.trim() } });
}

/** Clears the cached audio whenever the text actually changes — the old
 * clip would otherwise keep being served for wording it no longer matches
 * (findCannedAudioUrl matches by exact text, but the row itself is looked
 * up by id/key elsewhere, e.g. re-generating). */
export async function updateCannedResponse(id, { key, text }) {
  const data = {};
  if (key !== undefined) data.key = key.trim();
  if (text !== undefined) {
    const trimmed = text.trim();
    data.text = trimmed;
    data.audioUrl = null;
  }
  return prisma.cannedResponse.update({ where: { id }, data });
}

export async function deleteCannedResponse(id) {
  return prisma.cannedResponse.delete({ where: { id } });
}

/** Synthesizes (or re-synthesizes) this entry's audio and caches it in
 * Blob — the same pattern as the call greeting's own caching, just admin-
 * triggered per entry instead of automatic-on-first-use, since these are
 * meant to be reviewed/approved before going live in a real call. */
export async function generateCannedResponseAudio(id) {
  const entry = await prisma.cannedResponse.findUnique({ where: { id } });
  if (!entry) throw new Error("Topilmadi.");

  const speechRes = await streamElevenLabsSpeech(toSpokenForm(entry.text));
  const buffer = Buffer.from(await speechRes.arrayBuffer());
  const url = await uploadBuffer(`ai-call/canned/${entry.id}.mp3`, buffer, "audio/mpeg");
  return prisma.cannedResponse.update({ where: { id }, data: { audioUrl: url } });
}

/** Finds a cached audio URL for an agent reply that matches (once trimmed)
 * a canned response's text exactly — used so frequently-repeated fixed
 * replies (the "tushunmadim" fallback, the lead-confirmation line, ...)
 * skip a live ElevenLabs call entirely. Returns null if nothing matches or
 * the matching entry's audio hasn't been generated yet, so the caller falls
 * back to normal live synthesis either way. */
export async function findCannedAudioUrl(replyText) {
  const normalized = (replyText || "").trim();
  if (!normalized) return null;
  const entry = await prisma.cannedResponse.findFirst({ where: { text: normalized, audioUrl: { not: null } } });
  return entry?.audioUrl || null;
}

/** Looks up one specific entry by its stable `key` rather than matching
 * arbitrary reply text — used for the "searching_filler" clip, which the
 * turn route sends back immediately (not by matching what the model
 * happened to say) whenever a turn needs a tool call. Returns
 * `{ text, audioUrl }`, or null if the key doesn't exist or has no
 * generated audio yet. */
export async function getCannedResponseByKey(key) {
  const entry = await prisma.cannedResponse.findUnique({ where: { key } });
  if (!entry?.audioUrl) return null;
  return { text: entry.text, audioUrl: entry.audioUrl };
}
