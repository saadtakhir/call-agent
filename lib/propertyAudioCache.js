import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { uploadBuffer } from "./blobService.js";
import { streamElevenLabsSpeech, toSpokenForm, TTS_OUTPUT_FORMAT } from "./aiCallService.js";

function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

/** Synthesizes (or reuses a cached) audio clip for one property's
 * deterministic "found this listing" announcement (see
 * lib/uyJoyCatalogService.js's buildPropertyReplyTemplate) — generated
 * lazily the first time that property's id is actually asked about on a
 * call, never pre-built for the whole catalog, since most listings are
 * never mentioned in any real call. `textHash` detects when the listing's
 * own data (price, description, ...) changed since the cached clip was
 * made, invalidating it — same pattern as the call greeting's own cache in
 * lib/aiCallService.js. */
export async function getOrCreatePropertyReplyAudio(propertyId, text) {
  // The audio format is part of the key so a format change regenerates the
  // clip instead of serving one made at the old (larger) setting.
  const hash = hashText(`${TTS_OUTPUT_FORMAT}|${text}`);
  const existing = await prisma.propertyReplyAudio.findUnique({ where: { propertyId } });
  if (existing?.textHash === hash && existing.audioUrl) {
    const cached = await fetch(existing.audioUrl, { cache: "no-store" }).catch(() => null);
    if (cached?.ok) return existing.audioUrl;
    // Cached blob is missing/unreachable — fall through and regenerate.
  }

  const speechRes = await streamElevenLabsSpeech(toSpokenForm(text));
  const buffer = Buffer.from(await speechRes.arrayBuffer());
  const audioUrl = await uploadBuffer(`ai-call/property/${propertyId}.mp3`, buffer, "audio/mpeg");
  await prisma.propertyReplyAudio.upsert({
    where: { propertyId },
    create: { propertyId, textHash: hash, audioUrl },
    update: { textHash: hash, audioUrl },
  });
  return audioUrl;
}
