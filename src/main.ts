import './style.css';
import pkg from '../package.json';
import visual from './config/visual.json';
import { createAds } from './ads';
import type { AdService, RewardPlacement } from './ads';
import { AudioEngine } from './audio/engine';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import {
  activateBoost,
  buyAbility,
  buyRunUpgrade,
  buyWeapon,
  buyWorkshop,
  continueRun,
  doubleRunDiamonds,
  startRun,
  toggleEquip,
  useAbility,
} from './game/actions';
import { formatNumber } from './game/bignum';
import { isFighting } from './game/cannon';
import { ACHIEVEMENTS, BALANCE } from './game/config';
import type { GameEvent } from './game/events';
import { offlineDiamonds, worldOf } from './game/formulas';
import { polygonVertices } from './game/geometry';
import { startLoop } from './game/loop';
import { checkAchievements, rollDaily } from './game/progress';
import { AutoPlayer, spendCoins } from './game/autoplayer';
import { STEP, step } from './game/simulation';
import { W } from './game/state';
import { setLanguage, t } from './i18n';
import { isNative, setupPlatform } from './platform';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';
import { enemyColor, enemyVertices, tierColor, tierVertices } from './render/shapes';
import { clearSave, exportCode, importCode, loadGame, saveGame } from './storage/save';
import type { Settings } from './storage/save';
import { setClickSound } from './ui/dom';
import { Hud } from './ui/hud';
import { TouchInput } from './ui/input';
import { Screens } from './ui/screens';
import { Toasts } from './ui/toast';

const VERSION = pkg.version;
const AUTOSAVE_INTERVAL_MS = 10_000;
const PRIVACY_URL = 'https://vernieradrien-gif.github.io/casseur-de-forme/privacy.html';
const SESSION_START = Date.now();
/** "?autoplay" : un joueur automatique contrôle le canon (démonstration, tests de bout en bout). */
const AUTOPLAY = new URLSearchParams(location.search).has('autoplay') ? new AutoPlayer() : null;

// « ?reset » dans l'adresse efface la sauvegarde (pratique pour tester).
if (new URLSearchParams(location.search).has('reset')) {
  clearSave();
  const params = new URLSearchParams(location.search);
  params.delete('reset');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
}

const loaded = loadGame();
const state = loaded.state;
let settings = loaded.settings;
let extra = loaded.extra;
setLanguage(settings.language);
document.title = t('title');

let mode: 'menu' | 'game' = 'menu';
let hidden = document.hidden;
let hiddenAt = 0;
let offline = { seconds: 0, diamonds: 0 };
let ads: AdService | null = null;
let adBusy = false;

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
app.appendChild(canvas);

const audio = new AudioEngine();
const music = new Music(audio);
const sfx = new Sfx(audio);
audio.setVolumes(settings.music, settings.sfx);
setClickSound(() => sfx.play('click'));

const effects = new Effects();
const renderer = new Renderer(canvas);
const events: GameEvent[] = [];
const toasts = new Toasts(app);

const save = () => saveGame(state, settings, extra);

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function vibrate(ms: number | number[]): void {
  if (settings.vibration) navigator.vibrate?.(ms);
}

// ------------------------------------------------------------ Publicités

async function rewarded(placement: RewardPlacement): Promise<boolean> {
  if (adBusy) return false;
  adBusy = true;
  try {
    ads ??= await createAds(isNative);
    audio.suspend();
    const ok = await ads.showRewarded(placement);
    if (!ok) toasts.show(t('toast.adUnavailable'));
    return ok;
  } finally {
    audio.resume();
    adBusy = false;
  }
}

/** Interstitiel rare : au plus toutes les 4 min, après 3 min de session, au retour au menu après une défaite. */
function maybeInterstitial(): void {
  const now = Date.now();
  const cfg = BALANCE.ads;
  if (now - SESSION_START < cfg.interstitialMinSessionMinutes * 60_000) return;
  if (now - extra.lastInterstitialAt < cfg.interstitialMinGapMinutes * 60_000) return;
  extra.lastInterstitialAt = now;
  void (async () => {
    ads ??= await createAds(isNative);
    audio.suspend();
    await ads.showInterstitial();
    audio.resume();
  })();
}

// ------------------------------------------------------------ Navigation

function layout(): void {
  if (mode === 'game') {
    renderer.resize({ top: hud.topBar.getBoundingClientRect().bottom + 4, bottom: hud.panel.getBoundingClientRect().top });
  } else {
    renderer.resize({ top: 0, bottom: window.innerHeight });
  }
}

