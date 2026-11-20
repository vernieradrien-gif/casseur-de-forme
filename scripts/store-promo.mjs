// Visuels « marketing » de la fiche Google Play, dans 6 langues : les vraies captures du jeu (npm run store)
// avec une phrase d'accroche au-dessus, et l'image de présentation 1024 × 500 avec le slogan traduit.
// Le jeu est en anglais et en français : les fiches espagnole, portugaise, allemande et italienne reprennent les
// captures anglaises, avec une accroche dans leur langue.
// Usage : `npm run store:promo` (après `npm run store`) → store-assets/promo/<langue>/.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const RAW = 'store-assets';
const OUT = 'store-assets/promo';

/** Capture brute (dans store-assets/<en|fr>/) et accroche (deux lignes au plus, `|` = retour à la ligne). */
const SHOTS = [
  {
    file: '1-titan',
    text: {
      en: 'Shatter|giant titans',
      fr: 'Brise des|titans géants',
      es: 'Destruye|titanes gigantes',
      pt: 'Destrua|titãs gigantes',
      de: 'Zerstöre|riesige Titanen',
      it: 'Distruggi|titani giganti',
    },
  },
  {
    file: '2-vagues',
    text: {
      en: 'One finger.|Your cannon fires!',
      fr: 'Un seul doigt.|Ton canon tire seul !',
      es: 'Un solo dedo.|¡Tu cañón dispara solo!',
      pt: 'Um dedo só.|Seu canhão atira sozinho!',
      de: 'Ein Finger.|Deine Kanone feuert!',
      it: 'Un solo dito.|Il cannone spara da solo!',
    },
  },
  {
    file: '3-super-boss',
    text: {
      en: 'Super bosses|every 10 levels',
      fr: 'Un super boss|tous les 10 niveaux',
      es: 'Superjefes|cada 10 niveles',
      pt: 'Superchefões|a cada 10 fases',
      de: 'Superbosse|alle 10 Level',
      it: 'Super boss|ogni 10 livelli',
    },
  },
  {
    file: '4-boss',
    text: {
      en: 'Bosses that|fight back',
      fr: 'Des boss qui|ripostent',
      es: 'Jefes que|contraatacan',
      pt: 'Chefões que|contra-atacam',
      de: 'Bosse, die|zurückschlagen',
      it: 'Boss che|contrattaccano',
    },
  },
  {
    file: '5-menu',
    text: {
      en: 'Daily goals|and rewards',
      fr: 'Objectifs du jour|et récompenses',
      es: 'Objetivos diarios|y recompensas',
      pt: 'Objetivos diários|e recompensas',
      de: 'Tägliche Ziele|und Belohnungen',
      it: 'Sfide giornaliere|e ricompense',
    },
  },
  {
    file: '6-canons',
    text: {
      en: '11 cannons|to unlock',
      fr: '11 canons|à débloquer',
      es: '11 cañones|por desbloquear',
      pt: '11 canhões|para desbloquear',
      de: '11 Kanonen|zum Freischalten',
      it: '11 cannoni|da sbloccare',
    },
  },
  {
    file: '7-mondes',
    text: {
      en: '250 levels|in 5 neon worlds',
      fr: '250 niveaux|dans 5 mondes néon',
      es: '250 niveles|en 5 mundos de neón',
      pt: '250 fases|em 5 mundos neon',
      de: '250 Level|in 5 Neon-Welten',
      it: '250 livelli|in 5 mondi al neon',
    },
  },
];

const TAGLINE = {
  en: 'Slide. Shoot. Shatter.',
  fr: 'Glisse. Tire. Brise.',
  es: 'Desliza. Dispara. Destruye.',
  pt: 'Deslize. Atire. Destrua.',
  de: 'Wischen. Schießen. Zerstören.',
  it: 'Scorri. Spara. Distruggi.',
};

const LANGS = Object.keys(TAGLINE);
/** Langue des captures brutes : le jeu n'existe qu'en anglais et en français. */
const rawLang = (lang) => (lang === 'fr' ? 'fr' : 'en');

