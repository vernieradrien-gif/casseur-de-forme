import { describe, expect, it } from 'vitest';
import { buyCannon, buyWeapon, cooldownOf, selectCannon, startRun } from '../src/game/actions';
import { damageBoss } from '../src/game/boss';
import { hitCannon } from '../src/game/cannon';
import { BALANCE, CANNONS } from '../src/game/config';
import { spawnEnemy } from '../src/game/enemies';
import type { GameEvent } from '../src/game/events';
import { abilityCooldown, cannonPassive, cannonStats, enemyStats, growLevel, healOnClear, weaponSlots, worldRamp } from '../src/game/formulas';
import { checkAchievements, statValue } from '../src/game/progress';
import { STEP, step } from '../src/game/simulation';
import { createState } from '../src/game/state';
import type { Enemy, GameState } from '../src/game/state';
import { deserialize, serialize, defaultExtra, defaultSettings } from '../src/storage/save';

const W = BALANCE.world;

function run(state: GameState, seconds: number, each?: (s: GameState) => void): GameEvent[] {
  const events: GameEvent[] = [];
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    each?.(state);
    step(state, events);
    all.push(...events);
    events.length = 0;
  }
  return all;
}

function at(level = 1, seed = 1): GameState {
  const s = createState(seed);
  s.run.level = level;
  s.run.startLevel = level;
  s.run.noHitFrom = level;
  run(s, STEP);
  return s;
}

/** Vagues sans nouvel ennemi ni boss qui tire : pour observer une arme ou un canon. */
function quietWaves(level: number, seed: number): GameState {
  const s = at(level, seed);
  s.run.waves.queue = [];
  s.run.enemies = [];
  s.run.waves.time = -1e9;
  s.run.hazards = [];
  s.run.hazardTimer = 1e9;
  for (const b of s.run.bosses) b.fireTimer = 1e9;
  return s;
}

function bossPhase(level: number, seed: number): GameState {
  const s = at(level, seed);
  s.run.waves.queue = [];
  s.run.enemies = [];
  s.run.phase = 'boss';
  s.run.phaseTimer = 0;
  for (const b of s.run.bosses) {
    b.fireTimer = 1e9;
    b.minionTimer = 1e9;
    for (const p of b.parts) p.fireTimer = 1e9;
  }
  return s;
}

/** Termine le niveau en cours (boss vaincu d'un coup). */
function clear(s: GameState): GameEvent[] {
  const boss = s.run.bosses[0];
  boss.hp = 0.01;
  boss.fragments = 0;
  damageBoss(s, boss, 1, boss.x, boss.y, [], { pierce: true });
  return run(s, STEP * 2);
}

function enemy(s: GameState, kind: Enemy['kind'], x: number, y: number): Enemy {
  const e = spawnEnemy(s, s.run.level, { kind, x, y, vx: 0, vy: 1, amp: 0, freq: 0, phase: 0 }, -1);
  e.vx = 0;
  e.vy = 0;
  return e;
}

function own(s: GameState, id: (typeof CANNONS)[number]): void {
  s.meta.cannons[id] = true;
  expect(selectCannon(s, id)).toBe(true);
}

