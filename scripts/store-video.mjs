// Vidéo de gameplay (portrait 720 × 1280, environ 30 s, sans son) pour la fiche Google Play (via YouTube),
// TikTok, YouTube Shorts et Instagram Reels : vraies parties du jeu, enchaînées sans rechargement, avec une
// phrase d'accroche par scène et un écran de fin. Une vidéo en anglais et une en français.
// Usage : `npm run store:video` (construit le jeu) → store-assets/promo/video-<langue>.webm.
// Le son n'est pas enregistré : ajouter une musique dans l'éditeur de TikTok / YouTube si besoin.
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';

const PORT = 4176;
const BASE = `http://localhost:${PORT}/`;
const SAVE_KEY = 'casseur-de-forme.save';
const OUT = 'store-assets/promo';

/** Scènes : niveau, canon, phase à montrer, durée (s) et accroche (`|` = retour à la ligne). */
const SCENES = [
  { level: 57, cannon: 'twin', phase: 'waves', seconds: 5,
    text: { en: 'One finger.|Your cannon fires!', fr: 'Un seul doigt.|Ton canon tire seul !' } },
  { level: 57, cannon: 'twin', phase: 'boss', seconds: 5, kill: true,
    text: { en: 'Break the|boss shield', fr: 'Brise le|bouclier du boss' } },
  { level: 150, cannon: 'plasma', phase: 'boss', seconds: 6, kill: true,
    text: { en: 'Shatter|giant titans', fr: 'Brise des|titans géants' } },
  { level: 190, cannon: 'storm', phase: 'boss', seconds: 6,
    text: { en: 'Super bosses|every 10 levels', fr: 'Un super boss|tous les 10 niveaux' } },
];
const END = {
  en: { line: '250 levels · 11 cannons · 5 worlds', cta: 'Play now on Google Play' },
  fr: { line: '250 niveaux · 11 canons · 5 mondes', cta: 'Disponible sur Google Play' },
};

/** Sauvegarde avancée (tout débloqué), préparée hors enregistrement puis injectée avant le chargement. */
async function advancedSave(browser, lang) {
  const page = await browser.newPage();
  await page.goto(`${BASE}?reset`);
  await page.waitForFunction(() => window.__game?.screen() === 'menu');
  await page.evaluate((lang) => {
    const g = window.__game;
    const m = g.state.meta;
    m.bestLevel = 230;
    m.highestCleared = 229;
    m.diamonds = 2.4e9;
    m.gems = 420;
    for (const k of Object.keys(m.workshop)) m.workshop[k] = k === 'repair' ? 6 : k === 'offline' ? 4 : 20;
    for (const k of Object.keys(m.abilities)) m.abilities[k] = 3;
    for (const k of Object.keys(m.weapons)) m.weapons[k] = 18;
    m.equipped = ['orbs', 'lightning', 'drones', 'nova'];
    for (const k of Object.keys(m.cannons)) m.cannons[k] = true;
    m.cannon = 'twin';
    const run = g.state.run;
    run.level = 57;
    run.startLevel = 51;
    for (const k of Object.keys(run.upgrades)) run.upgrades[k] = 34;
    const s = g.settings();
    s.language = lang;
    s.music = 0;
    s.sfx = 0;
  }, lang);
  // La sauvegarde est écrite à la fermeture de la page (pagehide) puis relue au chargement.
  await page.reload();
  await page.waitForFunction(() => window.__game?.screen() === 'menu');
  const save = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  await page.close();
  if (!save) throw new Error('sauvegarde introuvable');
  return save;
}

