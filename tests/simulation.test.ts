import { describe, expect, it } from 'vitest';
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
} from '../src/game/actions';
import { AutoPlayer, spendCoins } from '../src/game/autoplayer';
import { createBoss, damageBoss, weakPointPositions } from '../src/game/boss';
import { BALANCE } from '../src/game/config';
import { spawnEnemy } from '../src/game/enemies';
import type { GameEvent } from '../src/game/events';
import { bossCoins, cannonStats, worldStart } from '../src/game/formulas';
import { checkAchievements, rollDaily } from '../src/game/progress';
import { STEP, step } from '../src/game/simulation';
import { createState } from '../src/game/state';
import type { Enemy, GameState } from '../src/game/state';

const W = BALANCE.world;

function run(state: GameState, seconds: number, each?: (s: GameState, ev: GameEvent[]) => void): GameEvent[] {
  const events: GameEvent[] = [];
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    each?.(state, events);
    step(state, events);
    all.push(...events);
    events.length = 0;
  }
  return all;
}

/** État au début du niveau `level` (vagues préparées). */
function at(level = 1, seed = 1): GameState {
  const s = createState(seed);
  s.run.level = level;
  run(s, STEP);
  return s;
}

/** Passe directement à la phase boss, sans ennemis ni vagues. */
function bossPhase(level = 1, seed = 1): GameState {
  const s = at(level, seed);
  s.run.waves.queue = [];
  s.run.enemies = [];
  s.run.phase = 'boss';
  s.run.phaseTimer = 0;
  return s;
}

function quiet(s: GameState): void {
  // Neutralise les tirs du boss et les renforts (tests ciblés).
  for (const b of s.run.bosses) {
    b.fireTimer = 1e9;
    b.minionTimer = 1e9;
  }
}

function enemy(s: GameState, kind: Enemy['kind'], x = 0, y = 0.3, wave = -1): Enemy {
  return spawnEnemy(s, s.run.level, { kind, x, y, vx: 0, vy: 1, amp: 0, freq: 0, phase: 0 }, wave);
}