describe('canons : bonus passifs', () => {
  it('chaque bonus agit tant que le canon est choisi', () => {
    const w = createState(1).meta.workshop;
    const zero = { damage: 0, fireRate: 0, maxHp: 0 };
    const base = cannonStats(zero, w, 'classic');
    expect(cannonStats(zero, w, 'shotgun').maxHp).toBeCloseTo(base.maxHp * 1.2);
    expect(cannonStats(zero, w, 'twin').coinMultiplier).toBeCloseTo(base.coinMultiplier * 1.15);
    expect(cannonStats(zero, w, 'prism').damage).toBeCloseTo(base.damage * 1.25);
    expect(cannonStats(zero, w, 'prism').coinMultiplier).toBeCloseTo(base.coinMultiplier * 1.25);
    expect(healOnClear(w, 'gatling')).toBeCloseTo(healOnClear(w, 'classic') + 0.15);
    expect(cannonPassive('burst', 'damage')).toBe(0);
  });

  it('Rayon : capacités rechargées plus vite ; Plasma : points faibles plus fragiles', () => {
    const s = at(1, 2);
    s.meta.abilities.shield = 1;
    const normal = cooldownOf(s, 'shield');
    expect(normal).toBeCloseTo(abilityCooldown('shield', 1));
    own(s, 'beam');
    expect(cooldownOf(s, 'shield')).toBeCloseTo(normal * 0.85);

    const a = bossPhase(1, 3);
    const b = bossPhase(1, 3);
    own(b, 'plasma');
    const evA: GameEvent[] = [];
    const evB: GameEvent[] = [];
    damageBoss(a, a.run.bosses[0], 2, 0, 0, evA, { weak: true });
    damageBoss(b, b.run.bosses[0], 2, 0, 0, evB, { weak: true });
    const hpA = a.run.bosses[0].maxHp - a.run.bosses[0].hp;
    const hpB = b.run.bosses[0].maxHp - b.run.bosses[0].hp;
    expect(hpB).toBeCloseTo(hpA * 1.5);
  });

  it('Ricochet : +20 % de diamants en fin de niveau', () => {
    const a = bossPhase(6, 4);
    const b = bossPhase(6, 4);
    a.meta.highestCleared = 10;
    b.meta.highestCleared = 10;
    own(b, 'ricochet');
    const da = clear(a).find((e) => e.type === 'levelClear');
    const db = clear(b).find((e) => e.type === 'levelClear');
    expect(da?.type === 'levelClear' && db?.type === 'levelClear' && db.diamonds).toBe(Math.round((da?.type === 'levelClear' ? da.diamonds : 0) * 1.2));
  });

  it('changer de canon garde la proportion de PV', () => {
    const s = at(1, 5);
    s.run.cannon.hp = s.run.cannon.maxHp / 2;
    own(s, 'shotgun');
    expect(s.run.cannon.hp / s.run.cannon.maxHp).toBeCloseTo(0.5);
    expect(s.run.cannon.maxHp).toBeCloseTo(cannonStats(s.run.upgrades, s.meta.workshop, 'shotgun').maxHp);
  });
});

describe('canons : nouveaux tirs', () => {
  it('Jumeaux : les deux fûts tirent tour à tour', () => {
    const s = quietWaves(1, 10);
    own(s, 'twin');
    run(s, 1);
    const xs = s.run.projectiles.map((p) => Math.sign(p.x - s.run.cannon.x));
    expect(xs.filter((v) => v < 0).length).toBeGreaterThan(0);
    expect(xs.filter((v) => v > 0).length).toBeGreaterThan(0);
  });

  it('Ricochet : tirs inclinés qui rebondissent sur les bords', () => {
    const s = quietWaves(1, 11);
    own(s, 'ricochet');
    run(s, 0.45);
    const p = s.run.projectiles[s.run.projectiles.length - 1];
    expect(Math.abs(p.vx)).toBeGreaterThan(0.1);
    expect(p.bounces).toBe(BALANCE.cannons.ricochet.bounces);
    // Placé contre le bord : il repart dans l'autre sens.
    p.x = W.width / 2 - p.radius * 0.5;
    p.vx = Math.abs(p.vx);
    p.y = 0.8;
    run(s, STEP);
    expect(p.vx).toBeLessThan(0);
    expect(p.bounces).toBe((BALANCE.cannons.ricochet.bounces ?? 2) - 1);
  });

  it('Gatling : la cadence monte tant qu’elle tire', () => {
    const s = quietWaves(1, 12);
    own(s, 'gatling');
    const count = (ev: GameEvent[]) => ev.filter((e) => e.type === 'shot').length;
    const first = count(run(s, 1));
    run(s, 2);
    const later = count(run(s, 1));
    expect(s.run.cannon.spin).toBe(1);
    expect(later).toBeGreaterThan(first * 2);
  });

  it('Foudre : l’arc frappe l’ennemi droit devant puis rebondit', () => {
    const s = quietWaves(1, 13);
    own(s, 'storm');
    const c = s.run.cannon;
    const list = [enemy(s, 'tank', c.x, 0.9), enemy(s, 'tank', c.x + 0.15, 0.85), enemy(s, 'tank', c.x - 0.15, 0.95)];
    for (const e of list) e.hp = 1e6;
    const ev = run(s, 1.2);
    expect(ev.some((e) => e.type === 'lightning' && e.source === 'cannon' && e.points.length >= 3)).toBe(true);
    for (const e of list) expect(e.hp).toBeLessThan(1e6);
    expect(s.run.projectiles).toHaveLength(0);
  });

  it('Prisme : éventail de sphères perforantes', () => {
    const s = quietWaves(1, 14);
    own(s, 'prism');
    run(s, 1.2);
    const orbs = s.run.projectiles.filter((p) => p.kind === 'plasma');
    expect(orbs.length).toBeGreaterThanOrEqual(BALANCE.cannons.prism.shots!);
    expect(orbs[0].pierce).toBe(BALANCE.cannons.prism.pierce);
  });

  it('les canons des mondes ne s’achètent pas ; le Prisme demande les 5 mondes', () => {
    const s = createState(15);
    s.meta.gems = 1e6;
    for (const id of ['twin', 'ricochet', 'gatling', 'storm', 'prism'] as const) {
      expect(BALANCE.cannons[id].gemCost).toBe(0);
      expect(buyCannon(s, id)).toBe(false);
    }
    const ev: GameEvent[] = [];
    s.meta.bestLevel = 151;
    checkAchievements(s, ev);
    expect(s.meta.cannons.twin && s.meta.cannons.ricochet && s.meta.cannons.gatling).toBe(true);
    expect(s.meta.cannons.storm).toBe(false);
    s.meta.bestLevel = 251;
    s.meta.highestCleared = 249;
    checkAchievements(s, ev);
    expect(s.meta.cannons.storm).toBe(true);
    expect(s.meta.cannons.prism).toBe(false);
    s.meta.highestCleared = 250;
    checkAchievements(s, ev);
    expect(s.meta.cannons.prism).toBe(true);
    // Classique, Rafale et Rayon (niveaux 15 et 40) + les cinq canons des mondes.
    expect(statValue(s.meta, 'cannonsUnlocked')).toBe(8);
  });
});

