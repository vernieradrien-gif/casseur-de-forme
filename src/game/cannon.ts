import { BALANCE } from './config';
import type { GameEvent } from './events';
import { aimHalfAngle, cannonDef, cannonStats } from './formulas';
import type { Vec } from './geometry';
import { angleDelta, clamp } from './math';
import { W } from './state';
import type { GameState, Phase, Projectile, ProjectileKind } from './state';

const C = BALANCE.cannon;
const UP = -Math.PI / 2;

/** Phases pendant lesquelles on combat (le canon tire, les capacités sont utilisables). */
export function isFighting(phase: Phase): boolean {
  return phase === 'waves' || phase === 'bossIntro' || phase === 'boss';
}

export function boostMultiplier(state: GameState): number {
  return state.meta.boostTime > 0 ? BALANCE.boost.multiplier : 1;
}

/** Inflige des dégâts au canon (bouclier et invulnérabilité compris). Renvoie true si le coup a porté. */
export function hitCannon(state: GameState, damage: number, x: number, y: number, events: GameEvent[]): boolean {
  const run = state.run;
  const c = run.cannon;
  if (!isFighting(run.phase)) return false;
  if (c.shieldTime > 0) {
    events.push({ type: 'cannonBlocked', x, y });
    return false;
  }
  if (c.invulnerable > 0) return false;
  c.hp = Math.max(0, c.hp - damage);
  c.invulnerable = C.hitInvulnerability;
  if (run.phase === 'boss') run.hitDuringBoss = true;
  events.push({ type: 'cannonHit', damage, x, y });
  if (c.hp <= 0) startDying(state, events);
  return true;
}

/** PV à 0 : explosion du canon au ralenti, puis défaite. */
export function startDying(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  run.resumePhase = run.phase;
  run.phase = 'dying';
  run.phaseTimer = 0;
  run.timeScale = BALANCE.level.dyingTimeScale;
  run.projectiles.length = 0;
  run.weapons.laserActive = 0;
  run.cannon.beamOn = false;
  events.push({ type: 'cannonBurst', x: run.cannon.x, y: run.cannon.y, step: 0 });
}

/** Cible de la visée automatique : l'ennemi le plus menaçant (le plus proche du canon, au-dessus), sinon le boss. */
export function autoAimTarget(state: GameState): Vec | null {
  const run = state.run;
  const c = run.cannon;
  const half = aimHalfAngle(state.meta.abilities.aimAngle);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (const e of run.enemies) {
    if (e.hp <= 0 || e.y > c.y - 0.06 || e.y < 0) continue;
    // Seules les cibles dans le cône de visée comptent.
    if (Math.abs(angleDelta(UP, Math.atan2(e.y - c.y, e.x - c.x))) > half) continue;
    const score = e.y - Math.hypot(e.x - c.x, e.y - c.y) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) return { x: best.x, y: best.y };
  const boss = run.bosses.find((b) => b.hp > 0);
  return boss ? { x: boss.x, y: boss.y } : null;
}

export function updateCannon(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;

  c.invulnerable = Math.max(0, c.invulnerable - dt);
  c.shieldTime = Math.max(0, c.shieldTime - dt);
  c.autoAimTime = Math.max(0, c.autoAimTime - dt);
  for (const id of Object.keys(c.cooldowns) as (keyof typeof c.cooldowns)[]) {
    c.cooldowns[id] = Math.max(0, c.cooldowns[id] - dt);
  }
  if (run.phase === 'dying' || run.phase === 'gameOver') return;

  // Le canon suit le doigt, dans les deux directions.
  const maxMove = C.moveSpeed * dt;
  if (state.input.moveX !== null) c.x += clamp(clamp(state.input.moveX, W.cannonMinX, W.cannonMaxX) - c.x, -maxMove, maxMove);
  if (state.input.moveY !== null) c.y += clamp(clamp(state.input.moveY, W.cannonMinY, W.cannonMaxY) - c.y, -maxMove, maxMove);
  c.x = clamp(c.x, W.cannonMinX, W.cannonMaxX);
  c.y = clamp(c.y, W.cannonMinY, W.cannonMaxY);

  // Tir droit vers le haut, sauf pendant la visée automatique (limitée à un cône).
  let desired = UP;
  if (c.autoAimTime > 0) {
    const t = autoAimTarget(state);
    const half = aimHalfAngle(state.meta.abilities.aimAngle);
    if (t) desired = UP + clamp(angleDelta(UP, Math.atan2(t.y - c.y, t.x - c.x)), -half, half);
  }
  const maxTurn = C.turnSpeed * dt;
  c.angle += clamp(angleDelta(c.angle, desired), -maxTurn, maxTurn);

  if (!isFighting(run.phase)) {
    c.fireTimer = 0;
    c.burstLeft = 0;
    c.beamOn = false;
    return;
  }
  fireCannon(state, dt, events);
}

