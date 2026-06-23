// Erzeugt die PWA-Icons aus EINER SVG-Quelle (Level-up-Chevrons auf Indigo-Squircle).
// Rendert die PNGs mit @resvg/resvg-js, damit Favicon und App-Icons identisch aussehen.
//
// Aufruf:  node scripts/gen-icons.mjs   (bzw. npm run gen:icons)

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const iconsDir = join(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

// --- Markenzeichen: zwei nach oben zeigende Chevrons (Level-up) ----------------
const MARK = `
    <g fill="none" stroke="#ffffff" stroke-width="54" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="170,248 256,176 342,248" />
      <polyline points="170,330 256,258 342,330" />
    </g>`;

/**
 * @param {object} opts
 * @param {boolean} opts.rounded  Abgerundeter Squircle (true) oder randvolles Quadrat (false, für maskable/apple).
 * @param {boolean} opts.sheen    Dezenter Lichtschein oben links.
 */
function buildSvg({ rounded = true, sheen = true } = {}) {
  const rx = rounded ? 116 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#818cf8" />
      <stop offset="1" stop-color="#4338ca" />
    </linearGradient>
    <radialGradient id="sheen" cx="0.3" cy="0.2" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22" />
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)" />${
    sheen ? `\n  <rect width="512" height="512" rx="${rx}" fill="url(#sheen)" />` : ''
  }${MARK}
</svg>`;
}

function renderPng(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  return resvg.render().asPng();
}

// Favicon (vektoriell, abgerundet) ---------------------------------------------
const faviconSvg = buildSvg({ rounded: true, sheen: true });
writeFileSync(join(publicDir, 'favicon.svg'), faviconSvg);
console.log('✓ favicon.svg');

// PNGs -------------------------------------------------------------------------
const targets = [
  // [Dateiname, Größe, randvolles Quadrat?]
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true], // randvoll: Launcher-Maske beschneidet die Ecken
  ['apple-touch-icon.png', 180, true], // iOS mag keine Transparenz -> volles Quadrat
];

for (const [name, size, fullBleed] of targets) {
  const svg = buildSvg({ rounded: !fullBleed, sheen: true });
  const png = renderPng(svg, size);
  writeFileSync(join(iconsDir, name), png);
  console.log(`✓ icons/${name} (${size}x${size}, ${png.length} bytes)`);
}

console.log('Fertig: Icons aus SVG gerendert.');
