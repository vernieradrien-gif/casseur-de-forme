import { describe, expect, it } from 'vitest';
import { shapeCoins, shapeHp } from '../src/game/formulas';
import { buyUpgrade, step, STEP } from '../src/game/simulation';
import type { GameEvent } from '../src/game/simulation';
import { createState } from '../src/game/state';
import { deserialize, serialize } from '../src/storage/save';

function run(seconds: number, onStep?: (s: ReturnType<typeof createState>, ev: GameEvent[]) => void) {
  const state = createState();
  const events: GameEvent[] = [];
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    step(state, events);
    onStep?.(state, events);
    all.push(...events);
    events.length = 0;
  }
  return { state, all };
}

describe('simulation', () => {
  it('le canon tire, touche et détruit la première forme', () => {
    const { state, all } = run(8);
    expect(all.some((e) => e.type === 'shot')).toBe(true);
    expect(all.some((e) => e.type === 'hit')).toBe(true);
    const destroyed = all.find((e) => e.type === 'destroyed');
    expect(destroyed).toMatchObject({ level: 1, coins: shapeCoins(1) });
    expect(state.level).toBeGreaterThan(1);
    expect(state.coins).toBeGreaterThan(0);
  });

  it('la forme suivante apparaît avec les bons PV', () => {
    const { state, all } = run(8);
    expect(all.some((e) => e.type === 'spawn' && e.level === 2)).toBe(true);
    if (state.shape) expect(state.shape.maxHp).toBeCloseTo(shapeHp(state.shape.level));
  });

  it("l'achat de dégâts débite les pièces et augmente le niveau", () => {
    const state = createState();
    state.coins = 25;
    expect(buyUpgrade(state, 'damage', 1)).toBe(1);
    expect(state.upgrades.damage).toBe(1);
    expect(state.coins).toBeCloseTo(15);
    expect(buyUpgrade(state, 'damage', 10)).toBe(1); // 11,5 abordable, pas 10 niveaux
    expect(buyUpgrade(state, 'damage', 1)).toBe(0);
    expect(state.coins).toBeGreaterThanOrEqual(0);
  });

  it('5 minutes de jeu (achats automatiques) sans valeur invalide', () => {
    let maxProjectiles = 0;
    const { state, all } = run(300, (s) => {
      buyUpgrade(s, 'damage', Infinity);
      maxProjectiles = Math.max(maxProjectiles, s.projectiles.length);
      expect(Number.isFinite(s.coins) && s.coins >= 0).toBe(true);
      if (s.shape) expect(Number.isFinite(s.shape.hp)).toBe(true);
    });
    expect(state.level).toBeGreaterThan(10);
    expect(state.upgrades.damage).toBeGreaterThan(0);
    expect(state.kills).toBe(all.filter((e) => e.type === 'destroyed').length);
    expect(maxProjectiles).toBeLessThan(20);
  });
});

describe('sauvegarde', () => {
  it('aller-retour JSON', () => {
    const { state } = run(20);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
    expect(copy.level).toBe(state.level);
    expect(copy.coins).toBeCloseTo(state.coins);
    expect(copy.upgrades.damage).toBe(state.upgrades.damage);
    expect(copy.shape?.level).toBe(state.level);
  });

  it('données corrompues → nouvelle partie', () => {
    expect(deserialize(null).level).toBe(1);
    expect(deserialize({ version: 999, level: 50 }).level).toBe(1);
    const s = deserialize({ version: 1, level: -3, coins: 'abc', upgrades: { damage: NaN } });
    expect(s.level).toBe(1);
    expect(s.coins).toBe(0);
    expect(s.upgrades.damage).toBe(0);
  });
});