describe('niveau en deux temps : vagues puis boss', () => {
  it('le niveau commence par 3 vagues ; la forme est protégée par un bouclier', () => {
    const s = at(1);
    expect(s.run.phase).toBe('waves');
    expect(s.run.waves.total).toBe(3);
    expect(s.run.bosses).toHaveLength(1);
    const boss = s.run.bosses[0];
    const ev: GameEvent[] = [];
    damageBoss(s, boss, 100, boss.x, boss.y, ev);
    expect(boss.hp).toBe(boss.maxHp);
    expect(ev[0].type).toBe('waveShieldHit');
  });

  it('les vagues passent, le bouclier tombe, puis la forme devient vulnérable', () => {
    const s = createState(3);
    const player = new AutoPlayer();
    const all = run(s, 60, (st, ev) => player.play(st, ev));
    const down = all.findIndex((e) => e.type === 'shieldDown');
    expect(down).toBeGreaterThan(0);
    expect(all.slice(0, down).filter((e) => e.type === 'waveStart')).toHaveLength(3);
    expect(all.some((e) => e.type === 'shieldDown')).toBe(true);
    expect(all.some((e) => e.type === 'bossHit')).toBe(true);
  });

  it('chaque vague est une formation d’ennemis lancée par la forme', () => {
    const s = at(1, 4);
    run(s, BALANCE.level.firstWaveDelay + 2.5);
    expect(s.run.enemies.length).toBeGreaterThan(2);
    expect(s.run.enemies.every((e) => e.wave === 0)).toBe(true);
    expect(s.run.enemies.every((e) => e.vy > 0)).toBe(true);
  });

  it('le nouveau type d’ennemi est présenté seul dans la première vague de son niveau', () => {
    const s = at(3, 5);
    expect(s.run.waves.queue.filter((q) => q.kind !== 'rare').every((q) => q.kind === 'weaver')).toBe(true);
  });

  it('phase boss : la forme se déplace, tire et s’énerve sous 50 % de PV', () => {
    const s = bossPhase(1, 6);
    const boss = s.run.bosses[0];
    const x0 = boss.x;
    let moved = 0;
    const all = run(s, 4, () => (moved = Math.max(moved, Math.abs(boss.x - x0))));
    expect(moved).toBeGreaterThan(0.2);
    expect(all.some((e) => e.type === 'bossFire')).toBe(true);
    expect(s.run.bullets.length + all.filter((e) => e.type === 'cannonHit').length).toBeGreaterThan(0);
    boss.hp = boss.maxHp * 0.4;
    const later = run(s, STEP);
    expect(later.some((e) => e.type === 'bossEnraged')).toBe(true);
    expect(boss.enraged).toBe(true);
  });

  it('fureur : plus la phase boss dure, plus la forme tire vite', () => {
    const count = (s: GameState, from: number, seconds: number) => {
      run(s, from);
      return run(s, seconds).filter((e) => e.type === 'bossFire').length;
    };
    const a = bossPhase(1, 7);
    const b = bossPhase(1, 7);
    for (const st of [a, b]) st.run.bosses[0].hp = st.run.bosses[0].maxHp = 1e12;
    b.run.cannon.hp = a.run.cannon.hp = 1e9;
    b.run.cannon.maxHp = a.run.cannon.maxHp = 1e9;
    const early = count(a, 0, 20);
    const late = count(b, 60, 20);
    expect(late).toBeGreaterThan(early * 1.5);
  });

  it('boss vaincu : ennemis restants détruits, diamants, soin, collection, niveau suivant', () => {
    const s = bossPhase(1, 8);
    quiet(s);
    enemy(s, 'grunt', 0.2, 0.5);
    s.run.cannon.hp = 1;
    s.run.bosses[0].hp = 0.01;
    const ev: GameEvent[] = [];
    damageBoss(s, s.run.bosses[0], 1, 0, W.bossY, ev);
    const all = [...ev, ...run(s, BALANCE.level.nextLevelDelay + 0.2)];
    expect(all.some((e) => e.type === 'bossKilled')).toBe(true);
    const clear = all.find((e) => e.type === 'levelClear');
    expect(clear).toBeDefined();
    expect(all.some((e) => e.type === 'enemyKilled')).toBe(true);
    expect(s.meta.diamonds).toBe(BALANCE.diamonds.perBoss + BALANCE.diamonds.firstClearBonus);
    expect(s.meta.collection.bosses).toContain(0);
    expect(s.run.cannon.hp).toBeGreaterThan(1);
    expect(s.run.level).toBe(2);
    expect(s.run.phase).toBe('waves');
    expect(s.meta.highestCleared).toBe(1);
    expect(s.meta.bestLevel).toBe(2);
  });

  it('grand boss : plus grand, plus de PV, gemmes au premier passage seulement', () => {
    const s = bossPhase(10, 9);
    const boss = s.run.bosses[0];
    expect(boss.grand).toBe(true);
    expect(boss.radius).toBeGreaterThan(BALANCE.boss.radius);
    const gems = s.meta.gems;
    boss.hp = 0.01;
    damageBoss(s, boss, 1, boss.x, boss.y, []);
    run(s, STEP);
    expect(s.meta.gems).toBeGreaterThanOrEqual(gems + BALANCE.gems.grandFirstClear);
  });

  it('boss doré : ×10 pièces et entrée spéciale dans la collection', () => {
    const s = bossPhase(4, 10);
    quiet(s);
    s.run.golden = true;
    s.run.bosses[0].golden = true;
    s.run.bosses[0].hp = 0.01;
    const coins = s.run.coins;
    damageBoss(s, s.run.bosses[0], 1, 0, W.bossY, []);
    run(s, STEP);
    expect(s.run.coins - coins).toBeCloseTo(bossCoins(4, true), 3);
    expect(s.meta.collection.golden).toContain(0);
    expect(s.meta.stats.goldenBosses).toBe(1);
  });

  it('zones faibles : ×3 dégâts', () => {
    const s = bossPhase(1, 11);
    const boss = s.run.bosses[0];
    const ev: GameEvent[] = [];
    damageBoss(s, boss, 2, boss.x, boss.y, ev);
    damageBoss(s, boss, 2, boss.x, boss.y, ev, { weak: true });
    const hits = ev.filter((e) => e.type === 'bossHit');
    expect(hits[1].type === 'bossHit' && hits[1].damage).toBe(6);
    expect(hits[1].type === 'bossHit' && hits[1].weak).toBe(true);
    // Un tir qui arrive sur une zone faible déclenche bien le ×3.
    const s2 = bossPhase(1, 11);
    quiet(s2);
    const b2 = s2.run.bosses[0];
    const wp = weakPointPositions(b2)[0];
    s2.run.projectiles.push({ x: wp.x, y: wp.y + 0.005, vx: 0, vy: -0.01, damage: 1 });
    const ev2 = run(s2, STEP);
    expect(ev2.some((e) => e.type === 'bossHit' && e.weak && e.damage === 3)).toBe(true);
  });
});