function setMode(m: 'menu' | 'game'): void {
  mode = m;
  hud.show(m === 'game');
  input.reset();
  layout();
}

function enterGame(): void {
  setMode('game');
  screens.reset(null);
  extra.runActive = true;
  if (state.run.level <= 2 && state.meta.stats.runs <= 2) hud.showHint();
}

function newRun(world: number): void {
  startRun(state, world);
  effects.clear();
  checkAchievements(state, events);
  enterGame();
  save();
}

function toMenu(): void {
  const lost = state.run.phase === 'gameOver';
  if (lost) extra.runActive = false;
  setMode('menu');
  screens.reset('menu');
  effects.clear();
  save();
  if (lost) maybeInterstitial();
}

function pause(): void {
  if (mode === 'game' && screens.open === null && state.run.phase !== 'gameOver') {
    screens.reset('pause');
    save();
  }
}

/** Gains hors ligne à afficher (écran de bienvenue). */
function computeOffline(seconds: number): void {
  const diamonds = offlineDiamonds(state.meta.bestLevel, state.meta.workshop.offline, seconds);
  if (diamonds <= 0) return;
  offline = { seconds, diamonds };
  if (mode === 'menu') {
    if (screens.open !== 'welcome') screens.push('welcome');
  } else {
    pause();
    screens.push('welcome');
  }
}

/** Récupère les gains hors ligne (doublés par une pub récompensée si demandé). */
async function collectOffline(double: boolean): Promise<void> {
  let gain = offline.diamonds;
  if (double) {
    if (!(await rewarded('doubleOffline'))) return;
    gain *= 2;
  }
  state.meta.diamonds += gain;
  offline = { seconds: 0, diamonds: 0 };
  sfx.play('gem');
  toasts.show(`+${formatNumber(gain)} ${t('diamonds').toLowerCase()}`, 'gem');
  save();
  screens.back();
}

const hud = new Hud(app, {
  onBuy(id, count) {
    if (buyRunUpgrade(state, id, count) > 0) sfx.play('click');
  },
  onAbility(id) {
    useAbility(state, id, events);
  },
  onPause: pause,
});

const screens = new Screens(app, {
  state: () => state,
  settings: () => settings,
  extra: () => extra,
  hasRun: () => extra.runActive && state.run.phase !== 'gameOver',
  newRun,
  resume() {
    if (state.run.phase === 'gameOver') return;
    enterGame();
  },
  toMenu,
  replay() {
    newRun(worldOf(state.run.startLevel));
  },
  async continueAd() {
    if (state.run.continued || state.run.phase !== 'gameOver') return;
    if (await rewarded('continue')) {
      continueRun(state, events);
      effects.clear();
      enterGame();
      effects.ring(state.run.cannon.x, W.cannonY, visual.cannonColor, 0.05, 1.2, 0.6, 4);
    }
  },
  async doubleAd() {
    if (state.run.diamondsDoubled) return;
    if (await rewarded('doubleDiamonds')) {
      doubleRunDiamonds(state);
      sfx.play('gem');
      save();
    }
  },
  async boostAd() {
    if (state.meta.boostTime > 0 || Date.now() < extra.boostReadyAt) return;
    if (await rewarded('boost')) {
      activateBoost(state);
      extra.boostReadyAt = Date.now() + BALANCE.boost.cooldownMinutes * 60_000;
      toasts.show(t('banner.boost'), 'gem');
      save();
    }
  },
  boostRemaining: () => state.meta.boostTime,
  boostWait: () => Math.max(0, (extra.boostReadyAt - Date.now()) / 1000),
  offlineGain: () => offline,
  collectOffline,
  buyWorkshop(id) {
    if (buyWorkshop(state, id, events)) save();
  },
  buyAbility(id) {
    if (buyAbility(state, id, events)) save();
  },
  buyWeapon(id) {
    if (buyWeapon(state, id, events)) save();
  },
  toggleEquip(id) {
    if (toggleEquip(state, id)) save();
  },
  changeSettings(change: Partial<Settings>) {
    const lang = change.language && change.language !== settings.language;
    settings = { ...settings, ...change };
    audio.setVolumes(settings.music, settings.sfx);
    save();
    // Les textes sont construits une fois : on recharge pour changer de langue.
    if (lang) location.reload();
  },
  exportCode: () => exportCode(state, settings, extra),
  importCode(code) {
    const data = importCode(code);
    if (!data) return false;
    saveGame(data.state, data.settings, data.extra, localStorage, data.savedAt || Date.now());
    setTimeout(() => location.reload(), 600);
    return true;
  },
  resetSave() {
    clearSave();
    location.reload();
  },
  consentAvailable: () => ads?.consentAvailable() ?? false,
  showConsent() {
    void ads?.showConsent();
  },
  privacyUrl: () => (isNative ? PRIVACY_URL : './privacy.html'),
  version: () => VERSION,
});

