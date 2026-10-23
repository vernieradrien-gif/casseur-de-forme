import { damageBoss } from './boss';
import { boostMultiplier, isFighting } from './cannon';
import { BALANCE } from './config';
import type { WeaponId } from './config';
import { damageEnemy } from './enemies';
import type { GameEvent } from './events';
import { cannonStats, weaponPower } from './formulas';
import type { Vec } from './geometry';
import type { Enemy, GameState } from './state';

const WP = BALANCE.weapons;

/** Armes équipées et débloquées. */
export function activeWeapons(state: GameState): WeaponId[] {
  return state.meta.equipped.filter((id) => state.meta.weapons[id] > 0);
}

function weaponDamage(state: GameState, id: WeaponId): number {
  const stats = cannonStats(state.run.upgrades, state.meta.workshop);
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

function updateLightning(state: GameState, dt: number, events: GameEvent[]): void {
  const def = WP.lightning;
  const run = state.run;
  const w = run.weapons;
  w.lightningTimer -= dt;
  if (w.lightningTimer > 0) return;
  const c = run.cannon;
  const origin: Vec = { x: c.x, y: run.cannon.y - BALANCE.cannon.radius };
  const range = def.range ?? 0.4;
  const hit = new Set<Enemy>();
  const points: Vec[] = [origin];
  let from = origin;
  const dmg = weaponDamage(state, 'lightning');
  for (let k = 0; k <= (def.chains ?? 2); k++) {
    let best: Enemy | null = null;
    let bestD = k === 0 ? Infinity : range;
    for (const e of run.enemies) {
      if (e.hp <= 0 || hit.has(e) || e.y < 0) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) break;
    hit.add(best);
    points.push({ x: best.x, y: best.y });
    from = { x: best.x, y: best.y };
    damageEnemy(state, best, dmg * (k === 0 ? 1 : 0.7), events, true);
  }
  if (hit.size === 0) {
    const boss = run.bosses.find((b) => b.hp > 0);
    if (!boss || run.phase !== 'boss') {
      w.lightningTimer = 0.25;
      return;
    }
    points.push({ x: boss.x, y: boss.y });
    damageBoss(state, boss, dmg, boss.x, boss.y, events);
  }
  w.lightningTimer = def.cooldown ?? 2.6;
  events.push({ type: 'lightning', points });
}

export function updateWeapons(state: GameState, dt: number, events: GameEvent[]): void {
  if (!isFighting(state.run.phase)) {
    state.run.weapons.laserActive = 0;
    return;
  }
  for (const id of activeWeapons(state)) {
    if (id === 'orbs') updateOrbs(state, dt, events);
    else if (id === 'laser') updateLaser(state, dt, events);
    else updateLightning(state, dt, events);
  }
}
