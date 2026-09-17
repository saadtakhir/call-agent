// One-off generator for the PWA's placeholder icons — plain solid-color
// squares in the brand accent color (see --accent in app/globals.css),
// built by hand (raw PNG chunks) so no image-processing dependency is
// needed just for this. Replace public/icons/*.png with a real logo
// whenever one exists; re-run with `node scripts/generate-icons.mjs` to
// regenerate at the sizes below in the meantime.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const ACCENT_RGB = [0x5b, 0x5f, 0xf5]; // --accent: #5b5ff5
const SIZES = [192, 512];
const OUT_DIR = new URL("../public/icons/", import.meta.url);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** A solid-color square with the four corners inset (transparent), giving
 * a plain rounded-square icon instead of a hard-edged block — RGBA so the
 * corner cutout can actually be transparent. */
function buildPng(size, [r, g, b], radius = Math.round(size * 0.22)) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const inCorner =
        (x < radius && y < radius && (radius - x) ** 2 + (radius - y) ** 2 > radius ** 2) ||
        (x >= size - radius && y < radius && (x - (size - radius - 1)) ** 2 + (radius - y) ** 2 > radius ** 2) ||
        (x < radius && y >= size - radius && (radius - x) ** 2 + (y - (size - radius - 1)) ** 2 > radius ** 2) ||
        (x >= size - radius &&
          y >= size - radius &&
          (x - (size - radius - 1)) ** 2 + (y - (size - radius - 1)) ** 2 > radius ** 2);
      const o = 1 + x * 4;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = inCorner ? 0 : 255;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const idat = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync(OUT_DIR, { recursive: true });
let icon192;
for (const size of SIZES) {
  const png = buildPng(size, ACCENT_RGB);
  if (size === 192) icon192 = png;
  writeFileSync(new URL(`icon-${size}.png`, OUT_DIR), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}

// Next.js's app/icon.png file convention — picked up automatically for the
// browser tab favicon, no manual <link> tag needed.
writeFileSync(new URL("../../app/icon.png", OUT_DIR), icon192);
console.log("wrote app/icon.png");

// Maskable variant — edge-to-edge, no rounded corners, since Android
// applies its own mask shape on top and a built-in inset would just get
// cropped twice.
const maskable = buildPng(512, ACCENT_RGB, 0);
writeFileSync(new URL("icon-maskable-512.png", OUT_DIR), maskable);
console.log(`wrote icon-maskable-512.png (${maskable.length} bytes)`);

// iOS's home-screen icon, same reasoning as the maskable one above — iOS
// applies its own corner rounding, so this stays a plain opaque square
// rather than pre-rounding it. Written straight into app/ so Next.js's
// app/apple-icon.png file convention picks it up automatically.
const appleIcon = buildPng(180, ACCENT_RGB, 0);
writeFileSync(new URL("../../app/apple-icon.png", OUT_DIR), appleIcon);
console.log(`wrote app/apple-icon.png (${appleIcon.length} bytes)`);