const input = new TouchInput(
  canvas,
  () => state,
  (x, y) => renderer.toWorld(x, y),
  () => hud.hideHint(),
);

window.addEventListener('resize', layout);

// Le navigateur n'autorise le son qu'après un premier geste.
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

// ------------------------------------------------------------ Événements de la simulation → effets, sons, interface

function handleEvents(): void {
  const cx = state.run.cannon.x;
  for (const e of events) {
    switch (e.type) {
      case 'levelStart': {
        const sub = e.newEnemy ? t('banner.newEnemy', { name: t(`enemy.${e.newEnemy}.name`) }) : e.grand ? t('banner.grand') : e.golden ? t('banner.golden') : '';
        effects.banner(t('banner.level', { level: e.level }), sub, e.golden ? visual.goldColor : e.grand ? visual.dangerColor : '#ffffff');
        save();
        break;
      }
      case 'shot':
        renderer.onShot();
        sfx.play('shot');
        break;
      case 'enemyHit':
        effects.sparks(e.x, e.y, '#ffffff', 2);
        effects.floatText(e.x, e.y - 0.02, formatNumber(e.damage), '#ffffffcc', 0.75, 0.55);
        sfx.play('hit');
        break;
      case 'enemyBlocked':
        effects.sparks(e.x, e.y, visual.shieldColor, 4, 0.8, Math.PI / 2);
        sfx.play('blocked');
        break;
      case 'enemyKilled': {
        const color = enemyColor(e.kind);
        effects.shards(enemyVertices(e.kind, e.radius, e.x, e.y, 0), e, color, visual.shardsOnEnemyDestroy, e.radius / 0.03);
        effects.ring(e.x, e.y, color, e.radius, 0.5, 0.3, 2);
        effects.floatText(e.x, e.y, '+' + formatNumber(e.coins), visual.coinColor, 0.85);
        sfx.play('kill', 0.8);
        if (e.gem) {
          effects.glitter(e.x, e.y, visual.gemColor, 14, 0.08);
          effects.floatText(e.x, e.y - 0.05, t('float.gem'), visual.gemColor, 1.2, 1.3);
          sfx.play('gem');
          vibrate(30);
        }
        break;
      }
      case 'enemyCrash':
        effects.shards(enemyVertices(e.kind, e.radius, e.x, e.y, 0), e, enemyColor(e.kind), 8);
        effects.ring(e.x, e.y, visual.dangerColor, e.radius, 0.6, 0.3, 3);
        break;
      case 'enemyShot':
      case 'bossFire':
        sfx.play('bossFire');
        break;
      case 'waveShieldHit':
        effects.sparks(e.x, e.y, visual.shieldColor, 2, 0.7, Math.PI / 2);
        sfx.play('blocked');
        break;
      case 'shieldDown':
        effects.ring(e.x, e.y, visual.shieldColor, e.radius, 0.9, 0.6, 5);
        effects.shards(polygonVertices(20, e.radius, 0, e.x, e.y), e, visual.shieldColor, 36, 0.8, 1.2);
        effects.banner(t('banner.shieldDown'), '', visual.shieldColor, 1.4);
        effects.addShake(5);
        sfx.play('shieldDown');
        vibrate(40);
        break;
      case 'bossHit':
        effects.sparks(e.x, e.y, e.weak ? visual.weakColor : '#ffffff', e.weak ? 5 : 2, 1, Math.PI / 2);
        effects.floatText(e.x, e.y - 0.03, formatNumber(e.damage), e.weak ? visual.weakColor : '#ffffff', e.weak ? 1.25 : 0.9);
        sfx.play(e.weak ? 'weak' : 'hit');
        break;
      case 'bossAbsorb':
        effects.sparks(e.x, e.y, visual.shieldColor, 3, 0.7, Math.PI / 2);
        sfx.play('blocked');
        break;
      case 'bossShieldBroken':
        effects.ring(e.x, e.y, visual.shieldColor, e.radius * 1.18, 0.4, 0.4, 4);
        sfx.play('blocked');
        break;
      case 'ringBroken': {
        const color = tierColor(state.run.bosses[0]?.tier ?? 8);
        effects.ring(e.x, e.y, color, e.radius, 0.7, 0.5, 5);
        effects.shards(polygonVertices(24, e.radius, 0, e.x, e.y), e, color, 30, 0.7, 1.1);
        effects.addShake(4);
        sfx.play('kill', 1.5);
        break;
      }
      case 'bossEnraged':
        effects.banner(t('banner.enraged'), '', visual.dangerColor, 1.1);
        effects.addFlash('255,60,90', 0.18);
        break;
      case 'bossSplit':
        effects.shards(tierVertices(e.tier, e.radius, 0, e.x, e.y), e, tierColor(e.tier), 30, 1.2);
        effects.ring(e.x, e.y, tierColor(e.tier), e.radius, 0.8, 0.5, 4);
        effects.addShake(6);
        sfx.play('kill', 2);
        break;
      case 'bossKilled': {
        const color = e.golden ? visual.goldColor : tierColor(e.tier);
        effects.shards(tierVertices(e.tier, e.radius, e.rotation, e.x, e.y), e, color, visual.shardsOnBossDestroy, 1.6);
        effects.ring(e.x, e.y, color, e.radius, 1.2, 0.7, 6);
        effects.ring(e.x, e.y, '#ffffff', e.radius * 0.5, 0.8, 0.5, 3);
        effects.addShake(visual.shakeOnBossDestroy);
        effects.addFlash('255,255,255');
        sfx.play('bossKilled');
        vibrate([60, 40, 80]);
        break;
      }
      case 'levelClear': {
        const b = { x: 0, y: W.bossY };
        effects.banner(t('banner.levelClear', { level: e.level }), '', '#4cff8a', 1.7);
        effects.floatText(b.x, b.y + 0.14, '+' + formatNumber(e.coins), visual.coinColor, 1.5, 1.4);
        effects.floatText(b.x, b.y + 0.22, t('float.diamonds', { n: e.diamonds }), visual.diamondColor, 1.3, 1.4);
        if (e.gems > 0) effects.floatText(b.x, b.y + 0.3, t('float.gems', { n: e.gems }), visual.gemColor, 1.3, 1.4);
        sfx.play('levelClear');
        save();
        break;
      }
      case 'cannonHit':
        effects.addShake(visual.shakeOnCannonHit);
        effects.addFlash('255,60,60', 0.2);
        effects.sparks(cx, W.cannonY, '#ff5a5a', 8);
        sfx.play('cannonHit');
        vibrate(40);
        break;
      case 'cannonBlocked':
        effects.sparks(e.x, e.y, visual.shieldColor, 5);
        sfx.play('blocked');
        break;
      case 'bulletDestroyed':
        effects.sparks(e.x, e.y, visual.orbColor, 3);
        break;
      case 'ability':
        if (e.id === 'shockwave') {
          effects.ring(cx, W.cannonY, visual.gemColor, 0.05, 2.2, 0.8, 8);
          effects.addFlash('255,107,214', 0.35);
          effects.addShake(6);
          sfx.play('shockwave');
          vibrate(60);
        } else {
          effects.ring(cx, W.cannonY, visual.cannonColor, 0.05, 0.5, 0.4, 3);
          sfx.play('ability');
        }
        break;
      case 'laser':
        sfx.play('laser');
        break;
      case 'lightning':
        effects.bolt(e.points);
        sfx.play('lightning');
        break;
      case 'cannonBurst':
        effects.shards(polygonVertices(8, BALANCE.cannon.radius * (1 + e.step * 0.4), e.step, e.x, e.y), e, e.step % 2 ? '#ffb347' : visual.cannonColor, 16 + e.step * 8, 1);
        effects.ring(e.x, e.y, '#ffb347', 0.03, 0.4 + e.step * 0.2, 0.5, 4);
        effects.addShake(5 + e.step * 3);
        effects.addFlash('255,170,80', 0.2);
        sfx.play('cannonExplode', 0.5 + e.step * 0.25);
        vibrate(80 + e.step * 40);
        break;
      case 'cannonDestroyed':
        effects.shards(polygonVertices(10, BALANCE.cannon.radius * 1.8, 0, e.x, e.y), e, visual.cannonColor, 60, 1.8, 1.4);
        effects.ring(e.x, e.y, '#ffffff', 0.05, 1.6, 0.8, 6);
        effects.ring(e.x, e.y, visual.dangerColor, 0.03, 1, 0.9, 4);
        effects.addShake(14);
        effects.addFlash('255,255,255', 0.4);
        sfx.play('cannonExplode', 1.2);
        vibrate([150, 60, 200]);
        break;
      case 'gameOver':
        save();
        screens.reset('gameOver');
        break;
      case 'continued':
        break;
      case 'achievement': {
        const def = ACHIEVEMENTS.find((a) => a.id === e.id);
        if (def) toasts.show(t('toast.achievement', { name: t(`ach.${def.stat}`, { goal: formatNumber(def.goal) }), gems: e.gems }), 'gem');
        sfx.play('achievement');
        break;
      }
      case 'dailyComplete':
        toasts.show(t('toast.daily', { gems: e.gems }), 'gem');
        sfx.play('achievement');
        break;
      case 'campaignComplete':
        toasts.show(t('toast.campaign', { gems: e.gems }), 'gem');
        sfx.play('achievement');
        if (!extra.victoryShown) {
          extra.victoryShown = true;
          screens.reset('victory');
        }
        break;
      case 'waveStart':
        break;
    }
  }
  events.length = 0;
}