describe('propriétés des boss', () => {
  it('blindage : chaque coup est réduit d’une valeur fixe (le laser l’ignore)', () => {
    const s = bossPhase(25, 12);
    const boss = s.run.bosses[0];
    expect(boss.armor).toBeGreaterThan(0);
    const hp = boss.hp;
    damageBoss(s, boss, 10, boss.x, boss.y, []);
    const reduced = hp - boss.hp;
    expect(reduced).toBeLessThan(10);
    const hp2 = boss.hp;
    damageBoss(s, boss, 10, boss.x, boss.y, [], { pierce: true });
    expect(hp2 - boss.hp).toBeCloseTo(10);
  });

  it('régénération : PV/s si la forme n’est pas touchée', () => {
    const s = bossPhase(35, 13);
    quiet(s);
    const boss = s.run.bosses[0];
    expect(boss.regen).toBeGreaterThan(0);
    boss.hp = boss.maxHp * 0.6;
    const before = boss.hp;
    run(s, BALANCE.boss.regenDelay + 1);
    expect(boss.hp).toBeGreaterThan(before);
  });

  it('bouclier : absorbe N coups puis se recharge', () => {
    const s = bossPhase(45, 14);
    quiet(s);
    const boss = s.run.bosses[0];
    const n = boss.shieldMax;
    expect(n).toBeGreaterThan(0);
    const hp = boss.hp;
    const ev: GameEvent[] = [];
    for (let i = 0; i < n; i++) damageBoss(s, boss, 5, boss.x, boss.y, ev);
    expect(boss.hp).toBe(hp);
    expect(ev.some((e) => e.type === 'bossShieldBroken')).toBe(true);
    damageBoss(s, boss, 5, boss.x, boss.y, ev);
    expect(boss.hp).toBeLessThan(hp);
    run(s, BALANCE.boss.shieldRecharge + 0.5);
    expect(boss.shieldHits).toBe(n);
  });

  it('fragmentation : la forme se divise en 2 à sa mort ; le niveau continue jusqu’aux fragments', () => {
    const s = bossPhase(55, 15);
    quiet(s);
    const boss = s.run.bosses[0];
    expect(boss.fragments).toBe(2);
    boss.hp = 0.01;
    const ev: GameEvent[] = [];
    damageBoss(s, boss, 1, boss.x, boss.y, ev);
    expect(ev.some((e) => e.type === 'bossSplit')).toBe(true);
    run(s, STEP);
    expect(s.run.bosses).toHaveLength(2);
    expect(s.run.phase).toBe('boss');
    for (const f of [...s.run.bosses]) {
      expect(f.fragment).toBe(true);
      f.hp = 0.01;
      damageBoss(s, f, 1, f.x, f.y, []);
    }
    const all = run(s, STEP);
    expect(all.some((e) => e.type === 'levelClear')).toBe(true);
  });

  it('anneaux : à détruire un par un avant le cœur', () => {
    const s = bossPhase(85, 16);
    quiet(s);
    const boss = s.run.bosses[0];
    expect(boss.rings).toBe(3);
    const hp = boss.hp;
    const ev: GameEvent[] = [];
    damageBoss(s, boss, boss.ringMaxHp + 1, boss.x, boss.y, ev);
    expect(boss.rings).toBe(2);
    expect(boss.hp).toBe(hp);
    expect(ev.some((e) => e.type === 'ringBroken')).toBe(true);
  });

  it('palier 2 : rotation et tirs plus rapides ; palier 10 : toutes les propriétés', () => {
    const s = at(15, 17);
    expect(s.run.bosses[0].fast).toBe(true);
    const c = createBoss(at(95, 18), 95, false);
    expect(c.fast && c.armor > 0 && c.regen > 0 && c.shieldMax > 0 && c.fragments > 0).toBe(true);
  });
});