/** Tir du canon principal selon son type. */
function fireCannon(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  const id = state.meta.cannon;
  const def = cannonDef(id);
  const stats = cannonStats(run.upgrades, state.meta.workshop);
  const rate = stats.shotsPerSecond * def.rate * hazardFireBonus(state);
  const damage = stats.damage * def.damage * boostMultiplier(state);

  if (id === 'beam') {
    // Le rayon est continu : ses dégâts sont appliqués par la simulation (dégâts par seconde).
    c.beamOn = true;
    return;
  }
  c.beamOn = false;

  if (id === 'burst') {
    const n = def.burst ?? 3;
    const interval = n / rate;
    c.fireTimer += dt;
    if (c.fireTimer >= interval) {
      c.fireTimer -= interval;
      c.burstLeft = n;
      c.burstTimer = 0;
    }
    if (c.burstLeft > 0) {
      c.burstTimer -= dt;
      if (c.burstTimer <= 0) {
        volley(state, damage, events);
        c.burstLeft--;
        c.burstTimer = def.burstGap ?? 0.06;
      }
    }
    return;
  }

  const interval = 1 / rate;
  c.fireTimer += dt;
  while (c.fireTimer >= interval) {
    c.fireTimer -= interval;
    volley(state, damage, events);
  }
}

/** Dégâts par seconde du rayon (canon « Rayon »). */
export function beamDps(state: GameState): number {
  const run = state.run;
  const def = cannonDef('beam');
  const stats = cannonStats(run.upgrades, state.meta.workshop);
  const multi = 1 + 0.35 * state.meta.abilities.multishot;
  return stats.shotsPerSecond * def.rate * stats.damage * def.damage * multi * boostMultiplier(state) * hazardFireBonus(state);
}

/** Bonus de cadence de la nébuleuse : le canon tire plus vite à l'intérieur d'un nuage. */
export function hazardFireBonus(state: GameState): number {
  const c = state.run.cannon;
  for (const h of state.run.hazards) {
    if (h.kind === 'cloud' && Math.hypot(h.x - c.x, h.y - c.y) < h.r) return 1 + (BALANCE.worlds[0].bonus ?? 0.4);
  }
  return 1;
}

function projectile(kind: ProjectileKind, x: number, y: number, angle: number, speed: number, damage: number, radius: number): Projectile {
  return {
    kind,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    radius,
    pierce: 0,
    hit: [],
    splash: 0,
    life: 3,
  };
}

/** Une salve : projectiles selon le type de canon et le niveau de Multi-tir. */
function volley(state: GameState, damage: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  const id = state.meta.cannon;
  const def = cannonDef(id);
  const tip = C.radius * 1.6;
  const ox = c.x + Math.cos(c.angle) * tip;
  const oy = c.y + Math.sin(c.angle) * tip;
  const multi = BALANCE.abilities.multishot;
  const level = state.meta.abilities.multishot;

  if (id === 'shotgun') {
    const n = (def.pellets ?? 5) + 2 * level;
    const spread = def.spread ?? 0.5;
    for (let i = 0; i < n; i++) {
      const a = c.angle + spread * (i / (n - 1) - 0.5);
      const p = projectile('pellet', ox, oy, a, C.projectileSpeed * 1.1, damage, C.projectileRadius * 0.8);
      p.life = 0.6;
      run.projectiles.push(p);
    }
    events.push({ type: 'shot', x: ox, y: oy });
    return;
  }

  const share = multi.damageShare?.[level] ?? 1;
  const kind: ProjectileKind = id === 'missile' ? 'missile' : id === 'plasma' ? 'plasma' : 'bullet';
  const speed = def.speed ?? C.projectileSpeed;
  const radius = def.radius ?? C.projectileRadius;
  const shoot = (angle: number, offset: number) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const p = projectile(kind, ox - dy * offset, oy + dx * offset, angle, speed, damage * share, radius);
    if (kind === 'missile') p.splash = def.splash ?? 0.08;
    if (kind === 'plasma') p.pierce = def.pierce ?? 4;
    run.projectiles.push(p);
  };
  if (level >= 2) {
    const a = multi.angle ?? 0.07;
    shoot(c.angle, 0);
    shoot(c.angle - a, 0);
    shoot(c.angle + a, 0);
  } else if (level === 1) {
    const half = (multi.spread ?? 0.03) / 2;
    shoot(c.angle, -half);
    shoot(c.angle, half);
  } else {
    shoot(c.angle, 0);
  }
  events.push({ type: 'shot', x: ox, y: oy });
}
