import { damageBoss } from './boss';
import { boostMultiplier, isFighting } from './cannon';
import { BALANCE } from './config';
import type { WeaponId } from './config';
import { damageEnemy } from './enemies';
import type { GameEvent } from './events';
import { cannonStats, weaponPower } from './formulas';
import type { Vec } from './geometry';
import type { Enemy, GameState, Projectile } from './state';

const WP = BALANCE.weapons;

/** Armes équipées et débloquées. */
export function activeWeapons(state: GameState): WeaponId[] {
  return state.meta.equipped.filter((id) => state.meta.weapons[id] > 0);
}

function weaponDamage(state: GameState, id: WeaponId): number {
  const stats = cannonStats(state.run.upgrades, state.meta.workshop, state.meta.cannon);
  return stats.damage * WP[id].damageFactor * weaponPower(state.meta.weapons[id]) * boostMultiplier(state);
}

/** Positions des orbes (coordonnées monde). */
export function orbPositions(state: GameState): Vec[] {
  const def = WP.orbs;
  const run = state.run;
  const n = (def.count ?? 2) + (state.meta.weapons.orbs >= 10 ? 1 : 0) + (state.meta.weapons.orbs >= 20 ? 1 : 0);
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = run.weapons.orbAngle + (i * Math.PI * 2) / n;
    out.push({ x: run.cannon.x + Math.cos(a) * (def.radius ?? 0.1), y: run.cannon.y + Math.sin(a) * (def.radius ?? 0.1) });
  }
  return out;
}

function updateOrbs(state: GameState, dt: number, events: GameEvent[]): void {
  const def = WP.orbs;
  const run = state.run;
  run.weapons.orbAngle = (run.weapons.orbAngle + (def.speed ?? 3) * dt) % (Math.PI * 2);
  const orbs = orbPositions(state);
  const r = def.orbRadius ?? 0.02;
  const dmg = weaponDamage(state, 'orbs');
  for (const o of orbs) {
    for (const e of run.enemies) {
      if (e.hp > 0 && e.orbCd <= 0 && Math.hypot(e.x - o.x, e.y - o.y) < r + e.radius) {
        e.orbCd = def.hitCooldown ?? 0.3;
        damageEnemy(state, e, dmg, events, true);
      }
    }
    for (const b of run.bullets) {
      if (b.damage > 0 && Math.hypot(b.x - o.x, b.y - o.y) < r + b.radius) {
        b.damage = 0;
        events.push({ type: 'bulletDestroyed', x: b.x, y: b.y });
      }
    }
  }
}

function updateLaser(state: GameState, dt: number, events: GameEvent[]): void {
  const def = WP.laser;
  const run = state.run;
  const w = run.weapons;
  if (w.laserActive <= 0) {
    w.laserTimer -= dt;
    if (w.laserTimer <= 0) {
      w.laserActive = def.duration ?? 0.8;
      w.laserTimer = def.cooldown ?? 5;
      events.push({ type: 'laser', x: run.cannon.x });
    }
    return;
  }
  w.laserActive = Math.max(0, w.laserActive - dt);
  const x = run.cannon.x;
  const half = (def.width ?? 0.04) / 2;
  const dmg = weaponDamage(state, 'laser') * dt;
  for (const e of run.enemies) {
    if (e.hp > 0 && e.y < run.cannon.y && Math.abs(e.x - x) < half + e.radius) damageEnemy(state, e, dmg, events, true, true);
  }
  for (const boss of run.bosses) {
    if (boss.hp > 0 && Math.abs(boss.x - x) < half + boss.radius * 0.8) {
      damageBoss(state, boss, dmg, x, boss.y + boss.radius * 0.6, events, { pierce: true, silent: true });
      if (run.phase === 'boss') w.laserAcc += dmg;
    }
  }
  if (w.laserAcc > 0 && (w.laserActive === 0 || Math.floor(w.laserActive / 0.2) !== Math.floor((w.laserActive + dt) / 0.2))) {
    const boss = run.bosses.find((b) => b.hp > 0);
    if (boss) events.push({ type: 'bossHit', x, y: boss.y + boss.radius * 0.6, damage: w.laserAcc, weak: false });
    w.laserAcc = 0;
  }
}