const png = (path) => 'data:image/png;base64,' + readFileSync(path).toString('base64');
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Capture 1080 × 1920 : accroche en haut, capture du jeu dans un cadre lumineux en dessous. */
function shotHtml(image, text, index) {
  const accents = ['#3ee6ff', '#ff6bd6', '#ffd84a', '#7cff6b', '#b18cff', '#ff9f43', '#3ee6ff'];
  const accent = accents[index % accents.length];
  const [l1, l2] = text.split('|').map(escape);
  return `<!doctype html><html><head><style>
    body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #07060f;
      font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }
    .bg { position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 18%, ${accent}38, transparent 60%),
        radial-gradient(ellipse at 50% 100%, #6b3cff40, transparent 55%), #07060f; }
    h1 { position: absolute; left: 60px; right: 60px; top: 70px; margin: 0; text-align: center;
      font-size: 96px; line-height: 1.05; font-weight: 900; color: #fff; letter-spacing: 1px;
      text-shadow: 0 0 22px ${accent}cc, 0 0 60px ${accent}66; }
    h1 span { display: block; color: ${accent}; }
    .phone { position: absolute; left: 50%; top: 360px; width: 840px; height: 1493px; transform: translateX(-50%);
      border-radius: 56px; overflow: hidden; border: 6px solid ${accent}aa;
      box-shadow: 0 0 60px ${accent}55, 0 30px 80px #000c; background: url(${image}) center / cover; }
  </style></head><body><div class="bg"></div>
    <h1>${l1}${l2 ? `<span>${l2}</span>` : ''}</h1><div class="phone"></div></body></html>`;
}

/** Image de présentation 1024 × 500 : titre, icône, slogan traduit, scène du titan à droite. */
function featureHtml(lang) {
  const icon = readFileSync('public/icon.svg', 'utf8');
  const scene = png(`${RAW}/${rawLang(lang)}/1-titan.png`);
  return `<!doctype html><html><head><style>
    body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: #07060f;
      font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }
    .scene { position: absolute; right: -110px; top: -165px; width: 560px; height: 996px; background: url(${scene}) center / cover; }
    .fade { position: absolute; inset: 0;
      background: linear-gradient(90deg, #07060f 0%, #07060f 42%, rgba(7,6,15,0.55) 62%, rgba(7,6,15,0) 80%); }
    .glow { position: absolute; left: -160px; top: -140px; width: 760px; height: 760px; border-radius: 50%;
      background: radial-gradient(circle, rgba(107,60,255,0.32), rgba(107,60,255,0) 65%); }
    .brand { position: absolute; left: 64px; top: 0; bottom: 0; display: flex; align-items: center; gap: 34px; }
    .icon { width: 168px; height: 168px; border-radius: 38px; overflow: hidden; box-shadow: 0 0 40px rgba(62,230,255,0.35); }
    .icon svg { width: 100%; height: 100%; display: block; }
    h1 { margin: 0; font-size: 76px; line-height: 0.95; font-weight: 900; letter-spacing: 2px; color: #fff;
      text-shadow: 0 0 18px rgba(62,230,255,0.85), 0 0 46px rgba(62,230,255,0.45); }
    h1 span { display: block; color: #ff6bd6; text-shadow: 0 0 18px rgba(255,107,214,0.85), 0 0 46px rgba(255,107,214,0.45); }
    p { margin: 18px 0 0; font-size: 28px; font-weight: 700; letter-spacing: 1px; color: #bfefff; white-space: nowrap; }
  </style></head><body>
    <div class="scene"></div><div class="fade"></div><div class="glow"></div>
    <div class="brand"><div class="icon">${icon}</div>
      <div><h1>PRISMA<span>BLAST</span></h1><p>${escape(TAGLINE[lang])}</p></div></div>
  </body></html>`;
}

for (const lang of ['en', 'fr']) {
  if (!existsSync(`${RAW}/${lang}/1-titan.png`)) throw new Error(`Captures absentes : lancer d'abord « npm run store ».`);
}

const browser = await chromium.launch();
try {
  for (const lang of LANGS) {
    const dir = `${OUT}/${lang}`;
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    for (const [i, shot] of SHOTS.entries()) {
      await page.setContent(shotHtml(png(`${RAW}/${rawLang(lang)}/${shot.file}.png`), shot.text[lang], i));
      // L'accroche doit tenir sur deux lignes : sinon la police est réduite jusqu'à ce qu'elle tienne.
      await page.evaluate(() => {
        const h = document.querySelector('h1');
        let size = 96;
        while (h.getBoundingClientRect().height > 230 && size > 60) h.style.fontSize = `${(size -= 4)}px`;
      });
      await page.screenshot({ path: `${dir}/${i + 1}-${shot.file.replace(/^\d-/, '')}.png` });
    }
    await page.close();
    const feature = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    await feature.setContent(featureHtml(lang));
    await feature.waitForTimeout(200);
    await feature.screenshot({ path: `${dir}/presentation-1024x500.png` });
    await feature.close();
    console.log(`${dir} : ${SHOTS.length} captures avec accroche + image de présentation`);
  }
} finally {
  await browser.close();
}
