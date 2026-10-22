import { describe, expect, it } from 'vitest';
import { BALANCE, RUN_UPGRADES, cost } from '../src/game/formulas';
import {
  STEP,
  buyDiamondUpgrade,
  buyRunUpgrade,
  restartRun,
  spawnEnemy,
  step,
  unlockAbility,
  useAbility,
} from '../src/game/simulation';
import type { GameEvent } from '../src/game/simulation';
import { createState } from '../src/game/state';
import type { GameState } from '../src/game/state';
import { deserialize, serialize, defaultSettings, migrate } from '../src/storage/save';

function run(state: GameState, seconds: number, each?: (s: GameState, ev: GameEvent[]) => void): GameEvent[] {
  const events: GameEvent[] = [];
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    step(state, events);
    each?.(state, events);
    all.push(...events);
    events.length = 0;
  }
  return all;
}

function buyCheapest(s: GameState): void {
  for (;;) {
    const id = RUN_UPGRADES.reduce((a, b) =>
      cost(BALANCE.runUpgrades[a], s.run.upgrades[a]) <= cost(BALANCE.runUpgrades[b], s.run.upgrades[b]) ? a : b,
    );
    if (!buyRunUpgrade(s, id, 1)) return;
  }
}

describe('niveau : boss et vagues', () => {
  it('le boss lance des vagues d’ennemis qui foncent vers le canon', () => {
    const s = createState(1);
    run(s, BALANCE.waves.firstDelay + 0.1);
    expect(s.run.enemies.length).toBeGreaterThan(0);
    const e = s.run.enemies[0];
    expect(e.vy).toBeGreaterThan(0); // vers le bas
  });

  it('le canon vise et détruit les ennemis, ce qui rapporte des pièces', () => {
    const s = createState(2);
    const all = run(s, 6);
    expect(all.some((e) => e.type === 'shot')).toBe(true);
    expect(all.some((e) => e.type === 'enemyKilled')).toBe(true);
    expect(s.run.coins).toBeGreaterThan(0);
  });

  it('un ennemi qui percute le canon lui retire des PV', () => {
    const s = createState(3);
    s.run.boss!.waveTimer = 999;
    const e = spawnEnemy(s, 1, 'grunt');
    e.x = s.run.cannon.x;
    e.y = BALANCE.world.cannonY - 0.01;
    const hp = s.run.cannon.hp;
    const all = run(s, STEP);
    expect(all.some((ev) => ev.type === 'cannonHit')).toBe(true);
    expect(s.run.cannon.hp).toBeCloseTo(hp - e.damage);
  });

  it('le bouclier bloque les impacts', () => {
    const s = createState(4);
    s.meta.gems = 100;
    expect(unlockAbility(s, 'shield')).toBe(true);
    const ev: GameEvent[] = [];
    expect(useAbility(s, 'shield', ev)).toBe(true);
    expect(useAbility(s, 'shield', ev)).toBe(false); // en recharge
    const e = spawnEnemy(s, 1, 'tank');
    e.x = s.run.cannon.x;
    e.y = BALANCE.world.cannonY;
    const hp = s.run.cannon.hp;
    const all = run(s, STEP);
    expect(all.some((x) => x.type === 'shieldBlock')).toBe(true);
    expect(s.run.cannon.hp).toBe(hp);
  });

  it('l’onde de choc détruit tous les ennemis et entame le boss', () => {
    const s = createState(5);
    s.meta.abilities.shockwave = true;
    for (let i = 0; i < 5; i++) spawnEnemy(s, 1, 'grunt');
    const bossHp = s.run.boss!.hp;
    const ev: GameEvent[] = [];
    expect(useAbility(s, 'shockwave', ev)).toBe(true);
    expect(s.run.enemies).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'enemyKilled')).toHaveLength(5);
    expect(s.run.boss!.hp).toBeLessThan(bossHp);
  });

  it('boss vaincu : diamants, niveau suivant, soin partiel', () => {
    const s = createState(6);
    s.run.boss!.hp = 0.5;
    s.run.cannon.hp = 1;
    const all = run(s, BALANCE.boss.nextLevelDelay + 1);
    const killed = all.find((e) => e.type === 'bossKilled');
    expect(killed).toBeDefined();
    expect(s.meta.diamonds).toBe(BALANCE.diamonds.perBoss + BALANCE.diamonds.firstClearBonus);
    expect(s.run.level).toBe(2);
    expect(s.run.boss?.level).toBe(2);
    expect(s.run.cannon.hp).toBeGreaterThan(1);
    expect(s.meta.highestCleared).toBe(1);
  });

  it('défaite → retour au niveau 1, progression permanente conservée', () => {
    const s = createState(7);
    s.run.level = 8;
    s.run.coins = 500;
    s.run.upgrades.damage = 4;
    s.meta.diamonds = 12;
    s.meta.abilities.shield = true;
    s.run.cannon.hp = 0.001;
    const e = spawnEnemy(s, 8, 'grunt');
    e.x = s.run.cannon.x;
    e.y = BALANCE.world.cannonY;
    const all = run(s, STEP);
    expect(all.some((x) => x.type === 'gameOver')).toBe(true);
    expect(s.run.phase).toBe('gameOver');
    restartRun(s);
    expect(s.run.level).toBe(1);
    expect(s.run.coins).toBe(0);
    expect(s.run.upgrades.damage).toBe(0);
    expect(s.meta.diamonds).toBe(12);
    expect(s.meta.abilities.shield).toBe(true);
  });

  it('le canon se déplace vers la cible, dans les limites', () => {
    const s = createState(8);
    s.input.moveX = 10;
    run(s, 2);
    expect(s.run.cannon.x).toBeCloseTo(BALANCE.world.cannonMaxX);
    s.input.moveX = -0.1;
    run(s, 1);
    expect(s.run.cannon.x).toBeCloseTo(-0.1);
  });

  it('visée manuelle : le fût s’oriente vers le point visé', () => {
    const s = createState(9);
    s.input.aim = { x: 0.4, y: BALANCE.world.cannonY - 0.4 };
    run(s, 0.5);
    expect(s.run.cannon.angle).toBeCloseTo(-Math.PI / 4, 1);
  });
});

