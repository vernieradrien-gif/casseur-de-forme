import { boostMultiplier, hitCannon, isFighting } from './cannon';
import { BALANCE } from './config';
import type { GameEvent } from './events';
import { cannonStats, enemyStats } from './formulas';
import { angleDelta, clamp } from './math';
import { addKill, discoverEnemy } from './progress';
import { nextRandom } from './rng';
import { W } from './state';
import type { Enemy, GameState, Spawn } from './state';

const HALF = W.width / 2;

/** Fait apparaître un ennemi ; `vx`, `vy` donnent la direction (multipliée par la vitesse du type). */
export function spawnEnemy(state: GameState, level: number, s: Omit<Spawn, 't'>, wave = -1): Enemy {
  const run = state.run;
  const def = BALANCE.enemies[s.kind];
  const stats = enemyStats(s.kind, level);
  const drift = (nextRandom(state) - 0.5) * 2 * def.drift;
  let amp = s.amp;
  let freq = s.freq;
  let phase = s.phase;
  if ((s.kind === 'weaver' || s.kind === 'rare') && amp === 0) {
    amp = s.kind === 'rare' ? 0.2 : 0.16;
    freq = s.kind === 'rare' ? 3.2 : 2.6;
    phase = nextRandom(state) * Math.PI * 2;
  }
  const e: Enemy = {
    id: run.nextId++,
    kind: s.kind,
    x: s.x,
    y: s.y,
    vx: (s.vx + drift) * stats.speed,
    vy: s.vy * stats.speed,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    coins: stats.coins,
    radius: stats.radius,
    speed: stats.speed,
    age: 0,
    wave,
    amp,
    freq,
    phase,
    mode: 0,
    timer: 0,
    shots: def.shots ?? 0,
    shieldHits: def.shieldHits ?? 0,
    tx: 0,
    ty: 0,
    flash: 0,
    orbCd: 0,
  };
  run.enemies.push(e);
  discoverEnemy(state.meta, s.kind);
  return e;
}

/** Ennemi détruit par le joueur : pièces, statistiques, gemme (étoile dorée), division. */
export function killEnemy(state: GameState, e: Enemy, events: GameEvent[]): void {
  if (e.hp === -Infinity) return;
  const run = state.run;
  const meta = state.meta;
  e.hp = -Infinity;
  const coins = e.coins * cannonStats(run.upgrades, meta.workshop).coinMultiplier * boostMultiplier(state);
  run.coins += coins;
  run.coinsEarned += coins;
  addKill(state, events);
  const gem = e.kind === 'rare';
  if (gem) {
    meta.gems += BALANCE.gems.rareEnemy;
    run.gemsEarned += BALANCE.gems.rareEnemy;
    meta.stats.rareStars++;
  }
  events.push({ type: 'enemyKilled', x: e.x, y: e.y, kind: e.kind, coins, gem, radius: e.radius });
  if (e.kind === 'splitter' && isFighting(run.phase)) {
    for (const side of [-1, 1]) {
      spawnEnemy(state, run.level, { kind: 'grunt', x: e.x + side * e.radius, y: e.y, vx: side * 0.55, vy: 0.85, amp: 0, freq: 0, phase: 0 }, e.wave);
    }
  }
}

/**
 * Dégâts à un ennemi. `pierce` : ignore le bouclier frontal du Blindé (laser, orbes, éclairs).
 * Renvoie false si le coup a été absorbé.
 */
export function damageEnemy(
  state: GameState,
  e: Enemy,
  damage: number,
  events: GameEvent[],
  pierce = false,
  silent = false,
): boolean {
  if (e.hp <= 0) return false;
  if (!pierce && e.shieldHits > 0) {
    e.shieldHits--;
    e.flash = 0.06;
    events.push({ type: 'enemyBlocked', x: e.x, y: e.y + e.radius });
    return false;
  }
  e.hp -= damage;
  e.flash = 0.08;
  if (!silent) events.push({ type: 'enemyHit', x: e.x, y: e.y, damage });
  if (e.hp <= 0) killEnemy(state, e, events);
  return true;
}

