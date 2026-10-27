// Images de la fiche Google Play, tirées du vrai jeu : captures de téléphone 1080 × 1920 (9:16) et image de
// présentation 1024 × 500, en anglais (langue par défaut de la fiche) et en français.
// Usage : `npm run store` (construit le jeu puis écrit store-assets/en/ et store-assets/fr/).
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = 'store-assets';
const PORT = 4175;
const BASE = `http://localhost:${PORT}/`;
const SAVE_KEY = 'casseur-de-forme.save';

/** Parties à photographier : niveau de départ, canon choisi, phase et délai (ms) avant la capture. */
const GAMEPLAY = [
  { name: '1-titan', level: 150, cannon: 'plasma', phase: 'boss', delay: 2500 },
  { name: '2-vagues', level: 57, cannon: 'twin', phase: 'waves', delay: 5000 },
  { name: '3-super-boss', level: 190, cannon: 'storm', phase: 'boss', delay: 2500 },
  { name: '4-boss', level: 226, cannon: 'gatling', phase: 'boss', delay: 3500 },
];
/** Écrans de menu : nom du fichier et bouton à toucher depuis le menu principal (null = le menu lui-même). */
const MENUS = [
  { name: '5-menu', open: null },
  { name: '6-canons', open: 'cannons' },
  { name: '7-mondes', open: 'worlds' },
];

const TAGLINE = { en: 'Slide. Shoot. Shatter.', fr: 'Glisse. Tire. Brise.' };

/** Progression avancée (tout débloqué) et partie en cours au niveau `level`, écrites dans la sauvegarde. */
async function prepare(page, lang, level, cannon) {
  await page.goto(`${BASE}?reset`);
  await page.waitForFunction(() => window.__game?.screen() === 'menu');
  await page.evaluate(
    ({ lang, level, cannon }) => {
      const g = window.__game;
      const m = g.state.meta;
      m.bestLevel = Math.max(level, 230);
      m.highestCleared = m.bestLevel - 1;
      m.diamonds = 2.4e9;
      m.gems = 420;
      for (const k of Object.keys(m.workshop)) m.workshop[k] = k === 'repair' ? 6 : k === 'offline' ? 4 : 20;
      m.stats.runs = 300;
      for (const k of Object.keys(m.abilities)) m.abilities[k] = 3;
      for (const k of Object.keys(m.weapons)) m.weapons[k] = 18;
      m.equipped = ['orbs', 'lightning', 'drones', 'nova'];
      for (const k of Object.keys(m.cannons)) m.cannons[k] = true;
      m.cannon = cannon;
      const run = g.state.run;
      run.level = level;
      run.startLevel = Math.floor((level - 1) / 50) * 50 + 1;
      run.coins = 0;
      for (const k of Object.keys(run.upgrades)) run.upgrades[k] = Math.round(level * 0.6);
      const s = g.settings();
      s.language = lang;
      s.music = 0;
      s.sfx = 0;
    },
    { lang, level, cannon },
  );
  // La sauvegarde est écrite à la fermeture de la page (pagehide) puis relue au chargement.
  await page.reload();
  await page.waitForFunction(() => window.__game?.screen() === 'menu');
  await page.waitForTimeout(400);
}

async function gameplay(page, lang, shot, dir) {
  await prepare(page, lang, shot.level, shot.cannon);
  await page.goto(`${BASE}?autoplay`);
  await page.waitForFunction(() => window.__game?.screen() === 'menu');
  // Ni notifications (succès débloqués) ni consigne de contrôle par-dessus la scène.
  await page.addStyleTag({ content: '.toasts, .control-hint { display: none !important; }' });
  await page.click('.menu-btn.primary');
  // Le canon et le boss restent en vie (à chaque image) : la scène dure le temps de la capture.
  await page.evaluate(() => {
    const keep = () => {
      const run = window.__game.state.run;
      run.cannon.hp = run.cannon.maxHp;
      for (const b of run.bosses) b.hp = Math.max(b.hp, b.maxHp * 0.7);
      requestAnimationFrame(keep);
    };
    keep();
  });
  await page.waitForFunction((phase) => window.__game.state.run.phase === phase, shot.phase, { timeout: 90_000 });
  await page.waitForTimeout(shot.delay);
  await page.screenshot({ path: `${dir}/${shot.name}.png` });
}

async function menu(page, lang, shot, dir) {
  await prepare(page, lang, 1, 'prism');
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
  if (shot.open === 'cannons') await page.click('.menu-btn:has-text("' + (lang === 'fr' ? 'Canons' : 'Cannons') + '")');
  if (shot.open === 'worlds') await page.click('.world-card');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/${shot.name}.png` });
}

/** Image de présentation : titre et icône à gauche, scène du titan (capture du jeu) qui se fond à droite. */
async function feature(browser, lang, dir) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const icon = readFileSync('public/icon.svg', 'utf8');
  const scene = readFileSync(`${dir}/1-titan.png`).toString('base64');
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: #07060f;
      font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }
    .scene { position: absolute; right: -110px; top: -165px; width: 560px; height: 996px;
      background: url(data:image/png;base64,${scene}) center / cover; }
    .fade { position: absolute; inset: 0;
      background: linear-gradient(90deg, #07060f 0%, #07060f 42%, rgba(7,6,15,0.55) 62%, rgba(7,6,15,0) 80%); }
    .glow { position: absolute; left: -160px; top: -140px; width: 760px; height: 760px; border-radius: 50%;
      background: radial-gradient(circle, rgba(107,60,255,0.32), rgba(107,60,255,0) 65%); }
    .brand { position: absolute; left: 64px; top: 0; bottom: 0; display: flex; align-items: center; gap: 34px; }
    .icon { width: 168px; height: 168px; border-radius: 38px; overflow: hidden;
      box-shadow: 0 0 40px rgba(62,230,255,0.35); }
    .icon svg { width: 100%; height: 100%; display: block; }
    h1 { margin: 0; font-size: 76px; line-height: 0.95; font-weight: 900; letter-spacing: 2px; color: #fff;
      text-shadow: 0 0 18px rgba(62,230,255,0.85), 0 0 46px rgba(62,230,255,0.45); }
    h1 span { display: block; color: #ff6bd6; text-shadow: 0 0 18px rgba(255,107,214,0.85), 0 0 46px rgba(255,107,214,0.45); }
    p { margin: 18px 0 0; font-size: 30px; font-weight: 700; letter-spacing: 1px; color: #bfefff; }
  </style></head><body>
    <div class="scene"></div><div class="fade"></div><div class="glow"></div>
    <div class="brand"><div class="icon">${icon}</div>
      <div><h1>PRISMA<span>BLAST</span></h1><p>${TAGLINE[lang]}</p></div></div>
  </body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/presentation-1024x500.png` });
  await page.close();
}

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch();
try {
  for (const lang of ['en', 'fr']) {
    const dir = `${OUT}/${lang}`;
    mkdirSync(dir, { recursive: true });
    // 360 × 640 points à densité 3 : captures de 1080 × 1920 pixels (9:16).
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: lang,
    });
    const page = await context.newPage();
    for (const shot of GAMEPLAY) await gameplay(page, lang, shot, dir);
    for (const shot of MENUS) await menu(page, lang, shot, dir);
    await context.close();
    await feature(browser, lang, dir);
    console.log(`${dir} : ${GAMEPLAY.length + MENUS.length} captures + image de présentation`);
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
