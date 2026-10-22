// Génère les icônes PNG (PWA et Android) à partir de l'icône tracée en code `public/icon.svg`.
// Usage : node scripts/make-icons.mjs   (nécessite Playwright : npx playwright install chromium)
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8');

/** Page HTML affichant l'icône à la taille voulue ; `scale` réduit le dessin (icônes « maskable »), `round` la découpe en cercle. */
function page(size, { scale = 1, round = false } = {}) {
  const inner = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;overflow:hidden;background:#07070f;${round ? 'border-radius:50%;' : ''}">
      <div style="transform:scale(${scale});transform-origin:50% 50%">${inner}</div>
    </div></body></html>`;
}

const outputs = [
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/icon-maskable-512.png', size: 512, scale: 0.8 },
];

const res = join(root, 'android/app/src/main/res');
if (existsSync(res)) {
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, size] of Object.entries(densities)) {
    outputs.push({ file: `android/app/src/main/res/mipmap-${d}/ic_launcher.png`, size });
    outputs.push({ file: `android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, size, round: true });
  }
}

const browser = await chromium.launch();
const p = await browser.newPage({ deviceScaleFactor: 1 });
for (const o of outputs) {
  await p.setViewportSize({ width: o.size, height: o.size });
  await p.setContent(page(o.size, o));
  const out = join(root, o.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: o.size, height: o.size } }));
  console.log('icône', o.file);
}
await browser.close();