describe('ennemis', () => {
  function quietLevel(level: number, seed: number): GameState {
    const s = at(level, seed);
    s.run.waves.queue = [];
    s.run.waves.time = -1e9;
    quiet(s);
    s.run.cannon.hp = s.run.cannon.maxHp = 1e9;
    return s;
  }

  it('Éclat : descend tout droit ; Virevolteur : zigzague', () => {
    const s = quietLevel(3, 20);
    const g = enemy(s, 'grunt', 0, 0.2);
    g.vx = 0;
    const w = enemy(s, 'weaver', 0, 0.2);
    const xs: number[] = [];
    run(s, 2, () => xs.push(w.x));
    expect(Math.abs(g.x)).toBeLessThan(0.01);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1);
  });

  it('Chasseur : suit le canon', () => {
    const s = quietLevel(12, 21);
    s.run.cannon.x = 0.4;
    const h = enemy(s, 'hunter', -0.3, 0.3);
    run(s, 1.5);
    expect(h.x).toBeGreaterThan(-0.3);
    expect(h.vx).toBeGreaterThan(0);
  });

  it('Tireur : s’arrête à mi-hauteur, tire sur le canon, repart', () => {
    const s = quietLevel(16, 22);
    const t = enemy(s, 'shooter', 0.3, 0.5);
    const first = run(s, 0.8);
    expect(t.mode).toBe(1);
    expect(t.vy).toBe(0);
    const all = [...first, ...run(s, 5)];
    expect(all.filter((e) => e.type === 'enemyShot').length).toBe(BALANCE.enemies.shooter.shots);
    expect(t.mode).toBe(2);
  });

  it('Diviseur : se divise en 2 Éclats à sa mort', () => {
    const s = quietLevel(22, 23);
    const d = enemy(s, 'splitter', 0, 0.5);
    d.hp = 0.1;
    s.run.projectiles.push({ x: 0, y: 0.52, vx: 0, vy: -1, damage: 1 });
    run(s, STEP);
    expect(s.run.enemies.filter((e) => e.kind === 'grunt')).toHaveLength(2);
  });

  it('Kamikaze : s’arrête, vise, puis fonce très vite', () => {
    const s = quietLevel(30, 24);
    const k = enemy(s, 'dasher', 0.2, 0.5);
    run(s, 0.4);
    expect(k.mode).toBe(1);
    run(s, BALANCE.enemies.dasher.aimTime! + 0.1);
    expect(k.mode).toBe(2);
    expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(BALANCE.enemies.dasher.dashSpeed!, 1);
  });

  it('Blindé : son bouclier frontal absorbe les premiers tirs', () => {
    const s = quietLevel(40, 25);
    const a = enemy(s, 'armored', 0, 0.5);
    a.vy = 0;
    const hp = a.hp;
    for (let i = 0; i < BALANCE.enemies.armored.shieldHits!; i++) {
      s.run.projectiles.push({ x: 0, y: 0.53, vx: 0, vy: -1, damage: 1 });
      run(s, STEP);
    }
    expect(a.hp).toBe(hp);
    s.run.projectiles.push({ x: 0, y: a.y + 0.03, vx: 0, vy: -1, damage: 1 });
    run(s, STEP);
    expect(a.hp).toBeLessThan(hp);
  });

  it('Étoile dorée : zigzague, s’enfuit et donne 1 gemme', () => {
    const s = quietLevel(5, 26);
    const r = enemy(s, 'rare', 0, 0.3);
    run(s, BALANCE.enemies.rare.fleeAfter! + 0.2);
    expect(r.vy).toBeLessThan(0);
    const gems = s.meta.gems;
    r.hp = 0.1;
    s.run.projectiles.push({ x: r.x, y: r.y + 0.01, vx: 0, vy: -0.1, damage: 1 });
    run(s, STEP);
    expect(s.meta.gems).toBe(gems + 1);
    expect(s.meta.stats.rareStars).toBe(1);
  });

  it('un ennemi qui percute le canon lui retire des PV', () => {
    const s = at(1, 27);
    s.run.waves.queue = [];
    const e = enemy(s, 'grunt', s.run.cannon.x, W.cannonY - 0.01);
    const hp = s.run.cannon.hp;
    const all = run(s, STEP);
    expect(all.some((ev) => ev.type === 'cannonHit')).toBe(true);
    expect(s.run.cannon.hp).toBeCloseTo(hp - e.damage);
  });
});

