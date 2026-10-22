// Simulation d'équilibrage sans rendu : `npm run sim`. Deux joueurs automatiques (immobile / esquive)
// enchaînent 8 parties en dépensant tout à chaque fois ; affiche le niveau atteint par partie.
import { test } from 'vitest';
import { BALANCE, DIAMOND_UPGRADES, RUN_UPGRADES, cost } from '../src/game/formulas';
import { buyDiamondUpgrade, buyRunUpgrade, restartRun, step, STEP, type GameEvent } from '../src/game/simulation';
import { createState, type GameState } from '../src/game/state';

function buyCheapestRun(s: GameState) {
  for (;;) {
    let best = RUN_UPGRADES[0]; let bc = Infinity;
    for (const id of RUN_UPGRADES) { const c = cost(BALANCE.runUpgrades[id], s.run.upgrades[id]); if (c < bc) { bc = c; best = id; } }
    if (!buyRunUpgrade(s, best, 1)) return;
  }
}
function buyCheapestMeta(s: GameState) {
  for (;;) {
    let best = DIAMOND_UPGRADES[0]; let bc = Infinity;
    for (const id of DIAMOND_UPGRADES) { const c = cost(BALANCE.diamondUpgrades[id], s.meta.upgrades[id]); if (c < bc) { bc = c; best = id; } }
    if (!buyDiamondUpgrade(s, best)) return;
  }
}
function dodge(s: GameState) {
  // Joueur simple : s'écarte des ennemis qui arrivent à sa hauteur.
  const c = s.run.cannon; let push = 0;
  for (const e of s.run.enemies) {
    if (e.damage <= 0) continue;
    const dy = BALANCE.world.cannonY - e.y; if (dy < 0 || dy > 0.45) continue;
    const t = dy / Math.max(0.05, e.vy); const px = e.x + e.vx * t; const dx = c.x - px;
    if (Math.abs(dx) < 0.12) push += (dx >= 0 ? 1 : -1) * (0.45 - dy);
  }
  s.input.moveX = push === 0 ? c.x * 0.98 : c.x + Math.sign(push) * 0.3;
}
for (const mode of ['idle', 'dodge']) test(mode, () => {
  const s = createState(42); const ev: GameEvent[] = []; let t = 0; const lines: string[] = [];
  for (let runIdx = 0; runIdx < 8; runIdx++) {
    let rt = 0; let hits = 0;
    while (s.run.phase !== 'gameOver' && rt < 1200) { if (mode === 'dodge') dodge(s); step(s, ev); hits += ev.filter(e => e.type === "cannonHit").length; ev.length = 0; buyCheapestRun(s); rt += STEP; }
    t += rt;
    lines.push(`${mode} run${runIdx} level=${s.run.level} hits=${hits} time=${rt.toFixed(0)}s total=${(t/60).toFixed(1)}min dia+${s.run.diamondsEarned} gems=${s.meta.gems} up=${JSON.stringify(s.run.upgrades)} meta=${JSON.stringify(s.meta.upgrades)}`);
    buyCheapestMeta(s); restartRun(s);
  }
  console.log(lines.join('\n'));
});