describe('améliorations', () => {
  it('pièces → amélioration de partie ; le blindage soigne d’autant', () => {
    const s = createState(10);
    s.run.coins = 1000;
    const hp = s.run.cannon.hp;
    expect(buyRunUpgrade(s, 'maxHp', 1)).toBe(1);
    expect(s.run.cannon.maxHp).toBeGreaterThan(hp);
    expect(s.run.cannon.hp - hp).toBeCloseTo(s.run.cannon.maxHp - hp);
    expect(s.run.coins).toBeLessThan(1000);
  });

  it('diamants → atelier ; gemmes → capacités', () => {
    const s = createState(11);
    expect(buyDiamondUpgrade(s, 'damage')).toBe(false);
    s.meta.diamonds = 10;
    expect(buyDiamondUpgrade(s, 'damage')).toBe(true);
    expect(s.meta.upgrades.damage).toBe(1);
    expect(unlockAbility(s, 'doubleShot')).toBe(false);
    s.meta.gems = BALANCE.abilities.doubleShot.gemCost;
    expect(unlockAbility(s, 'doubleShot')).toBe(true);
    expect(s.meta.gems).toBe(0);
    expect(unlockAbility(s, 'doubleShot')).toBe(false);
  });
});

describe('partie complète', () => {
  it('10 minutes avec achats automatiques : valeurs valides, progression, défaite gérée', () => {
    const s = createState(42);
    let games = 0;
    run(s, 600, (st, ev) => {
      buyCheapest(st);
      expect(Number.isFinite(st.run.coins) && st.run.coins >= 0).toBe(true);
      expect(Number.isFinite(st.run.cannon.hp)).toBe(true);
      expect(st.run.enemies.length).toBeLessThan(200);
      expect(st.run.projectiles.length).toBeLessThan(400);
      if (ev.some((e) => e.type === 'gameOver')) {
        games++;
        restartRun(st);
      }
    });
    expect(s.meta.bestLevel).toBeGreaterThan(3);
    expect(s.meta.diamonds).toBeGreaterThan(0);
    expect(games + 1).toBeGreaterThan(0);
  });

  it('même graine → même partie (simulation reproductible)', () => {
    const a = createState(99);
    const b = createState(99);
    run(a, 30);
    run(b, 30);
    expect(a.run.coins).toBe(b.run.coins);
    expect(a.run.enemies.length).toBe(b.run.enemies.length);
  });
});

describe('sauvegarde', () => {
  it('aller-retour JSON : partie au début du niveau, méta et paramètres', () => {
    const s = createState(12);
    run(s, 20, buyCheapest);
    s.meta.diamonds = 7;
    s.meta.abilities.shield = true;
    const settings = { ...defaultSettings(), controlMode: 'fixedAim' as const, vibration: false };
    const { state, settings: st } = deserialize(JSON.parse(JSON.stringify(serialize(s, settings))));
    expect(state.run.level).toBe(s.run.level);
    expect(state.run.coins).toBeCloseTo(s.run.coins);
    expect(state.run.upgrades).toEqual(s.run.upgrades);
    expect(state.run.enemies).toHaveLength(0);
    expect(state.run.boss?.level).toBe(s.run.level);
    expect(state.meta.diamonds).toBe(7);
    expect(state.meta.abilities.shield).toBe(true);
    expect(st).toEqual(settings);
  });

  it('partie perdue sauvegardée → nouvelle partie au niveau 1', () => {
    const s = createState(13);
    s.run.level = 6;
    s.run.phase = 'gameOver';
    const { state } = deserialize(serialize(s, defaultSettings()));
    expect(state.run.level).toBe(1);
    expect(state.run.phase).toBe('playing');
  });

  it('migration v1 → v2', () => {
    const v1 = { version: 1, level: 14, maxLevel: 15, coins: 99, kills: 20, upgrades: { damage: 3 } };
    expect(migrate(v1)?.version).toBe(2);
    const { state } = deserialize(v1);
    expect(state.run.level).toBe(1);
    expect(state.meta.bestLevel).toBe(15);
  });

  it('données corrompues → nouvelle partie', () => {
    expect(deserialize(null).state.run.level).toBe(1);
    expect(deserialize({ version: 999 }).state.run.level).toBe(1);
    const { state, settings } = deserialize({
      version: 2,
      run: { level: -3, coins: 'abc', upgrades: { damage: NaN } },
      meta: { diamonds: -5, abilities: { shield: 'oui' } },
      settings: { controlMode: 'n/importe', vibration: 3 },
    });
    expect(state.run.level).toBe(1);
    expect(state.run.coins).toBe(0);
    expect(state.meta.diamonds).toBe(0);
    expect(state.meta.abilities.shield).toBe(false);
    expect(settings).toEqual(defaultSettings());
  });
});