function fireAt(state: GameState, x: number, y: number, damage: number, speed: number, events: GameEvent[]): void {
  const c = state.run.cannon;
  const dx = c.x - x;
  const dy = W.cannonY - y;
  const d = Math.hypot(dx, dy) || 1;
  state.run.bullets.push({ x, y, vx: (dx / d) * speed, vy: (dy / d) * speed, damage, radius: BALANCE.boss.bullet.radius });
  events.push({ type: 'enemyShot', x, y });
}

export function updateEnemies(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  const cannonR = BALANCE.cannon.radius;
  const fighting = isFighting(run.phase);

  for (let i = 0; i < run.enemies.length; i++) {
    const e = run.enemies[i];
    if (e.hp <= 0) continue;
    const def = BALANCE.enemies[e.kind];
    e.age += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.orbCd = Math.max(0, e.orbCd - dt);

    switch (e.kind) {
      case 'hunter':
        if (e.y < W.cannonY - 0.12) {
          const want = Math.atan2(W.cannonY - e.y, c.x - e.x);
          const cur = Math.atan2(e.vy, e.vx);
          const turn = (def.turnRate ?? 1) * dt;
          const a = cur + clamp(angleDelta(cur, want), -turn, turn);
          e.vx = Math.cos(a) * e.speed;
          e.vy = Math.sin(a) * e.speed;
        }
        break;
      case 'shooter':
        if (e.mode === 0 && e.y >= (def.stopY ?? 0.6)) {
          e.mode = 1;
          e.timer = 0.5;
          e.vx = 0;
          e.vy = 0;
          e.amp = 0;
        } else if (e.mode === 1) {
          e.timer -= dt;
          if (e.timer <= 0 && fighting) {
            fireAt(state, e.x, e.y + e.radius, e.damage, BALANCE.boss.bullet.speed * 1.1, events);
            e.shots--;
            e.timer = def.fireInterval ?? 1.4;
            if (e.shots <= 0) {
              e.mode = 2;
              e.vy = e.speed * 1.3;
            }
          }
        }
        break;
      case 'dasher':
        if (e.mode === 0 && e.y >= (def.stopY ?? 0.55)) {
          e.mode = 1;
          e.timer = def.aimTime ?? 0.8;
          e.vx = 0;
          e.vy = 0;
          e.amp = 0;
          e.tx = c.x;
          e.ty = W.cannonY;
        } else if (e.mode === 1) {
          e.timer -= dt;
          // Suit le canon pendant la première moitié de la visée, puis verrouille la cible.
          if (e.timer > (def.aimTime ?? 0.8) * 0.45) e.tx = c.x;
          if (e.timer <= 0) {
            e.mode = 2;
            const dx = e.tx - e.x;
            const dy = e.ty - e.y;
            const d = Math.hypot(dx, dy) || 1;
            const s = def.dashSpeed ?? 1;
            e.vx = (dx / d) * s;
            e.vy = (dy / d) * s;
          }
        }
        break;
      case 'rare':
        if (e.mode === 0 && e.age > (def.fleeAfter ?? 3.5)) {
          e.mode = 1;
          e.vy = -e.speed * 1.4;
        }
        break;
    }

    e.x += e.vx * dt + e.amp * e.freq * Math.cos(e.freq * e.age + e.phase) * dt;
    e.y += e.vy * dt;
    // Les ennemis qui ondulent rebondissent sur les bords.
    if (e.amp > 0 && Math.abs(e.x) > HALF - e.radius) {
      e.x = clamp(e.x, -HALF + e.radius, HALF - e.radius);
      e.phase += Math.PI;
      e.vx = -e.vx;
    }

    // Collision avec le canon : l'ennemi s'écrase.
    if (fighting && e.damage > 0 && Math.hypot(e.x - c.x, e.y - W.cannonY) < e.radius + cannonR) {
      e.hp = -1;
      events.push({ type: 'enemyCrash', x: e.x, y: e.y, kind: e.kind, radius: e.radius });
      hitCannon(state, e.damage, e.x, e.y, events);
      continue;
    }
    // Sorti du terrain (en bas, en haut pour l'étoile qui s'enfuit, ou sur les côtés).
    if (e.y > W.height + 0.1 || e.y < -0.45 || Math.abs(e.x) > HALF + 0.3) e.hp = -1;
  }
}