// ------------------------------------------------------------ Boucle

/** Mesure du temps de calcul par image (tests de performance). */
const perf = { frames: 0, work: 0, max: 0, current: 0 };

const isSimulating = () => mode === 'game' && !hidden && screens.open === null && !adBusy;

function updateMusic(): void {
  if (mode === 'menu' || state.run.phase === 'gameOver') music.play('menu');
  else if (state.run.phase === 'boss' || state.run.phase === 'bossIntro' || (state.run.phase === 'dying' && state.run.resumePhase === 'boss')) music.play('boss');
  else music.play('game');
}

startLoop(
  () => {
    if (!isSimulating()) return;
    const t0 = performance.now();
    input.sync();
    if (AUTOPLAY) {
      AUTOPLAY.play(state, events);
      if (Math.round(state.time / STEP) % 60 === 0) spendCoins(state);
    }
    step(state, events);
    handleEvents();
    perf.current += performance.now() - t0;
  },
  (alpha, frameDt) => {
    const t0 = performance.now();
    if (events.length) handleEvents();
    if (mode === 'game') {
      const running = isSimulating();
      // Les effets continuent derrière l'écran de défaite (fin de l'explosion du canon).
      if (running || screens.open === 'gameOver') effects.update(frameDt, state.run.timeScale);
      renderer.draw(state, effects, running ? alpha : 0, running ? frameDt : 0);
      hud.update(state);
    } else {
      effects.update(frameDt);
      renderer.drawMenu(frameDt, effects);
    }
    screens.update();
    updateMusic();
    const work = perf.current + performance.now() - t0;
    perf.current = 0;
    perf.frames++;
    perf.work += work;
    perf.max = Math.max(perf.max, work);
  },
  () => settings.powerSave,
);

