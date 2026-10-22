import './style.css';
import visual from './config/visual.json';
import { formatNumber } from './game/bignum';
import { BALANCE } from './game/formulas';
import { shapeVertices } from './game/geometry';
import { startLoop } from './game/loop';
import {
  bossPosition,
  buyDiamondUpgrade,
  buyRunUpgrade,
  restartRun,
  step,
  unlockAbility,
  useAbility,
} from './game/simulation';
import type { GameEvent } from './game/simulation';
import { t } from './i18n';
import { Effects } from './render/effects';
import { Renderer, enemyColor, enemyVertices, tierColor } from './render/renderer';
import { clearSave, loadGame, saveGame } from './storage/save';
import { Hud } from './ui/hud';
import { TouchInput } from './ui/input';
import { Screens } from './ui/screens';

const VERSION = '0.2.0';
const AUTOSAVE_INTERVAL_MS = 10_000;

// « ?reset » dans l'adresse efface la sauvegarde (pratique pour tester).
if (new URLSearchParams(location.search).has('reset')) {
  clearSave();
  history.replaceState(null, '', location.pathname);
}

document.title = t('title');
const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
app.appendChild(canvas);

const loaded = loadGame();
const state = loaded.state;
let settings = loaded.settings;
const effects = new Effects();
const renderer = new Renderer(canvas);
const events: GameEvent[] = [];
let hidden = document.hidden;

const save = () => saveGame(state, settings);

const hud = new Hud(app, {
  onBuy(id, count) {
    buyRunUpgrade(state, id, count);
  },
  onAbility(id) {
    useAbility(state, id, events);
  },
  onPause() {
    screens.show('pause');
  },
});

const screens = new Screens(
  app,
  {
    onResume() {
      screens.show(null);
    },
    onRestart() {
      restartRun(state);
      effects.particles.length = 0;
      screens.show(null);
      save();
    },
    onBuyDiamond(id) {
      if (buyDiamondUpgrade(state, id)) save();
    },
    onUnlock(id) {
      if (unlockAbility(state, id)) save();
    },
    onSettings(change) {
      settings = { ...settings, ...change };
      save();
    },
    onResetSave() {
      clearSave();
      location.reload();
    },
  },
  VERSION,
);

const input = new TouchInput(
  canvas,
  () => state,
  () => settings.controlMode,
  (x, y) => renderer.toWorld(x, y),
  () => hud.hideHint(),
);

function layout(): void {
  renderer.resize({
    top: hud.topBar.getBoundingClientRect().bottom,
    bottom: hud.panel.getBoundingClientRect().top,
  });
}
window.addEventListener('resize', layout);
layout();

function vibrate(ms: number): void {
  if (settings.vibration) navigator.vibrate?.(ms);
}

function handleEvents(): void {
  for (const e of events) {
    switch (e.type) {
      case 'shot':
        renderer.onShot();
        break;
      case 'enemyHit':
        effects.sparks(e.x, e.y, '#ffffff', 2);
        break;
      case 'enemyKilled': {
        const color = enemyColor(e.kind);
        const r = BALANCE.enemies[e.kind].radius;
        effects.shards(enemyVertices({ kind: e.kind, radius: r, x: e.x, y: e.y }, 0), e, color, visual.shardsOnEnemyDestroy, 0.7);
        effects.floatText(e.x, e.y, '+' + formatNumber(e.coins), '#ffd84a', 0.9);
        if (e.gem) effects.floatText(e.x, e.y - 0.05, t('levelClearGems', { gems: 1 }), '#ff6bd6', 1.3);
        break;
      }
      case 'bossHit':
        effects.sparks(e.x, e.y, '#ffffff');
        effects.floatText(e.x, e.y - 0.03, formatNumber(e.damage));
        break;
      case 'bossKilled': {
        const p = bossPosition();
        const color = tierColor(e.level);
        effects.shards(shapeVertices(e.shape, BALANCE.boss.radius, e.rotation, p.x, p.y), p, color, visual.shardsOnBossDestroy, 1.6);
        effects.addShake(visual.shakeOnBossDestroy);
        effects.addFlash('255,255,255');
        effects.floatText(p.x, p.y + 0.12, '+' + formatNumber(e.coins), '#ffd84a', 1.5);
        effects.floatText(p.x, p.y + 0.2, t('levelClearReward', { diamonds: e.diamonds }), '#7fe3ff', 1.3);
        if (e.gems > 0) effects.floatText(p.x, p.y + 0.28, t('levelClearGems', { gems: e.gems }), '#ff6bd6', 1.3);
        vibrate(80);
        save();
        break;
      }
      case 'cannonHit':
        effects.addShake(visual.shakeOnCannonHit);
        effects.addFlash('255,60,60');
        effects.sparks(state.run.cannon.x, BALANCE.world.cannonY, '#ff5a5a', 8);
        vibrate(40);
        break;
      case 'shieldBlock':
        effects.sparks(e.x, e.y, '#3ee6ff', 6);
        break;
      case 'ability':
        if (e.id === 'shockwave') {
          effects.addFlash('62,230,255', 0.35);
          effects.addShake(5);
        }
        break;
      case 'levelStart':
        save();
        break;
      case 'gameOver':
        effects.shards(
          shapeVertices({ sides: 8 }, BALANCE.cannon.radius * 1.5, 0, state.run.cannon.x, BALANCE.world.cannonY),
          { x: state.run.cannon.x, y: BALANCE.world.cannonY },
          visual.cannonColor,
          30,
          1.2,
        );
        effects.addShake(10);
        vibrate(200);
        save();
        screens.show('gameOver');
        break;
    }
  }
  events.length = 0;
}

const isPaused = () => hidden || screens.open !== null;

// Partie déjà perdue au chargement : on réaffiche l'écran de défaite.
if (state.run.phase === 'gameOver') screens.show('gameOver');

startLoop(
  () => {
    if (isPaused()) return;
    input.sync();
    step(state, events);
    handleEvents();
  },
  (alpha, frameDt) => {
    const paused = isPaused();
    // Les effets continuent derrière l'écran de défaite (explosion du canon).
    if (!paused || screens.open === 'gameOver') effects.update(frameDt);
    // Traite les événements produits hors simulation (capacités).
    if (events.length) handleEvents();
    renderer.draw(state, effects, paused ? 0 : alpha, paused ? 0 : frameDt);
    hud.update(state);
    screens.update(state, settings);
  },
);

// Pause automatique et sauvegarde au passage en arrière-plan.
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden) {
    save();
    if (screens.open === null && state.run.phase === 'playing') screens.show('pause');
  }
});
window.addEventListener('pagehide', save);
setInterval(save, AUTOSAVE_INTERVAL_MS);
