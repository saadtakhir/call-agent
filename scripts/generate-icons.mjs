// Builds all the PWA/favicon icon files from one square source logo image.
// Usage: node scripts/generate-icons.mjs <path-to-logo>
//
// The source is expected to look like e-rieltor.uz's actual logo artwork:
// a mark near the top-center with a wordmark below it, on a plain light
// background — this crops out just the mark (a wordmark is illegible at
// favicon sizes anyway) by auto-detecting where it sits, rather than
// hardcoding pixel coordinates that would only be right for one specific
// export of the logo.
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("Usage: node scripts/generate-icons.mjs <path-to-logo>");
  process.exit(1);
}

const WORK_SIZE = 1024; // square working resolution for bbox detection math
const OUT_DIR = new URL("../public/icons/", import.meta.url);
const APP_DIR = new URL("../app/", import.meta.url);

function colorDistance(r, g, b, bg) {
  return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
}

/** Finds the mark's bounding box: the background color is sampled from a
 * corner pixel, then the first contiguous band of rows (from the top) that
 * differs enough from it is taken as the mark — small gaps inside a band
 * (thin strokes, anti-aliasing) are bridged so it isn't split into several
 * pieces. Whatever comes after that first band (a wordmark, tagline, ...)
 * is ignored. */
async function detectMarkBox(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(WORK_SIZE, WORK_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const bgIdx = (5 * width + 5) * channels;
  const bg = [data[bgIdx], data[bgIdx + 1], data[bgIdx + 2]];

  const rowHasContent = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (colorDistance(data[idx], data[idx + 1], data[idx + 2], bg) > 40) count++;
    }
    rowHasContent[y] = count > 3;
  }

  const GAP_BRIDGE = 20;
  let markStart = null;
  let markEnd = null;
  let gapRun = 0;
  for (let y = 0; y < height; y++) {
    if (rowHasContent[y]) {
      if (markStart === null) markStart = y;
      markEnd = y;
      gapRun = 0;
    } else if (markStart !== null) {
      gapRun++;
      if (gapRun > GAP_BRIDGE) break; // real gap after the mark — stop here
    }
  }

  let minX = width;
  let maxX = 0;
  for (let y = markStart; y <= markEnd; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (colorDistance(data[idx], data[idx + 1], data[idx + 2], bg) > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  const scaleX = width / WORK_SIZE;
  const scaleY = height / WORK_SIZE;
  return {
    x: minX / scaleX,
    y: markStart / scaleY,
    width: (maxX - minX) / scaleX,
    height: (markEnd - markStart) / scaleY,
    bg,
  };
}

/** Crops tight to the mark's bbox, then pads it out to a square with the
 * given padding factor (1.5 = the mark's longest side becomes 2/3 of the
 * final square) using solid-color borders — simpler and more robust than
 * cropping a pre-padded square directly, since extend() never needs source
 * pixels beyond the image's own edges the way an oversized extract would. */
async function renderIcon(sourceBuffer, box, paddingFactor, size, bg) {
  const cropped = await sharp(sourceBuffer)
    .extract({ left: Math.round(box.x), top: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) })
    .toBuffer();

  const side = Math.round(Math.max(box.width, box.height) * paddingFactor);
  const hPad = side - Math.round(box.width);
  const vPad = side - Math.round(box.height);
  const left = Math.floor(hPad / 2);
  const right = hPad - left;
  const top = Math.floor(vPad / 2);
  const bottom = vPad - top;

  return sharp(cropped)
    .extend({ top, bottom, left, right, background: { r: bg[0], g: bg[1], b: bg[2] } })
    .resize(size, size)
    .png()
    .toBuffer();
}

async function main() {
  const sourceBuffer = await sharp(SOURCE).toBuffer();
  const box = await detectMarkBox(sourceBuffer);
  console.log("detected mark box:", box);

  mkdirSync(OUT_DIR, { recursive: true });

  const icon192 = await renderIcon(sourceBuffer, box, 1.5, 192, box.bg);
  writeFileSync(new URL("icon-192.png", OUT_DIR), icon192);
  writeFileSync(new URL("icon.png", APP_DIR), icon192);
  console.log("wrote icon-192.png / app/icon.png");

  const icon512 = await renderIcon(sourceBuffer, box, 1.5, 512, box.bg);
  writeFileSync(new URL("icon-512.png", OUT_DIR), icon512);
  console.log("wrote icon-512.png");

  // Maskable — extra padding so Android's own mask shape (circle, squircle,
  // ...) doesn't clip the mark's corners.
  const maskable = await renderIcon(sourceBuffer, box, 2.2, 512, box.bg);
  writeFileSync(new URL("icon-maskable-512.png", OUT_DIR), maskable);
  console.log("wrote icon-maskable-512.png");

  const appleIcon = await renderIcon(sourceBuffer, box, 1.6, 180, box.bg);
  writeFileSync(new URL("apple-icon.png", APP_DIR), appleIcon);
  console.log("wrote app/apple-icon.png");
}

main();