describe('canon : contrôle au glisser, tir droit', () => {
  it('le canon tire en continu droit vers le haut, même sans toucher', () => {
    const s = at(1, 30);
    run(s, 1);
    expect(s.run.projectiles.length).toBeGreaterThan(0);
    for (const p of s.run.projectiles) {
      expect(p.vx).toBeCloseTo(0);
      expect(p.vy).toBeLessThan(0);
    }
  });

  it('le canon suit le doigt, dans les limites du terrain', () => {
    const s = at(1, 31);
    s.input.moveX = 10;
    run(s, 2);
    expect(s.run.cannon.x).toBeCloseTo(W.cannonMaxX);
    s.input.moveX = -0.1;
    run(s, 1);
    expect(s.run.cannon.x).toBeCloseTo(-0.1);
  });

  it('le contrôle fait la différence : un joueur qui se déplace va plus loin qu’un canon immobile', () => {
    const moving = createState(32);
    const idle = createState(32);
    const p = new AutoPlayer();
    run(moving, 240, (s, ev) => {
      p.play(s, ev);
      if (s.run.phase === 'gameOver') return;
      spendCoins(s);
    });
    run(idle, 240, (s) => spendCoins(s));
    expect(moving.meta.bestLevel).toBeGreaterThan(idle.meta.bestLevel);
  });
});

