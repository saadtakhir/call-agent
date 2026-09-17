const MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e",
  ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "ğ", ҳ: "h",
};

const VOWELS = new Set(["а", "о", "у", "и", "е", "ё", "э", "ю", "я", "ў"]);

function applyCase(latin, isUpper) {
  if (!isUpper || !latin) return latin;
  if (latin.length <= 1) return latin.toUpperCase();
  return latin[0].toUpperCase() + latin.slice(1);
}

/** Transliterates standard Uzbek Cyrillic text to the official Latin alphabet
 * (o', ğ, q, x, h ...), matching how e-rieltor's Latin narration scripts read. */
export function cyrillicToLatinUz(input) {
  if (!input) return input;
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const lower = ch.toLowerCase();
    const isUpper = ch !== lower && ch === ch.toUpperCase();

    if (lower === "е") {
      const prev = i > 0 ? input[i - 1].toLowerCase() : null;
      const startOfWord = prev === null || !/[a-zа-яʼ'’-]/i.test(prev);
      const afterVowel = !!prev && VOWELS.has(prev);
      const latin = startOfWord || afterVowel ? "ye" : "e";
      result += applyCase(latin, isUpper);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(MAP, lower)) {
      result += applyCase(MAP[lower], isUpper);
    } else {
      result += ch;
    }
  }
  return result;
}

/** Same as cyrillicToLatinUz, but for captions/text display only — "ğ" (used
 * for ғ in narration/audio text) is written the standard way, "g'", instead. */
export function cyrillicToLatinUzCaption(input) {
  return cyrillicToLatinUz(input).replace(/ğ/g, "g'").replace(/Ğ/g, "G'");
}
