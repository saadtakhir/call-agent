import { put } from "@vercel/blob";

const token = process.env.BLOB_READ_WRITE_TOKEN;

/** Uploads audio (greeting/canned-response/per-property reply clips) to
 * Vercel Blob, public and overwritable at a fixed path — the whole point of
 * this app's caching (never re-synthesizing the same clip twice) depends on
 * a stable, predictable URL per cache key. */
export async function uploadBuffer(pathname, buffer, contentType) {
  const { url } = await put(pathname, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    token,
  });
  return url;
}
