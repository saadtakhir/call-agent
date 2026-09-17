import huduData from "./data/hudud.json";
import { cyrillicToLatinUzCaption } from "./translit.js";

// The same Hudud.json uploaded to the ElevenLabs agent's knowledge base
// (region/district hierarchy in Cyrillic, ~14 regions + ~209 districts) —
// kept here too so the call widget's own STT correction pass (see
// correctPlaceNames below) can draw on the exact same real names instead of
// a short hand-picked list. Only every region's own name and each of its
// districts is used; both levels are flat lists (no deeper nesting in this
// file), transliterated once at module load to the same Latin orthography
// used everywhere else in the app (lib/translit.js).
export const REGION_NAMES = huduData.map((r) => cyrillicToLatinUzCaption(r.name));

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}'’ ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// parentId is null for a top-level region/respublika entry, or that
// region's own id for one of its districts/cities — used by resolveRegionIds
// to drop a redundant parent when one of its own children is also present.
const PLACE_NAMES = [];
for (const region of huduData) {
  const latin = cyrillicToLatinUzCaption(region.name);
  PLACE_NAMES.push({ id: region.id, parentId: null, latin, norm: normalize(latin) });
  for (const district of region.district || []) {
    const districtLatin = cyrillicToLatinUzCaption(district.name);
    PLACE_NAMES.push({ id: district.id, parentId: region.id, latin: districtLatin, norm: normalize(districtLatin) });
  }
}
const PLACE_BY_ID = new Map(PLACE_NAMES.map((p) => [p.id, p]));

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Resolves a comma-separated string of region/district REFERENCES — each
 * segment either a real uy-joy.uz numeric id (the ElevenLabs agent's own
 * contract, since it resolves names to ids itself from this same data
 * loaded into its knowledge base) or a plain name (for callers like an n8n
 * workflow, which has no equivalent knowledge-base mechanism and would
 * otherwise need the LLM to memorize/guess numeric ids — exactly the kind
 * of internal detail that shouldn't depend on prompt discipline) — into the
 * numeric ids uy-joy.uz's catalog search expects. A name segment is
 * fuzzy-matched the same way correctPlaceNames is, so minor
 * mis-transcription/typos still resolve. Segments that don't confidently
 * match anything are dropped rather than rejecting the whole call.
 *
 * A viloyat id is dropped whenever one of its OWN districts/cities is also
 * present — e.g. "Xorazm viloyati, Shovot tumani" resolves to just [23]
 * (Shovot), not [1, 23], since sending both is redundant (Shovot is already
 * inside Xorazm) and only makes the search look broader than it is. Two
 * districts/cities at the same level (e.g. "Urganch tumani, Urganch
 * shahri") are NOT related this way and both survive, per the user's own
 * examples — this is enforced here rather than relied on from the calling
 * agent's prompt, same reasoning as everything else in this file. */
export function resolveRegionIds(raw) {
  if (!raw) return [];
  const segments = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ids = [];
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      ids.push(Number(segment));
      continue;
    }

    const norm = normalize(segment);
    if (!norm) continue;

    let best = null;
    for (const place of PLACE_NAMES) {
      const sim = similarity(norm, place.norm);
      if (!best || sim > best.sim) best = { sim, place };
    }
    if (best && best.sim >= 0.6) ids.push(best.place.id);
  }

  const idSet = new Set(ids.filter((n) => Number.isInteger(n) && n > 0));
  for (const id of idSet) {
    const isRegion = PLACE_BY_ID.get(id)?.parentId === null;
    const hasOwnChildToo = isRegion && [...idSet].some((otherId) => otherId !== id && PLACE_BY_ID.get(otherId)?.parentId === id);
    if (hasOwnChildToo) idSet.delete(id);
  }
  return [...idSet];
}

/** Fuzzy-corrects region/district names in a transcript against the real
 * Hudud.json list (209 districts + 14 regions is far more than Whisper's
 * `prompt` hint could ever fit, so this catches the rest). Only replaces a
 * 1-2 word window when it's a near-exact match to a real place name — a
 * high similarity threshold (stricter for 1-word windows, which are more
 * likely to coincidentally resemble ordinary words) keeps this from
 * mangling unrelated speech. Longer (2-word) windows are tried first so an
 * already-correct two-word name isn't fragmented into a wrong single-word
 * replacement. */
export function correctPlaceNames(text) {
  if (!text) return text;
  const tokens = text.split(/(\s+)/);
  const wordIndices = [];
  tokens.forEach((t, i) => {
    if (t.trim()) wordIndices.push(i);
  });

  const consumed = new Set();
  for (let winSize = 2; winSize >= 1; winSize--) {
    const threshold = winSize === 1 ? 0.86 : 0.72;
    for (let start = 0; start <= wordIndices.length - winSize; start++) {
      const idxs = wordIndices.slice(start, start + winSize);
      if (idxs.some((i) => consumed.has(i))) continue;

      const candidateNorm = normalize(idxs.map((i) => tokens[i]).join(" "));
      if (!candidateNorm) continue;

      let best = null;
      for (const place of PLACE_NAMES) {
        const sim = similarity(candidateNorm, place.norm);
        if (!best || sim > best.sim) best = { sim, place };
      }

      if (best && best.sim >= threshold && best.place.norm !== candidateNorm) {
        let replacement = best.place.latin;
        // Uzbek is agglutinative — "Qo'qon shahrida" (locative case) is
        // already correct, just carrying a case suffix the bare canonical
        // name doesn't have. When the candidate is literally the canonical
        // name plus a short trailing suffix (not a different word — that
        // case falls through to the plain replacement below), keep the
        // suffix instead of silently dropping the grammar.
        if (candidateNorm.startsWith(best.place.norm)) {
          const suffix = candidateNorm.slice(best.place.norm.length);
          if (suffix.length <= 6) replacement += suffix;
        }
        tokens[idxs[0]] = replacement;
        for (let k = 1; k < idxs.length; k++) tokens[idxs[k]] = "";
        idxs.forEach((i) => consumed.add(i));
      }
    }
  }
  return tokens.join("").replace(/\s+/g, " ").trim();
}
