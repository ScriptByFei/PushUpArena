// Erzeugt Platzhalter-PNG-Icons für die PWA – ohne externe Abhängigkeiten.
// Reiner PNG-Encoder (RGBA, Filter 0) mit zlib-Deflate + manuellem CRC32.
//
// Aufruf:  node scripts/gen-icons.mjs
//
// Die erzeugten Icons sind bewusst schlichte Platzhalter (Indigo-Verlauf + Hantel).
// Ersetze sie für die Produktion durch echte Markenicons.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---- CRC32 ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// ---- Pixel-Funktion: Indigo-Diagonalverlauf + helle Hantel ----
function color(x, y, size) {
  const t = (x + y) / (2 * size); // 0..1 diagonal
  // Verlauf von #818cf8 (129,140,248) nach #4f46e5 (79,70,229)
  let r = Math.round(129 + (79 - 129) * t);
  let g = Math.round(140 + (70 - 140) * t);
  let b = Math.round(248 + (229 - 248) * t);

  // Hantel-Silhouette (weiß), grob mittig
  const cx = size / 2;
  const cy = size / 2;
  const u = (x - cx) / size; // -0.5..0.5
  const v = (y - cy) / size;
  const bar = Math.abs(v) < 0.045 && Math.abs(u) < 0.16;
  const wL = Math.abs(u + 0.2) < 0.05 && Math.abs(v) < 0.14;
  const wR = Math.abs(u - 0.2) < 0.05 && Math.abs(v) < 0.14;
  const wL2 = Math.abs(u + 0.28) < 0.035 && Math.abs(v) < 0.09;
  const wR2 = Math.abs(u - 0.28) < 0.035 && Math.abs(v) < 0.09;
  if (bar || wL || wR || wL2 || wR2) {
    r = 255;
    g = 255;
    b = 255;
  }
  return [r, g, b, 255];
}

function makePng(size, { background = true } = {}) {
  // Raw-Bilddaten: pro Zeile 1 Filter-Byte (0) + size*4 Bytes RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // Filter: None
    for (let x = 0; x < size; x++) {
      let [r, g, b, a] = color(x, y, size);
      if (!background) {
        // maskable: Hintergrund deckend lassen (Safe-Zone), hier identisch
      }
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  const png = makePng(size, { background: name.startsWith('maskable') });
  writeFileSync(join(outDir, name), png);
  console.log(`✓ ${name} (${size}x${size}, ${png.length} bytes)`);
}

console.log('Platzhalter-Icons erzeugt in public/icons/.');