describe('armurerie : armes de fin de monde', () => {
  it('cachées, impossibles à acheter, offertes en terminant le monde', () => {
    const s = bossPhase(50, 20);
    s.meta.gems = 1e6;
    expect(buyWeapon(s, 'drones')).toBe(false);
    expect(s.meta.weapons.drones).toBe(0);
    const ev = clear(s);
    expect(ev.some((e) => e.type === 'weaponUnlocked' && e.id === 'drones')).toBe(true);
    expect(s.meta.weapons.drones).toBe(1);
    expect(s.meta.equipped).toContain('drones');
    expect(s.meta.weapons.cryo).toBe(0);
    // Ensuite, elle s'améliore avec des diamants comme les autres.
    s.meta.diamonds = 1e6;
    expect(buyWeapon(s, 'drones')).toBe(true);
    expect(s.meta.weapons.drones).toBe(2);
  });

  it('4e emplacement au niveau 151', () => {
    expect(weaponSlots(150)).toBe(3);
    expect(weaponSlots(151)).toBe(4);
  });

  function equip(s: GameState, id: 'drones' | 'cryo' | 'nova' | 'vortex'): void {
    s.meta.weapons[id] = 1;
    s.meta.equipped = [id];
  }

  it('Drones : tirent sur les ennemis proches', () => {
    const s = quietWaves(60, 21);
    equip(s, 'drones');
    s.meta.cannon = 'classic';
    const e = enemy(s, 'tank', s.run.cannon.x + 0.3, 1.0);
    e.hp = 1e9;
    const ev = run(s, 1.5);
    expect(ev.some((x) => x.type === 'droneShot')).toBe(true);
    expect(e.hp).toBeLessThan(1e9);
  });

  it('Gel : ralentit les ennemis et les tirs ennemis près du canon', () => {
    const s = quietWaves(110, 22);
    equip(s, 'cryo');
    const c = s.run.cannon;
    const near = enemy(s, 'grunt', c.x, c.y - 0.1);
    const far = enemy(s, 'grunt', c.x + 0.4, 0.3);
    near.vy = 0.3;
    far.vy = 0.3;
    near.hp = 1e9;
    far.hp = 1e9;
    const y0 = [near.y, far.y];
    run(s, 0.1);
    const dn = near.y - y0[0];
    const df = far.y - y0[1];
    expect(dn).toBeCloseTo(df * (1 - BALANCE.weapons.cryo.slow!), 3);
    expect(near.hp).toBeLessThan(1e9);
    expect(far.hp).toBe(1e9);
  });

  it('Nova : anneau de tirs autour du canon', () => {
    const s = quietWaves(160, 23);
    equip(s, 'nova');
    // Compte les plombs juste au moment de l'anneau (ceux du bas sortent vite de l'écran).
    let pellets = 0;
    const events: GameEvent[] = [];
    for (let i = 0; i < 180 && pellets === 0; i++) {
      step(s, events);
      if (events.some((e) => e.type === 'nova')) pellets = s.run.projectiles.filter((p) => p.kind === 'pellet').length;
      events.length = 0;
    }
    expect(pellets).toBe(BALANCE.weapons.nova.count);
  });

  it('Trou de ver : aspire et broie un groupe d’ennemis', () => {
    const s = quietWaves(210, 24);
    equip(s, 'vortex');
    const group = [enemy(s, 'tank', 0.1, 0.5), enemy(s, 'tank', 0.15, 0.52), enemy(s, 'tank', 0.05, 0.55)];
    for (const e of group) e.hp = 1e12;
    const ev = run(s, 4);
    expect(ev.some((e) => e.type === 'vortex')).toBe(true);
    for (const e of group) expect(e.hp).toBeLessThan(1e12);
  });
});

