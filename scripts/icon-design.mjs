// Dessin de l'icône de Prisma Blast, décrit une seule fois puis écrit en deux formats :
// public/icon.svg (web, PWA, PNG générés par make-icons.mjs) et l'icône adaptative Android (vecteurs).
// Usage : node scripts/icon-design.mjs && node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Grille de 108 × 108 (celle des icônes adaptatives Android) ; l'essentiel tient dans un cercle de rayon 32 autour du centre.
const triangle = (pts) => `M${pts.map((p) => p.join(',')).join(' L')} Z`;
const circle = (cx, cy, r) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;

/** Formes de premier plan, de l'arrière vers l'avant. */
const shapes = [
  // Halo violet derrière le prisme.
  { d: circle(54, 47, 27), fill: '#6B3CFF', fillAlpha: 0.16 },
  { d: circle(54, 47, 19), fill: '#B18CFF', fillAlpha: 0.12 },
  // Rayon du canon, venu d'en bas, qui frappe la base du prisme.
  { d: 'M50.6,63 h6.8 v45 h-6.8 z', fill: '#3EE6FF', fillAlpha: 0.3 },
  { d: 'M52.4,63 h3.2 v45 h-3.2 z', fill: '#FFFFFF' },
  // Le prisme : remplissage léger, contour cyan, facettes magenta.
  { d: triangle([[54, 21], [79, 63], [29, 63]]), fill: '#3EE6FF', fillAlpha: 0.12, stroke: '#3EE6FF', strokeAlpha: 0.35, width: 6 },
  { d: triangle([[54, 21], [79, 63], [29, 63]]), stroke: '#3EE6FF', width: 3 },
  { d: triangle([[54, 33], [69, 58], [39, 58]]), stroke: '#FF6BD6', width: 1.6 },
  // Fêlure partie du point d'impact.
  { d: 'M54,63 L51.5,53 L56.5,45 L52.5,36', stroke: '#FFFFFF', width: 1.4 },
  // Éclair d'impact.
  { d: circle(54, 63, 7), fill: '#FFFFFF', fillAlpha: 0.3 },
  { d: circle(54, 63, 3.6), fill: '#FFFFFF' },
  // Éclats aux couleurs de l'arc-en-ciel.
  { d: triangle([[30, 35], [35, 32], [34, 39]]), fill: '#FF5A5A' },
  { d: triangle([[25, 49], [31, 47], [29, 53]]), fill: '#FFB347' },
  { d: triangle([[77, 47], [83, 49], [78, 53]]), fill: '#FFE066' },
  { d: triangle([[72, 34], [77, 32], [76, 38]]), fill: '#7CFF6B' },
  { d: triangle([[62, 26], [67, 24], [66, 29]]), fill: '#3EE6FF' },
  { d: triangle([[41, 26], [46, 24], [44, 29]]), fill: '#B18CFF' },
];


// ---- SVG (web) : fond en dégradé + formes, avec un léger halo lumineux.
const svgShapes = shapes
  .map((s) => {
    const attrs = [`d="${s.d}"`];
    attrs.push(s.fill ? `fill="${s.fill}"` : 'fill="none"');
    if (s.fill && s.fillAlpha !== undefined) attrs.push(`fill-opacity="${s.fillAlpha}"`);
    if (s.stroke) {
      attrs.push(`stroke="${s.stroke}"`, `stroke-width="${s.width}"`, 'stroke-linejoin="round"', 'stroke-linecap="round"');
      if (s.strokeAlpha !== undefined) attrs.push(`stroke-opacity="${s.strokeAlpha}"`);
    }
    return `    <path ${attrs.join(' ')} />`;
  })
  .join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <!-- Icône de Prisma Blast, tracée en code (scripts/icon-design.mjs) : un prisme néon brisé par le rayon du canon. -->
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="#22104A" />
      <stop offset="1" stop-color="#07060F" />
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.6" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="108" height="108" fill="url(#bg)" />
  <g filter="url(#glow)">
${svgShapes}
  </g>
</svg>
`;
writeFileSync(join(root, 'public/icon.svg'), svg);

// ---- Android : premier plan (vecteur) et fond (dégradé radial).
const vectorShapes = shapes
  .map((s) => {
    const attrs = [`android:pathData="${s.d}"`];
    attrs.push(`android:fillColor="${s.fill ? hexArgb(s.fill, s.fillAlpha ?? 1) : '#00000000'}"`);
    if (s.stroke) {
      attrs.push(`android:strokeColor="${hexArgb(s.stroke, s.strokeAlpha ?? 1)}"`, `android:strokeWidth="${s.width}"`, 'android:strokeLineJoin="round"', 'android:strokeLineCap="round"');
    }
    return `    <path\n        ${attrs.join('\n        ')} />`;
  })
  .join('\n');
function hexArgb(hex, a) {
  return `#${Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase()}${hex.slice(1).toUpperCase()}`;
}
const foreground = `<?xml version="1.0" encoding="utf-8"?>
<!-- Icône de Prisma Blast (générée par scripts/icon-design.mjs, même dessin que public/icon.svg). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${vectorShapes}
</vector>
`;
writeFileSync(join(root, 'android/app/src/main/res/drawable/ic_launcher_foreground.xml'), foreground);

const background = `<?xml version="1.0" encoding="utf-8"?>
<!-- Fond de l'icône : nuit violette (générée par scripts/icon-design.mjs). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:centerX="54"
                android:centerY="43"
                android:gradientRadius="80"
                android:type="radial">
                <item android:color="#FF22104A" android:offset="0" />
                <item android:color="#FF07060F" android:offset="1" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`;
writeFileSync(join(root, 'android/app/src/main/res/drawable/ic_launcher_background.xml'), background);
console.log('icône écrite : public/icon.svg, ic_launcher_foreground.xml, ic_launcher_background.xml');