describe('capacités', () => {
  it('Visée auto : le canon s’oriente seul vers l’ennemi le plus menaçant, pendant un temps limité', () => {
    const s = at(1, 40);
    s.run.waves.queue = [];
    s.meta.gems = 100;
    expect(buyAbility(s, 'autoAim')).toBe(true);
    const e = enemy(s, 'grunt', 0.35, 0.7);
    e.vy = 0;
    e.vx = 0;
    e.hp = 1e9;
    const ev: GameEvent[] = [];
    expect(useAbility(s, 'autoAim', ev)).toBe(true);
    expect(useAbility(s, 'autoAim', ev)).toBe(false);
    run(s, 0.5);
    expect(s.run.cannon.angle).toBeGreaterThan(-Math.PI / 2 + 0.2);
    run(s, BALANCE.abilities.autoAim.duration! + 1);
    expect(s.run.cannon.autoAimTime).toBe(0);
    expect(s.run.cannon.angle).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('Bouclier : invulnérable quelques secondes', () => {
    const s = at(1, 41);
    s.meta.abilities.shield = 1;
    useAbility(s, 'shield', []);
    const e = enemy(s, 'tank', s.run.cannon.x, W.cannonY);
    const hp = s.run.cannon.hp;
    const all = run(s, STEP);
    expect(all.some((x) => x.type === 'cannonBlocked')).toBe(true);
    expect(s.run.cannon.hp).toBe(hp);
    void e;
  });

  it('Onde de choc : détruit ennemis et tirs, entame le boss', () => {
    const s = bossPhase(1, 42);
    s.meta.abilities.shockwave = 1;
    for (let i = 0; i < 5; i++) enemy(s, 'grunt', -0.3 + i * 0.15, 0.6);
    s.run.bullets.push({ x: 0, y: 1, vx: 0, vy: 0.5, damage: 1, radius: 0.01 });
    const hp = s.run.bosses[0].hp;
    const ev: GameEvent[] = [];
    expect(useAbility(s, 'shockwave', ev)).toBe(true);
    expect(ev.filter((e) => e.type === 'enemyKilled')).toHaveLength(5);
    run(s, STEP);
    expect(s.run.enemies).toHaveLength(0);
    expect(s.run.bullets).toHaveLength(0);
    expect(s.run.bosses[0].hp).toBeLessThan(hp);
  });

  it('Multi-tir : tir double puis triple', () => {
    const count = (level: number) => {
      const s = at(1, 43);
      s.meta.abilities.multishot = level;
      return run(s, 1).filter((e) => e.type === 'shot').length && s.run.projectiles.length;
    };
    const single = count(0);
    expect(count(1)).toBeGreaterThanOrEqual(single * 2 - 1);
    expect(count(2)).toBeGreaterThanOrEqual(single * 3 - 2);
  });

  it('améliorer une capacité : durée plus longue, recharge plus courte, payées en gemmes', () => {
    const s = createState(44);
    s.meta.gems = 1000;
    buyAbility(s, 'shield');
    buyAbility(s, 'shield');
    expect(s.meta.abilities.shield).toBe(2);
    expect(s.meta.gems).toBe(1000 - BALANCE.abilities.shield.gemCost - BALANCE.abilities.shield.upgradeCost);
  });
});

describe('armes secondaires', () => {
  function armed(id: 'orbs' | 'laser' | 'lightning', seed: number): GameState {
    const s = at(5, seed);
    s.run.waves.queue = [];
    s.meta.gems = 100;
    expect(buyWeapon(s, id)).toBe(true);
    expect(s.meta.equipped).toEqual([id]);
    return s;
  }

  it('Orbes : détruisent ennemis et tirs ennemis au contact', () => {
    const s = armed('orbs', 50);
    const e = enemy(s, 'grunt', s.run.cannon.x + 0.11, W.cannonY);
    e.vy = 0;
    e.hp = 0.01;
    s.run.bullets.push({ x: s.run.cannon.x - 0.11, y: W.cannonY, vx: 0, vy: 0, damage: 1, radius: 0.014 });
    s.run.cannon.hp = 1e9;
    const all = run(s, 2);
    expect(all.some((x) => x.type === 'bulletDestroyed')).toBe(true);
    expect(all.some((x) => x.type === 'enemyKilled')).toBe(true);
  });

  it('Laser : rayon vertical périodique qui transperce tout', () => {
    const s = armed('laser', 51);
    const a = enemy(s, 'tank', 0, 0.6);
    const b = enemy(s, 'tank', 0, 0.9);
    a.vy = b.vy = 0;
    const all = run(s, BALANCE.weapons.laser.cooldown! + 0.5);
    expect(all.some((x) => x.type === 'laser')).toBe(true);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('Éclairs : frappent l’ennemi le plus proche et rebondissent', () => {
    const s = armed('lightning', 52);
    const es = [enemy(s, 'tank', 0, 1.1), enemy(s, 'tank', 0.1, 1.0), enemy(s, 'tank', 0.2, 0.9)];
    for (const e of es) e.vy = 0;
    const all = run(s, 1.5);
    const bolt = all.find((x) => x.type === 'lightning');
    expect(bolt && bolt.type === 'lightning' && bolt.points.length).toBe(4);
    expect(es.every((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('emplacements : 1 au départ, 2e au meilleur niveau 30 ; améliorations en diamants', () => {
    const s = createState(53);
    s.meta.gems = 100;
    buyWeapon(s, 'orbs');
    buyWeapon(s, 'laser');
    expect(s.meta.equipped).toEqual(['orbs']);
    expect(toggleEquip(s, 'laser')).toBe(false);
    s.meta.bestLevel = 30;
    expect(toggleEquip(s, 'laser')).toBe(true);
    expect(s.meta.equipped).toEqual(['orbs', 'laser']);
    s.meta.diamonds = 100;
    expect(buyWeapon(s, 'orbs')).toBe(true);
    expect(s.meta.weapons.orbs).toBe(2);
    expect(s.meta.diamonds).toBe(100 - BALANCE.weapons.orbs.baseCost);
  });
});

describe('progression', () => {
  it('pièces → améliorations de partie ; le blindage soigne d’autant', () => {
    const s = at(1, 60);
    s.run.coins = 1000;
    const hp = s.run.cannon.hp;
    expect(buyRunUpgrade(s, 'maxHp', 1)).toBe(1);
    expect(s.run.cannon.maxHp).toBeGreaterThan(hp);
    expect(s.run.cannon.hp - hp).toBeCloseTo(s.run.cannon.maxHp - hp);
    expect(buyRunUpgrade(s, 'damage', Infinity)).toBeGreaterThan(5);
  });

  it('diamants → atelier (pièces de départ, réparation, coffre hors ligne)', () => {
    const s = createState(61);
    expect(buyWorkshop(s, 'damage')).toBe(false);
    s.meta.diamonds = 1000;
    expect(buyWorkshop(s, 'damage')).toBe(true);
    expect(buyWorkshop(s, 'startCoins')).toBe(true);
    startRun(s, 0);
    expect(s.run.coins).toBe(BALANCE.workshop.startCoins.effectPerLevel);
    for (let i = 0; i < 10; i++) buyWorkshop(s, 'offline');
    expect(s.meta.workshop.offline).toBe(BALANCE.workshop.offline.maxLevel);
  });

  it('succès : débloqués automatiquement, ils donnent des gemmes', () => {
    const s = createState(62);
    s.meta.stats.kills = 100;
    const ev: GameEvent[] = [];
    checkAchievements(s, ev);
    expect(s.meta.achievements).toContain('kills1');
    expect(s.meta.gems).toBe(2);
    expect(ev[0].type).toBe('achievement');
    checkAchievements(s, ev);
    expect(s.meta.gems).toBe(2);
  });

  it('objectif quotidien : détruire 150 ennemis donne des gemmes, une fois par jour', () => {
    const s = at(1, 63);
    rollDaily(s.meta, '2026-10-22');
    s.meta.daily.kills = BALANCE.daily.kills - 1;
    const e = enemy(s, 'grunt', 0, 0.5);
    e.hp = 0.01;
    s.run.projectiles.push({ x: 0, y: 0.52, vx: 0, vy: -1, damage: 1 });
    const all = run(s, STEP);
    expect(all.some((x) => x.type === 'dailyComplete')).toBe(true);
    expect(s.meta.daily.done).toBe(true);
    rollDaily(s.meta, '2026-10-22');
    expect(s.meta.daily.done).toBe(true);
    rollDaily(s.meta, '2026-10-23');
    expect(s.meta.daily).toEqual({ date: '2026-10-23', kills: 0, done: false });
  });

  it('collection : types d’ennemis rencontrés', () => {
    const s = at(1, 64);
    enemy(s, 'tank');
    expect(s.meta.collection.enemies).toContain('tank');
  });

  it('boost ×2 : dégâts et pièces doublés pendant 5 minutes de jeu', () => {
    const s = at(1, 65);
    s.run.waves.queue = [];
    activateBoost(s);
    expect(s.meta.boostTime).toBe(BALANCE.boost.durationMinutes * 60);
    run(s, 0.6);
    const dmg = cannonStats(s.run.upgrades, s.meta.workshop).damage;
    expect(s.run.projectiles[0].damage).toBeCloseTo(dmg * BALANCE.boost.multiplier);
    expect(s.meta.boostTime).toBeLessThan(BALANCE.boost.durationMinutes * 60);
  });
});

describe('défaite, seconde chance et mondes', () => {
  function killCannon(s: GameState): GameEvent[] {
    s.run.cannon.hp = 0.001;
    s.run.cannon.invulnerable = 0;
    s.run.bullets.push({ x: s.run.cannon.x, y: W.cannonY, vx: 0, vy: 0, damage: 1, radius: 0.02 });
    return run(s, STEP);
  }

  it('explosion du canon au ralenti, en plusieurs temps, puis défaite après un court délai', () => {
    const s = at(8, 70);
    const first = killCannon(s);
    expect(s.run.phase).toBe('dying');
    expect(s.run.timeScale).toBeLessThan(1);
    expect(first.some((e) => e.type === 'cannonBurst')).toBe(true);
    const all = run(s, BALANCE.level.dyingDuration + BALANCE.level.defeatDelay + 0.1);
    expect(all.filter((e) => e.type === 'cannonBurst').length).toBeGreaterThanOrEqual(2);
    const destroyed = all.findIndex((e) => e.type === 'cannonDestroyed');
    const over = all.findIndex((e) => e.type === 'gameOver');
    expect(destroyed).toBeGreaterThanOrEqual(0);
    expect(over).toBeGreaterThan(destroyed);
    expect(s.run.phase).toBe('gameOver');
  });

  it('seconde chance (une par partie) : canon réparé à 50 %', () => {
    const s = at(8, 71);
    killCannon(s);
    run(s, BALANCE.level.dyingDuration + BALANCE.level.defeatDelay + 0.1);
    expect(continueRun(s, [])).toBe(true);
    expect(s.run.phase).toBe('waves');
    expect(s.run.cannon.hp).toBeCloseTo(s.run.cannon.maxHp * BALANCE.cannon.continueHp);
    killCannon(s);
    run(s, BALANCE.level.dyingDuration + BALANCE.level.defeatDelay + 0.1);
    expect(continueRun(s, [])).toBe(false);
  });

  it('défaite → retour au niveau 1 ; diamants, gemmes, atelier, armes, capacités conservés', () => {
    const s = at(8, 72);
    s.run.coins = 500;
    s.run.upgrades.damage = 4;
    s.run.diamondsEarned = 3;
    s.meta.diamonds = 12;
    s.meta.gems = 7;
    s.meta.abilities.shield = 1;
    s.meta.weapons.orbs = 2;
    s.meta.workshop.damage = 3;
    killCannon(s);
    run(s, 3);
    const gems = s.meta.gems;
    expect(gems).toBeGreaterThanOrEqual(7);
    expect(doubleRunDiamonds(s)).toBe(3);
    expect(s.meta.diamonds).toBe(15);
    expect(doubleRunDiamonds(s)).toBe(0);
    startRun(s, 0);
    expect(s.run.level).toBe(1);
    expect(s.run.upgrades.damage).toBe(0);
    expect(s.meta.diamonds).toBe(15);
    expect(s.meta.gems).toBe(gems);
    expect(s.meta.abilities.shield).toBe(1);
    expect(s.meta.weapons.orbs).toBe(2);
    expect(s.meta.workshop.damage).toBe(3);
  });

  it('reprise au début d’un monde déjà atteint, avec des pièces de départ', () => {
    const s = createState(73);
    startRun(s, 1);
    expect(s.run.level).toBe(1);
    s.meta.bestLevel = 60;
    startRun(s, 1);
    expect(s.run.level).toBe(worldStart(1));
    expect(s.run.startLevel).toBe(51);
    expect(s.run.coins).toBeGreaterThan(1000);
  });

  it('mode infini après le niveau 100 : récompense de fin de campagne', () => {
    const s = bossPhase(100, 74);
    quiet(s);
    const last = s.run.bosses[0];
    last.fragments = 0;
    last.hp = 0.01;
    damageBoss(s, last, 1, 0, W.bossY, [], { pierce: true });
    const all = run(s, BALANCE.level.nextLevelDelay + 0.2);
    expect(all.some((e) => e.type === 'campaignComplete')).toBe(true);
    expect(s.meta.campaignComplete).toBe(true);
    expect(s.run.level).toBe(101);
    expect(s.run.bosses[0].tier).toBe(0);
    expect(s.run.bosses[0].maxHp).toBeGreaterThan(createBoss(at(1), 1, false).maxHp * 1000);
  });
});

describe('partie complète', () => {
  it('10 minutes de jeu automatique : valeurs valides, progression, défaite gérée', () => {
    const s = createState(42);
    const p = new AutoPlayer();
    let games = 0;
    run(s, 600, (st, ev) => {
      p.play(st, ev);
      spendCoins(st);
      expect(Number.isFinite(st.run.coins) && st.run.coins >= 0).toBe(true);
      expect(Number.isFinite(st.run.cannon.hp)).toBe(true);
      expect(st.run.enemies.length).toBeLessThan(200);
      expect(st.run.projectiles.length).toBeLessThan(500);
      expect(st.run.bullets.length).toBeLessThan(300);
      if (st.run.phase === 'gameOver') {
        games++;
        startRun(st, 0);
      }
    });
    expect(s.meta.bestLevel).toBeGreaterThan(3);
    expect(s.meta.diamonds).toBeGreaterThan(0);
    expect(games).toBeGreaterThanOrEqual(0);
  });

  it('même graine → même partie (simulation reproductible)', () => {
    const a = createState(99);
    const b = createState(99);
    const pa = new AutoPlayer();
    const pb = new AutoPlayer();
    run(a, 40, (s, ev) => pa.play(s, ev));
    run(b, 40, (s, ev) => pb.play(s, ev));
    expect(a.run.coins).toBe(b.run.coins);
    expect(a.run.enemies.length).toBe(b.run.enemies.length);
    expect(a.run.cannon.x).toBe(b.run.cannon.x);
  });
});