describe('succès : mondes terminés sans dégât', () => {
  it('le monde 1 terminé dans la même partie sans aucun dégât', () => {
    const s = bossPhase(50, 30);
    s.run.noHitFrom = 1;
    clear(s);
    expect(s.meta.flawless).toEqual([0]);
    checkAchievements(s, []);
    expect(s.meta.achievements).toContain('flawless1');
    expect(statValue(s.meta, 'worldCleared', 1)).toBe(1);
  });

  it('un seul dégât pendant le monde et le succès est perdu', () => {
    const s = bossPhase(50, 31);
    s.run.noHitFrom = 1;
    s.run.cannon.invulnerable = 0;
    expect(hitCannon(s, 0.1, 0, 0, [])).toBe(true);
    expect(s.run.noHitFrom).toBe(51);
    clear(s);
    expect(s.meta.flawless).toEqual([]);
  });

  it('une partie qui commence au début d’un monde peut le réussir', () => {
    const s = createState(32);
    s.meta.bestLevel = 120;
    startRun(s, 1);
    expect(s.run.noHitFrom).toBe(51);
  });

  it('les mondes réussis sont sauvegardés', () => {
    const s = createState(33);
    s.meta.flawless = [0, 2];
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s, defaultSettings(), defaultExtra()))));
    expect(back.state.meta.flawless).toEqual([0, 2]);
    expect(deserialize({ version: 4, meta: { flawless: [0, 9, 'x', 0] } }).state.meta.flawless).toEqual([0]);
  });
});

describe('équilibrage de fin de partie', () => {
  it('au-delà de la cadence maximale, la cadence en trop devient des dégâts', () => {
    const w = createState(40).meta.workshop;
    const zero = { damage: 0, fireRate: 0, maxHp: 0 };
    const base = cannonStats(zero, w);
    const fast = cannonStats({ ...zero, fireRate: 200 }, w);
    expect(fast.shotsPerSecond).toBe(BALANCE.cannon.maxShotsPerSecond);
    const raw = BALANCE.cannon.shotsPerSecond * (1 + BALANCE.runUpgrades.fireRate.effectPerLevel) ** 200;
    expect(fast.damage / base.damage).toBeCloseTo(raw / BALANCE.cannon.maxShotsPerSecond, 3);
  });

  it('après le premier monde, PV et dégâts augmentent moins vite d’un niveau à l’autre', () => {
    const from = BALANCE.lateGrowth.fromLevel;
    expect(growLevel(10, 1.2, 1.1, from)).toBeCloseTo(10 * 1.2 ** (from - 1));
    expect(growLevel(10, 1.2, 1.1, from + 3)).toBeCloseTo(10 * 1.2 ** (from - 1) * 1.1 ** 3);
    expect(enemyStats('grunt', from + 1).hp / enemyStats('grunt', from).hp).toBeCloseTo(
      BALANCE.lateGrowth.hp * Math.sqrt(worldRamp(from + 1) / worldRamp(from)),
    );
  });
});