// ------------------------------------------------------------ Démarrage, sauvegarde, arrière-plan

rollDaily(state.meta, today());
setInterval(() => rollDaily(state.meta, today()), 60_000);
setMode('menu');
screens.reset('menu');
if (loaded.savedAt > 0) computeOffline((Date.now() - loaded.savedAt) / 1000);

function onHide(): void {
  hidden = true;
  hiddenAt = Date.now();
  save();
  pause();
  audio.suspend();
}

function onShow(): void {
  hidden = false;
  audio.resume();
  if (hiddenAt > 0) computeOffline((Date.now() - hiddenAt) / 1000);
  hiddenAt = 0;
}

document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : onShow()));
window.addEventListener('pagehide', save);
setInterval(() => {
  if (mode === 'game' && isFighting(state.run.phase)) save();
}, AUTOSAVE_INTERVAL_MS);

void setupPlatform({
  onBack() {
    if (screens.open === null && mode === 'game') {
      pause();
      return true;
    }
    if (screens.open === 'pause' || screens.open === 'victory') {
      screens.reset(mode === 'game' ? null : 'menu');
      return true;
    }
    if (screens.open === 'welcome') {
      void collectOffline(false);
      return true;
    }
    if (screens.back()) return true;
    if (screens.open === 'gameOver') {
      toMenu();
      return true;
    }
    return false;
  },
  onPause: onHide,
  onResume: onShow,
});

// PWA : le jeu reste jouable hors connexion (version web publiée uniquement).
if (!isNative && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Prépare les publicités (consentement UMP sur Android) sans bloquer le démarrage.
void createAds(isNative).then((a) => (ads = a));

// Pour les tests automatiques (Playwright) : accès en lecture à l'état.
(window as unknown as { __game?: unknown }).__game = { state, settings: () => settings, effects, STEP, screen: () => screens.open, mode: () => mode,
  perf: () => ({ avg: perf.work / Math.max(1, perf.frames), max: perf.max, frames: perf.frames }),
  resetPerf: () => Object.assign(perf, { frames: 0, work: 0, max: 0 }),
};
