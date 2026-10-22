import './style.css';
import { formatNumber } from './game/bignum';
import { startLoop } from './game/loop';
import { buyUpgrade, step } from './game/simulation';
import type { GameEvent } from './game/simulation';
import { t } from './i18n';
import { Effects } from './render/effects';
import { Renderer, tierColor } from './render/renderer';
import { clearSave, loadGame, saveGame } from './storage/save';
import { Hud } from './ui/hud';

const AUTOSAVE_INTERVAL_MS = 10_000;

// « ?reset » dans l'adresse efface la sauvegarde (pratique pour tester).
const params = new URLSearchParams(location.search);
if (params.has('reset')) {
  clearSave();
  history.replaceState(null, '', location.pathname);
}

document.title = t('title');
const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
app.appendChild(canvas);

const state = loadGame();
const effects = new Effects();
const renderer = new Renderer(canvas);
const events: GameEvent[] = [];
let manualPause = false;
let hidden = document.hidden;

const hud = new Hud(app, {
  onBuyDamage(count) {
    buyUpgrade(state, 'damage', count);
  },
  onTogglePause() {
    manualPause = !manualPause;
  },
});

function layout(): void {
  renderer.resize({
    top: hud.topBar.getBoundingClientRect().bottom,
    bottom: hud.panel.getBoundingClientRect().top,
  });
}
window.addEventListener('resize', layout);
layout();

function handleEvents(): void {
  for (const e of events) {
    switch (e.type) {
      case 'shot':
        renderer.onShot();
        break;
      case 'hit':
        effects.sparks(e.x, e.y, '#ffffff');
        effects.floatText(e.x, e.y - 0.04, formatNumber(e.damage));
        break;
      case 'destroyed': {
        const color = tierColor(e.level);
        effects.shards(Renderer.shapeVertices(e.sides, e.rotation), color);
        effects.floatText(0, 0, '+' + formatNumber(e.coins), '#ffd84a', 1.5);
        break;
      }
      case 'spawn':
        break;
    }
  }
  events.length = 0;
}

const isPaused = () => manualPause || hidden;

startLoop(
  () => {
    if (isPaused()) return;
    step(state, events);
    handleEvents();
  },
  (alpha, frameDt) => {
    const paused = isPaused();
    if (!paused) effects.update(frameDt);
    renderer.draw(state, effects, paused ? 0 : alpha, paused ? 0 : frameDt);
    hud.update(state, manualPause);
  },
);

// Pause automatique et sauvegarde au passage en arrière-plan.
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden) saveGame(state);
});
window.addEventListener('pagehide', () => saveGame(state));
setInterval(() => saveGame(state), AUTOSAVE_INTERVAL_MS);
