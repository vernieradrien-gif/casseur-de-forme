import { describe, expect, it } from 'vitest';
import { buyCannon, selectCannon, useAbility } from '../src/game/actions';
import { damageBoss, isComposite, partPosition } from '../src/game/boss';
import { hazardFireBonus } from '../src/game/cannon';
import { BALANCE } from '../src/game/config';
import { spawnEnemy } from '../src/game/enemies';
import type { GameEvent } from '../src/game/events';
import { abilityCooldown, bossHp, bossKindAt, worldRamp, worldTheme } from '../src/game/formulas';
import { blackHolePosition, damageRock } from '../src/game/hazards';
import { checkAchievements } from '../src/game/progress';
import { STEP, step } from '../src/game/simulation';
import { createState } from '../src/game/state';
import type { Enemy, GameState } from '../src/game/state';

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
  run(s, STEP);
  return s;
}

/** Phase boss directe, boss silencieux (ni tirs ni renforts). */
function bossPhase(level = 1, seed = 1): GameState {
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

/** Vagues sans nouvel ennemi ni boss qui tire : pour observer un ennemi précis. */
function quietWaves(level: number, seed: number): GameState {
  const s = at(level, seed);
  s.run.waves.queue = [];
  s.run.enemies = [];
  s.run.waves.time = -1e9;
  for (const b of s.run.bosses) b.fireTimer = 1e9;
  return s;
}

function enemy(s: GameState, kind: Enemy['kind'], x = 0, y = 0.3): Enemy {
  return spawnEnemy(s, s.run.level, { kind, x, y, vx: 0, vy: 1, amp: 0, freq: 0, phase: 0 }, -1);
}

describe('déplacement libre du canon', () => {
  it('le canon suit le doigt en haut, en bas, à gauche et à droite', () => {
    const s = quietWaves(1, 101);
    s.input.moveX = 0.3;
    s.input.moveY = 0.9;
    run(s, 1.5);
    expect(s.run.cannon.x).toBeCloseTo(0.3, 3);
    expect(s.run.cannon.y).toBeCloseTo(0.9, 3);
    // Bornes de l'écran.
    s.input.moveX = -5;
    s.input.moveY = 5;
    run(s, 3);
    expect(s.run.cannon.x).toBeCloseTo(W.cannonMinX, 5);
    expect(s.run.cannon.y).toBeCloseTo(W.cannonMaxY, 5);
  });

  it('toucher le boss : gros dégâts de zone et le canon est repoussé', () => {
    const s = bossPhase(1, 102);
    const boss = s.run.bosses[0];
    const c = s.run.cannon;
    const hp = c.hp;
    // Le doigt va droit sur le boss (qui se déplace).
    const events: GameEvent[] = [];
    let before = 0;
    let after = 0;
    for (let i = 0; i < 120 && after === 0; i++) {
      s.input.moveX = boss.x;
      s.input.moveY = boss.y;
      before = Math.hypot(c.x - boss.x, c.y - boss.y);
      step(s, events);
      if (events.some((e) => e.type === 'cannonCrash')) after = Math.hypot(c.x - boss.x, c.y - boss.y);
      events.length = 0;
    }
    expect(after).toBeGreaterThan(0);
    expect(hp - c.hp).toBeGreaterThanOrEqual(c.maxHp * BALANCE.cannon.bodyHitDamage * 0.99);
    // Repoussé loin du boss.
    expect(after).toBeGreaterThan(before + 0.05);
    expect(c.invulnerable).toBeGreaterThan(0);
  });

  it('toucher le bouclier de vagues blesse aussi', () => {
    const s = quietWaves(1, 103);
    const boss = s.run.bosses[0];
    s.input.moveX = boss.x;
    s.input.moveY = boss.y;
    const ev = run(s, 1.5);
    expect(ev.some((e) => e.type === 'cannonCrash')).toBe(true);
    expect(s.run.cannon.hp).toBeLessThan(s.run.cannon.maxHp);
  });
});

describe('types de canon', () => {
  function firing(id: keyof typeof BALANCE.cannons, seed: number): GameState {
    const s = bossPhase(1, seed);
    s.meta.cannons[id] = true;
    expect(selectCannon(s, id)).toBe(true);
    // Le boss est mis hors de portée pour compter les tirs tranquillement.
    s.run.bosses[0].hp = 1e12;
    s.run.bosses[0].maxHp = 1e12;
    return s;
  }

  it('Rafale : tirs groupés par trois', () => {
    const s = firing('burst', 110);
    // Note l'instant de chaque tir.
    const times: number[] = [];
    let clock = 0;
    const events: GameEvent[] = [];
    for (let i = 0; i < Math.round(4 / STEP); i++) {
      step(s, events);
      clock += STEP;
      for (const e of events) if (e.type === 'shot') times.push(clock);
      events.length = 0;
    }
    expect(times.length).toBeGreaterThanOrEqual(6);
    const gaps = times.slice(1).map((v, i) => v - times[i]);
    const short = gaps.filter((g) => g < 0.1).length;
    const long = gaps.filter((g) => g >= 0.1).length;
    // Deux petits écarts (dans la rafale) pour un grand (entre deux rafales).
    expect(short).toBeGreaterThan(long);
  });

  it('Pompe : une gerbe de plombs en éventail', () => {
    const s = firing('shotgun', 111);
    run(s, 2);
    const pellets = s.run.projectiles.filter((p) => p.kind === 'pellet');
    expect(pellets.length).toBeGreaterThanOrEqual(BALANCE.cannons.shotgun.pellets!);
    const vx = pellets.map((p) => p.vx);
    expect(Math.max(...vx)).toBeGreaterThan(0);
    expect(Math.min(...vx)).toBeLessThan(0);
  });

  it('Rayon : un faisceau continu qui traverse les ennemis', () => {
    const s = quietWaves(1, 112);
    s.meta.cannons.beam = true;
    selectCannon(s, 'beam');
    const c = s.run.cannon;
    const a = enemy(s, 'tank', c.x, 0.8);
    const b = enemy(s, 'tank', c.x, 0.6);
    for (const e of [a, b]) {
      e.vy = 0;
      e.hp = 1e6;
    }
    run(s, 0.5);
    expect(c.beamOn).toBe(true);
    expect(s.run.projectiles).toHaveLength(0);
    expect(a.hp).toBeLessThan(1e6);
    expect(b.hp).toBeLessThan(1e6);
  });

  it('Missiles : tête chercheuse et explosion en zone', () => {
    const s = quietWaves(1, 113);
    s.meta.cannons.missile = true;
    selectCannon(s, 'missile');
    const c = s.run.cannon;
    const a = enemy(s, 'tank', c.x + 0.2, 0.6);
    const b = enemy(s, 'tank', c.x + 0.24, 0.6);
    for (const e of [a, b]) {
      e.vy = 0;
      e.hp = 1e6;
    }
    const ev = run(s, 3);
    expect(ev.some((e) => e.type === 'missileBoom')).toBe(true);
    expect(a.hp).toBeLessThan(1e6);
    expect(b.hp).toBeLessThan(1e6);
  });

  it('Plasma : une grosse sphère qui traverse plusieurs ennemis', () => {
    const s = quietWaves(1, 114);
    s.meta.cannons.plasma = true;
    selectCannon(s, 'plasma');
    const c = s.run.cannon;
    const list = [0.9, 0.75, 0.6].map((y) => enemy(s, 'tank', c.x, y));
    for (const e of list) {
      e.vy = 0;
      e.hp = 1e6;
    }
    run(s, 2.5);
    for (const e of list) expect(e.hp).toBeLessThan(1e6);
  });

  it('déblocage par exploit, achat en gemmes, choix du canon', () => {
    const s = createState(115);
    expect(selectCannon(s, 'burst')).toBe(false);
    s.meta.bestLevel = BALANCE.cannons.burst.unlockValue;
    const ev: GameEvent[] = [];
    checkAchievements(s, ev);
    expect(ev.some((e) => e.type === 'cannonUnlocked' && e.id === 'burst')).toBe(true);
    expect(s.meta.cannons.burst).toBe(true);
    expect(selectCannon(s, 'burst')).toBe(true);
    expect(s.meta.cannon).toBe('burst');
    // Missiles : uniquement en gemmes.
    expect(buyCannon(s, 'missile')).toBe(false);
    s.meta.gems = BALANCE.cannons.missile.gemCost;
    expect(buyCannon(s, 'missile')).toBe(true);
    expect(s.meta.gems).toBe(0);
    expect(s.meta.cannon).toBe('missile');
    expect(buyCannon(s, 'missile')).toBe(false);
    expect(buyCannon(s, 'classic')).toBe(false);
  });
});

describe('nouveaux ennemis de vague', () => {
  it('Tourelle : s’arrête et tire sans bouger', () => {
    const s = quietWaves(5, 120);
    const e = enemy(s, 'turret', 0.1, 0.1);
    const ev = run(s, 5);
    expect(e.vy).toBe(0);
    expect(e.vx).toBe(0);
    expect(e.y).toBeCloseTo(e.ty, 1);
    expect(Math.abs(e.ty - BALANCE.enemies.turret.stopY!)).toBeLessThanOrEqual(0.12);
    expect(ev.filter((x) => x.type === 'enemyShot').length).toBeGreaterThanOrEqual(2);
  });

  it('Mitrailleur : tire en allant de gauche à droite', () => {
    const s = quietWaves(9, 121);
    const e = enemy(s, 'strafer', 0.1, 0.1);
    const xs: number[] = [];
    const ev = run(s, 8, () => xs.push(e.x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
    expect(ev.filter((x) => x.type === 'enemyShot').length).toBeGreaterThanOrEqual(3);
  });
});

describe('super boss en blocs', () => {
  it('tous les 10 niveaux un super boss, tous les 50 un titan', () => {
    expect(bossKindAt(9)).toBe('normal');
    expect(bossKindAt(10)).toBe('super');
    expect(bossKindAt(40)).toBe('super');
    expect(bossKindAt(50)).toBe('mega');
    expect(bossKindAt(100)).toBe('mega');
    const mega = bossPhase(50, 130).run.bosses[0];
    expect(isComposite(mega)).toBe(true);
    expect(mega.parts.filter((p) => p.role === 'gun')).toHaveLength(BALANCE.special.mega.guns);
  });

  it('les blocs blindés ne prennent aucun dégât ; un canon détruit ébranle le cœur', () => {
    const s = bossPhase(10, 131);
    const boss = s.run.bosses[0];
    const armor = boss.parts.find((p) => p.role === 'armor')!;
    const gun = boss.parts.find((p) => p.role === 'gun')!;
    const ev: GameEvent[] = [];
    const pos = partPosition(boss, armor);
    // Tir sur un bloc blindé : rien.
    s.run.projectiles.push({ kind: 'bullet', x: pos.x, y: pos.y + 0.004, vx: 0, vy: -0.01, damage: 5, radius: 0.012, pierce: 0, hit: [], splash: 0, life: 3 });
    const hp = boss.hp;
    ev.push(...run(s, STEP));
    expect(boss.hp).toBe(hp);
    expect(ev.some((e) => e.type === 'bossAbsorb')).toBe(true);
    // Détruire un canon : dégâts au cœur.
    damageBoss(s, boss, gun.hp + 1, 0, 0, ev);
    expect(gun.hp).toBe(0);
    expect(ev.some((e) => e.type === 'partDestroyed')).toBe(true);
    expect(boss.hp).toBeCloseTo(hp - BALANCE.special.super.gunCoreDamage * boss.maxHp, 5);
  });
});

describe('mondes', () => {
  it('chaque monde a son thème ; la difficulté monte vers la fin du monde puis souffle', () => {
    expect(worldTheme(1).id).toBe('nebula');
    expect(worldTheme(51).id).toBe('asteroids');
    expect(worldTheme(101).id).toBe('supernova');
    expect(worldTheme(151).id).toBe('blackhole');
    expect(worldTheme(201).id).toBe('ionstorm');
    expect(BALANCE.campaignLevels).toBe(BALANCE.worlds.length * BALANCE.levelsPerWorld);
    expect(worldRamp(1)).toBe(1);
    expect(worldRamp(49)).toBeGreaterThan(worldRamp(25));
    expect(worldRamp(51)).toBe(1);
    // La montée accélère : la seconde moitié du monde monte plus que la première.
    expect(worldRamp(49) - worldRamp(25)).toBeGreaterThan(worldRamp(25) - worldRamp(1));
    // Le monde suivant repart plus doucement : son premier boss est bien moins solide que le dernier du monde précédent.
    expect(bossHp(51)).toBeLessThan(bossHp(49) / 2);
    expect(bossHp(49)).toBeGreaterThan(bossHp(25) * 1.162 ** 24);
  });

  it('Nébuleuse : dans un nuage, le canon tire plus vite', () => {
    const s = quietWaves(1, 140);
    run(s, 12);
    const cloud = s.run.hazards.find((h) => h.kind === 'cloud');
    expect(cloud).toBeDefined();
    expect(hazardFireBonus(s)).toBe(1);
    cloud!.x = s.run.cannon.x;
    cloud!.y = s.run.cannon.y;
    expect(hazardFireBonus(s)).toBeCloseTo(1 + BALANCE.worlds[0].bonus!);
  });

  it('Astéroïdes : des rochers à détruire, qui blessent au contact', () => {
    const s = quietWaves(51, 141);
    run(s, 8);
    const rocks = s.run.hazards.filter((h) => h.kind === 'rock');
    expect(rocks.length).toBeGreaterThan(0);
    const ev: GameEvent[] = [];
    const coins = s.run.coins;
    damageRock(s, rocks[0], rocks[0].hp + 1, ev);
    expect(ev[0].type).toBe('rockKilled');
    expect(s.run.coins).toBeGreaterThan(coins);
    // Un rocher sur le canon le blesse.
    const hp = s.run.cannon.hp;
    const rock = s.run.hazards.find((h) => h.kind === 'rock' && h.hp > 0);
    if (rock) {
      rock.x = s.run.cannon.x;
      rock.y = s.run.cannon.y;
      run(s, STEP);
      expect(s.run.cannon.hp).toBeLessThan(hp);
    }
  });

  it('Supernova : les éruptions sont annoncées avant de frapper', () => {
    const s = quietWaves(101, 142);
    const ev = run(s, 15);
    const warn = ev.findIndex((e) => e.type === 'hazardWarn');
    const strike = ev.findIndex((e) => e.type === 'hazardStrike');
    expect(warn).toBeGreaterThanOrEqual(0);
    expect(strike).toBeGreaterThan(warn);
  });

  it('Trou noir : il attire le canon', () => {
    const s = quietWaves(151, 143);
    const hole = blackHolePosition(151);
    const c = s.run.cannon;
    c.x = -hole.x;
    c.y = hole.y;
    const d0 = Math.hypot(c.x - hole.x, c.y - hole.y);
    run(s, 1);
    expect(Math.hypot(c.x - hole.x, c.y - hole.y)).toBeLessThan(d0);
  });

  it('Tempête ionique : capacités plus lentes à recharger', () => {
    const s = quietWaves(201, 144);
    s.meta.abilities.shield = 1;
    expect(useAbility(s, 'shield', [])).toBe(true);
    expect(s.run.cannon.cooldowns.shield).toBeCloseTo(abilityCooldown('shield', 1) * BALANCE.worlds[4].cooldownFactor!);
  });
});