/** Ennemi visible le plus proche d'un point (au-dessus de `maxY`), dans la portée donnée. */
function nearestEnemy(state: GameState, x: number, y: number, range: number, maxY = Infinity): Enemy | null {
  let best: Enemy | null = null;
  let bestD = range;
  for (const e of state.run.enemies) {
    if (e.hp <= 0 || e.y < 0 || e.y > maxY) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Arc électrique : frappe `first`, puis rebondit sur les ennemis les plus proches (×0,7 par rebond).
 * Sert aux Éclairs (armurerie) et au canon Foudre. Renvoie les points touchés.
 */
export function chainFrom(state: GameState, first: Enemy, dmg: number, chains: number, range: number, events: GameEvent[]): Vec[] {
  const hit = new Set<Enemy>();
  const points: Vec[] = [];
  let cur: Enemy | null = first;
  for (let k = 0; k <= chains && cur; k++) {
    const target: Enemy = cur;
    hit.add(target);
    points.push({ x: target.x, y: target.y });
    damageEnemy(state, target, dmg * (k === 0 ? 1 : 0.7), events, true);
    cur = null;
    let bestD = range;
    for (const e of state.run.enemies) {
      if (e.hp <= 0 || hit.has(e) || e.y < 0) continue;
      const d = Math.hypot(e.x - target.x, e.y - target.y);
      if (d < bestD) {
        bestD = d;
        cur = e;
      }
    }
  }
  return points;
}

function updateLightning(state: GameState, dt: number, events: GameEvent[]): void {
  const def = WP.lightning;
  const run = state.run;
  const w = run.weapons;
  w.lightningTimer -= dt;
  if (w.lightningTimer > 0) return;
  const c = run.cannon;
  const origin: Vec = { x: c.x, y: run.cannon.y - BALANCE.cannon.radius };
  const dmg = weaponDamage(state, 'lightning');
  const first = nearestEnemy(state, origin.x, origin.y, Infinity);
  const points: Vec[] = [origin];
  if (first) {
    points.push(...chainFrom(state, first, dmg, def.chains ?? 2, def.range ?? 0.4, events));
  } else {
    const boss = run.bosses.find((b) => b.hp > 0);
    if (!boss || run.phase !== 'boss') {
      w.lightningTimer = 0.25;
      return;
    }
    points.push({ x: boss.x, y: boss.y });
    damageBoss(state, boss, dmg, boss.x, boss.y, events);
  }
  w.lightningTimer = def.cooldown ?? 2.6;
  events.push({ type: 'lightning', points, source: 'weapon' });
}

// ---------------------------------------------------------------- Armes de fin de monde

/** Positions des deux drones, de part et d'autre du canon. */
export function dronePositions(state: GameState): Vec[] {
  const c = state.run.cannon;
  const bob = Math.sin(state.run.time * 3) * 0.008;
  return [-1, 1].map((side) => ({ x: c.x + side * 0.1, y: c.y - 0.03 + side * bob }));
}

function smallShot(x: number, y: number, angle: number, speed: number, damage: number): Projectile {
  return {
    kind: 'bullet',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    radius: BALANCE.cannon.projectileRadius * 0.8,
    pierce: 0,
    hit: [],
    splash: 0,
    life: 2,
    bounces: 0,
  };
}

/** Drones : tirent sur l'ennemi le plus proche devant eux. */
function updateDrones(state: GameState, dt: number, events: GameEvent[]): void {
  const def = WP.drones;
  const run = state.run;
  const w = run.weapons;
  w.droneTimer -= dt;
  if (w.droneTimer > 0) return;
  w.droneTimer = def.cooldown ?? 0.7;
  const dmg = weaponDamage(state, 'drones');
  let fired = false;
  for (const d of dronePositions(state)) {
    const target = nearestEnemy(state, d.x, d.y, def.range ?? 0.7, d.y);
    const boss = run.phase === 'boss' ? run.bosses.find((b) => b.hp > 0) : undefined;
    const aim = target ?? boss;
    if (!aim) continue;
    run.projectiles.push(smallShot(d.x, d.y, Math.atan2(aim.y - d.y, aim.x - d.x), def.speed ?? 1.6, dmg));
    fired = true;
  }
  if (fired) events.push({ type: 'droneShot' });
}

/** Rayon de l'aura de Gel (grandit un peu à chaque niveau). */
export function cryoRadius(state: GameState): number {
  return (WP.cryo.radius ?? 0.2) * (1 + 0.02 * Math.max(0, state.meta.weapons.cryo - 1));
}

/**
 * Gel : facteur de vitesse d'un ennemi ou d'un tir ennemi à cette position (1 = normal).
 * Utilisé par le déplacement des ennemis et des tirs ennemis.
 */
export function cryoFactor(state: GameState, x: number, y: number, bullet: boolean): number {
  const meta = state.meta;
  if (meta.weapons.cryo === 0 || !meta.equipped.includes('cryo') || !isFighting(state.run.phase)) return 1;
  const c = state.run.cannon;
  if (Math.hypot(x - c.x, y - c.y) > cryoRadius(state)) return 1;
  return 1 - (bullet ? (WP.cryo.bulletSlow ?? 0.45) : (WP.cryo.slow ?? 0.4));
}

/** Gel : les ennemis dans l'aura subissent aussi des dégâts continus. */
function updateCryo(state: GameState, dt: number, events: GameEvent[]): void {
  const c = state.run.cannon;
  const r = cryoRadius(state);
  const dmg = weaponDamage(state, 'cryo') * dt;
  for (const e of state.run.enemies) {
    if (e.hp > 0 && Math.hypot(e.x - c.x, e.y - c.y) < r + e.radius) damageEnemy(state, e, dmg, events, true, true);
  }
}

/** Nova : anneau de tirs autour du canon, à intervalle régulier. */
function updateNova(state: GameState, dt: number, events: GameEvent[]): void {
  const def = WP.nova;
  const run = state.run;
  const w = run.weapons;
  w.novaTimer -= dt;
  if (w.novaTimer > 0) return;
  w.novaTimer = def.cooldown ?? 3.2;
  const c = run.cannon;
  const n = def.count ?? 14;
  const dmg = weaponDamage(state, 'nova');
  for (let i = 0; i < n; i++) {
    const p = smallShot(c.x, c.y, (i / n) * Math.PI * 2 + run.time, def.speed ?? 1.2, dmg);
    p.kind = 'pellet';
    p.life = 0.9;
    run.projectiles.push(p);
  }
  events.push({ type: 'nova', x: c.x, y: c.y });
}

/** Trou de ver : un tourbillon attire et broie les ennemis là où ils sont les plus nombreux. */
function updateVortex(state: GameState, dt: number, events: GameEvent[]): void {
  const def = WP.vortex;
  const run = state.run;
  const w = run.weapons;
  if (w.vortexTime > 0) {
    w.vortexTime = Math.max(0, w.vortexTime - dt);
    const r = def.radius ?? 0.12;
    const dmg = weaponDamage(state, 'vortex') * dt;
    for (const e of run.enemies) {
      if (e.hp <= 0) continue;
      const dx = w.vortexX - e.x;
      const dy = w.vortexY - e.y;
      const d = Math.hypot(dx, dy);
      if (d > r * 2.2) continue;
      const pull = Math.min(d, (def.pull ?? 0.5) * dt);
      if (d > 0.001) {
        e.x += (dx / d) * pull;
        e.y += (dy / d) * pull;
      }
      if (d < r + e.radius) damageEnemy(state, e, dmg, events, true, true);
    }
    for (const b of run.bosses) {
      if (b.hp > 0 && Math.hypot(b.x - w.vortexX, b.y - w.vortexY) < r + b.radius) {
        damageBoss(state, b, dmg, w.vortexX, w.vortexY, events, { silent: true });
      }
    }
    return;
  }
  w.vortexTimer -= dt;
  if (w.vortexTimer > 0) return;
  // Centre : l'ennemi qui a le plus de voisins, sinon le boss pendant la phase boss.
  let best: Vec | null = null;
  let bestN = 0;
  for (const e of run.enemies) {
    if (e.hp <= 0 || e.y < 0.05) continue;
    let n = 0;
    for (const o of run.enemies) if (o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < 0.18) n++;
    if (n > bestN) {
      bestN = n;
      best = e;
    }
  }
  const boss = run.phase === 'boss' ? run.bosses.find((b) => b.hp > 0) : undefined;
  if (!best && boss) best = { x: boss.x, y: boss.y };
  if (!best) {
    w.vortexTimer = 0.5;
    return;
  }
  w.vortexX = best.x;
  w.vortexY = best.y;
  w.vortexTime = def.duration ?? 2.5;
  w.vortexTimer = def.cooldown ?? 6;
  events.push({ type: 'vortex', x: best.x, y: best.y });
}

export function updateWeapons(state: GameState, dt: number, events: GameEvent[]): void {
  const w = state.run.weapons;
  if (!isFighting(state.run.phase)) {
    w.laserActive = 0;
    w.vortexTime = 0;
    return;
  }
  for (const id of activeWeapons(state)) {
    switch (id) {
      case 'orbs':
        updateOrbs(state, dt, events);
        break;
      case 'laser':
        updateLaser(state, dt, events);
        break;
      case 'lightning':
        updateLightning(state, dt, events);
        break;
      case 'drones':
        updateDrones(state, dt, events);
        break;
      case 'cryo':
        updateCryo(state, dt, events);
        break;
      case 'nova':
        updateNova(state, dt, events);
        break;
      case 'vortex':
        updateVortex(state, dt, events);
        break;
    }
  }
}
