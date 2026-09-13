// Generates PWA PNG icons at build time so no binaries live in the repo.
// Pure Node: hand-rolled PNG encoder (RGBA, zlib) drawing a simple "passport" glyph.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [11, 16, 12];
const RING = [118, 185, 0];
const CARD = [7, 18, 8];
const TEXT = [215, 245, 184];

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Glyph: dark background, rounded "card" with a green status ring and three ledger lines.
function draw(size) {
  const s = size;
  const inRoundedRect = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.max(x0 + r, Math.min(x, x1 - r));
    const cy = Math.max(y0 + r, Math.min(y, y1 - r));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  return (x, y) => {
    const cardPad = s * 0.16;
    if (!inRoundedRect(x, y, cardPad, cardPad, s - cardPad, s - cardPad, s * 0.1)) return BG;
    const cx = s * 0.36, cy = s * 0.42, rOuter = s * 0.13, rInner = s * 0.085;
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 <= rOuter ** 2 && d2 >= rInner ** 2) return RING;
    if (d2 < rInner ** 2) return CARD;
    const lineX0 = s * 0.54, lineX1 = s * 0.76, lh = s * 0.035;
    const lines = [s * 0.36, s * 0.45];
    for (const ly of lines) {
      if (x >= lineX0 && x <= lineX1 && y >= ly && y <= ly + lh) return TEXT;
    }
    const b0 = s * 0.6, b1 = s * 0.76;
    if (x >= cardPad + s * 0.08 && x <= s - cardPad - s * 0.08 && y >= b0 && y <= b0 + lh) return TEXT;
    if (x >= cardPad + s * 0.08 && x <= s * 0.6 && y >= b1 - lh * 2 && y <= b1 - lh) return RING;
    return CARD;
  };
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(join(outDir, name), png(size, draw(size)));
  console.log(`wrote public/icons/${name}`);
}
