import { BALANCE } from './config';
import type { GameEvent } from './events';
import { cannonStats } from './formulas';
import type { Vec } from './geometry';
import { angleDelta, clamp } from './math';
import { W } from './state';
import type { GameState, Phase } from './state';

const C = BALANCE.cannon;

/** Phases pendant lesquelles on combat (le canon tire, les capacités sont utilisables). */
export function isFighting(phase: Phase): boolean {
  return phase === 'waves' || phase === 'bossIntro' || phase === 'boss';
}

export function boostMultiplier(state: GameState): number {
  return state.meta.boostTime > 0 ? BALANCE.boost.multiplier : 1;
}

/** Inflige des dégâts au canon (bouclier et invulnérabilité compris). */
export function hitCannon(state: GameState, damage: number, x: number, y: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  if (!isFighting(run.phase)) return;
  if (c.shieldTime > 0) {
    events.push({ type: 'cannonBlocked', x, y });
    return;
  }
  if (c.invulnerable > 0) return;
  c.hp = Math.max(0, c.hp - damage);
  c.invulnerable = C.hitInvulnerability;
  if (run.phase === 'boss') run.hitDuringBoss = true;
  events.push({ type: 'cannonHit', damage, x, y });
  if (c.hp <= 0) startDying(state, events);
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
  events.push({ type: 'cannonBurst', x: run.cannon.x, y: W.cannonY, step: 0 });
}

/** Cible de la visée automatique : l'ennemi le plus bas (le plus menaçant), sinon une zone faible du boss. */
export function autoAimTarget(state: GameState): Vec | null {
  const run = state.run;
  let best: Vec | null = null;
  let bestY = -Infinity;
  for (const e of run.enemies) {
    if (e.hp > 0 && e.y < W.cannonY - 0.08 && e.y > 0 && e.y > bestY) {
      bestY = e.y;
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

  if (state.input.moveX !== null) {
    const target = clamp(state.input.moveX, W.cannonMinX, W.cannonMaxX);
    const maxMove = C.moveSpeed * dt;
    c.x += clamp(target - c.x, -maxMove, maxMove);
  }

  // Tir droit vers le haut, sauf pendant la visée automatique.
  let desired = -Math.PI / 2;
  if (c.autoAimTime > 0) {
    const t = autoAimTarget(state);
    if (t) desired = clamp(Math.atan2(t.y - W.cannonY, t.x - c.x), -Math.PI + 0.25, -0.25);
  }
  const maxTurn = C.turnSpeed * dt;
  c.angle += clamp(angleDelta(c.angle, desired), -maxTurn, maxTurn);

  if (!isFighting(run.phase)) {
    c.fireTimer = 0;
    return;
  }
  const stats = cannonStats(run.upgrades, state.meta.workshop);
  const interval = 1 / stats.shotsPerSecond;
  c.fireTimer += dt;
  while (c.fireTimer >= interval) {
    c.fireTimer -= interval;
    fire(state, stats.damage * boostMultiplier(state), events);
  }
}

function fire(state: GameState, damage: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  const speed = C.projectileSpeed;
  const tip = C.radius * 1.6;
  const ox = c.x + Math.cos(c.angle) * tip;
  const oy = W.cannonY + Math.sin(c.angle) * tip;
  const multi = BALANCE.abilities.multishot;
  const level = state.meta.abilities.multishot;
  const share = multi.damageShare?.[level] ?? 1;
  const shoot = (angle: number, offset: number) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    run.projectiles.push({ x: ox - dy * offset, y: oy + dx * offset, vx: dx * speed, vy: dy * speed, damage: damage * share });
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
