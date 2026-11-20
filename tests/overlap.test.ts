import { describe, expect, it } from 'vitest';
import { bossExtent } from '../src/game/boss';
import { BALANCE } from '../src/game/config';
import { STEP, step } from '../src/game/simulation';
import { createState } from '../src/game/state';
import type { GameEvent } from '../src/game/events';
import type { GameState } from '../src/game/state';

/** Plus petite distance (bord à bord) entre un ennemi vivant et une forme, sur toute la durée. */
function worstGap(level: number, seed: number, seconds: number): number {
  const s: GameState = createState(seed);
  s.run.level = level;
  s.run.startLevel = level;
  s.run.noHitFrom = level;
  const events: GameEvent[] = [];
  let worst = Infinity;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    // Canon immortel, posé en bas : on observe seulement le placement des ennemis.
    s.run.cannon.hp = s.run.cannon.maxHp;
    step(s, events);
    events.length = 0;
    for (const b of s.run.bosses) {
      if (b.hp <= 0) continue;
      for (const e of s.run.enemies) {
        if (e.hp <= 0) continue;
        worst = Math.min(worst, Math.hypot(e.x - b.x, e.y - b.y) - bossExtent(b) - e.radius);
      }
    }
  }
  return worst;
}

describe('ennemis et forme', () => {
  // Niveaux avec tourelles, mitrailleurs, tireurs, super boss (10, 20) et titan (50).
  for (const level of [8, 10, 14, 20, 27, 35, 50]) {
    it(`aucun ennemi ne recouvre la forme (niveau ${level})`, () => {
      for (const seed of [1, 2, 3]) {
        // Tolérance : la forme bouge pendant le pas qui suit le dégagement de l'ennemi.
        expect(worstGap(level, seed, 45)).toBeGreaterThan(-BALANCE.boss.moveSpeed * 2 * STEP);
      }
    });
  }
});