async function record(browser, lang) {
  const save = await advancedSave(browser, lang);
  const tmp = `${OUT}/.video-${lang}`;
  rmSync(tmp, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: lang,
    recordVideo: { dir: tmp, size: { width: 720, height: 1280 } },
  });
  // Avant tout script du jeu : la sauvegarde avancée et un rideau noir (pas d'écran de chargement filmé).
  await context.addInitScript(([key, data]) => {
    localStorage.setItem(key, data);
    addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div');
      c.id = 'promo-curtain';
      c.style.cssText = 'position:fixed;inset:0;background:#07060f;z-index:99999;pointer-events:none;transition:opacity .45s';
      document.body.appendChild(c);
    });
  }, [SAVE_KEY, save]);
  const page = await context.newPage();
  await page.goto(`${BASE}?autoplay`);
  await page.waitForFunction(() => window.__game?.screen() === 'menu');
  await page.addStyleTag({ content: `
    .toasts, .control-hint { display: none !important; }
    #promo-caption { position: fixed; left: 0; right: 0; top: 47%; z-index: 99998; text-align: center; pointer-events: none;
      font: 900 9.4vw/1.08 system-ui, 'Segoe UI', Roboto, sans-serif; color: #fff; letter-spacing: .5px;
      text-shadow: 0 0 10px #3ee6ff, 0 0 26px #3ee6ff99, 0 2px 4px #000; transition: opacity .3s, transform .3s; }
    #promo-caption span { display: block; color: #ff6bd6; text-shadow: 0 0 10px #ff6bd6, 0 0 26px #ff6bd699, 0 2px 4px #000; }
    #promo-caption.off { opacity: 0; transform: scale(.9); }
    #promo-end { position: fixed; inset: 0; z-index: 99997; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 5vw; background: radial-gradient(circle at 50% 40%, #2a1660, #07060f 70%);
      font-family: system-ui, 'Segoe UI', Roboto, sans-serif; color: #fff; opacity: 0; transition: opacity .5s; }
    #promo-end .icon { width: 36vw; height: 36vw; border-radius: 8vw; overflow: hidden; box-shadow: 0 0 40px #3ee6ff66; }
    #promo-end .icon svg { width: 100%; height: 100%; display: block; }
    #promo-end h1 { margin: 0; font-size: 14vw; font-weight: 900; line-height: .95; text-align: center;
      text-shadow: 0 0 16px #3ee6ffcc; letter-spacing: 1px; }
    #promo-end h1 span { display: block; color: #ff6bd6; text-shadow: 0 0 16px #ff6bd6cc; }
    #promo-end p { margin: 0; font-size: 4.7vw; font-weight: 700; color: #bfefff; }
    #promo-end .cta { margin-top: 3vw; padding: 4vw 7vw; border-radius: 5vw; border: 3px solid #3ee6ff;
      background: #3ee6ff22; font-size: 5.6vw; font-weight: 900; box-shadow: 0 0 24px #3ee6ff55; }
  ` });
  await page.click('.menu-btn.primary');
  await page.waitForFunction(() => window.__game.mode() === 'game');
  // Canon immortel ; boss gardé en vie tant que la scène ne demande pas sa destruction.
  await page.evaluate(() => {
    window.__promo = { protect: true };
    const keep = () => {
      const run = window.__game.state.run;
      run.cannon.hp = run.cannon.maxHp;
      if (window.__promo.protect) for (const b of run.bosses) b.hp = Math.max(b.hp, b.maxHp * 0.7);
      requestAnimationFrame(keep);
    };
    keep();
  });

  const caption = async (text) =>
    page.evaluate((text) => {
      let el = document.getElementById('promo-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'promo-caption';
        document.body.appendChild(el);
      }
      el.classList.add('off');
      if (!text) return;
      const [a, b] = text.split('|');
      el.textContent = a;
      if (b) {
        const s = document.createElement('span');
        s.textContent = b;
        el.appendChild(s);
      }
      requestAnimationFrame(() => el.classList.remove('off'));
    }, text);
  const curtain = (on) => page.evaluate((on) => (document.getElementById('promo-curtain').style.opacity = on ? '1' : '0'), on);

  /** Amène la partie au niveau et à la phase de la scène, en accéléré derrière le rideau ou par une victoire filmée. */
  async function reach(scene) {
    const where = () => page.evaluate(() => { const r = window.__game.state.run; return `niveau ${r.level}, phase ${r.phase}, écran ${window.__game.screen()}, mode ${window.__game.mode()}`; });
    try {
      await reachInner(scene);
    } catch (err) {
      throw new Error(`scène niveau ${scene.level} (${scene.phase}) non atteinte : ${await where()}`, { cause: err });
    }
  }

  async function reachInner(scene) {
    await page.evaluate(({ level, cannon }) => {
      const g = window.__game;
      const run = g.state.run;
      // Améliorations à la hauteur du niveau (comme les captures de la fiche) et canon de la scène.
      for (const k of Object.keys(run.upgrades)) run.upgrades[k] = Math.round(level * 0.6);
      g.selectCannon(cannon);
      g.refreshMaxHp();
      run.cannon.hp = run.cannon.maxHp;
      if (run.level !== level) {
        // Le boss en cours tombe : la victoire fait passer au niveau voulu.
        run.level = level - 1;
        window.__promo.protect = false;
        for (const b of run.bosses) b.hp = Math.min(b.hp, 1);
      }
    }, scene);
    await page.waitForFunction((level) => window.__game.state.run.level === level, scene.level, { timeout: 60_000 });
    await page.evaluate(() => (window.__promo.protect = true));
    if (scene.phase === 'boss') {
      // Vagues écourtées : la dernière vague se termine tout de suite.
      await page.evaluate(() => {
        const w = window.__game.state.run.waves;
        w.index = Math.max(0, w.total - 1);
        w.queue = [];
        w.time = 99;
        for (const e of window.__game.state.run.enemies) if (e.wave >= 0) e.hp = -1;
      });
    }
    await page.waitForFunction((phase) => window.__game.state.run.phase === phase, scene.phase, { timeout: 60_000 });
    await page.waitForTimeout(scene.phase === 'boss' ? 1200 : 1500);
  }

  const first = SCENES[0];
  await reach(first);
  await curtain(false);
  for (const [i, scene] of SCENES.entries()) {
    if (i > 0) {
      const prev = SCENES[i - 1];
      if (prev.kill) {
        // Fin de scène : le boss explose à l'écran, puis fondu au noir pendant la préparation de la suite.
        await caption(null);
        await page.evaluate(() => {
          window.__promo.protect = false;
          for (const b of window.__game.state.run.bosses) b.hp = Math.min(b.hp, 1);
        });
        await page.waitForTimeout(1600);
      }
      // Pas de fondu : le changement de niveau (bannière, vagues écourtées, arrivée du boss) est filmé.
      await caption(null);
      await reach(scene);
    }
    await caption(scene.text[lang]);
    await page.waitForTimeout(scene.seconds * 1000);
  }

  // Écran de fin.
  await caption(null);
  const icon = readFileSync('public/icon.svg', 'utf8');
  await page.evaluate(({ icon, end }) => {
    const el = document.createElement('div');
    el.id = 'promo-end';
    el.innerHTML = `<div class="icon">${icon}</div><h1>PRISMA<span>BLAST</span></h1>`;
    const line = document.createElement('p');
    line.textContent = end.line;
    const cta = document.createElement('div');
    cta.className = 'cta';
    cta.textContent = end.cta;
    el.append(line, cta);
    document.body.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
  }, { icon, end: END[lang] });
  await page.waitForTimeout(3500);

  const video = page.video();
  await context.close();
  const path = await video.path();
  renameSync(path, `${OUT}/video-${lang}.webm`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${OUT}/video-${lang}.webm`);
}

mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch();
try {
  for (const lang of ['en', 'fr']) await record(browser, lang);
} finally {
  await browser.close();
  server.httpServer.close();
}
