import {
  BALANCE,
  affordable,
  bossCoins,
  bossDiamonds,
  bulkCost,
  cannonStats,
  enemyStats,
  pickEnemyKind,
  waveCount,
  waveInterval,
} from './formulas';
import type { AbilityId, DiamondUpgradeId, EnemyKind, RunUpgradeId } from './formulas';
import { pointInPolygon, shapeVertices } from './geometry';
import type { ShapeDef, Vec } from './geometry';
import { nextRandom } from './rng';
import { createBoss, createRun } from './state';
import type { Enemy, GameState } from './state';

/** Pas de temps fixe de la simulation : 60 mises à jour par seconde. */
export const STEP = 1 / 60;

export type GameEvent =
  | { type: 'shot' }
  | { type: 'enemyHit'; x: number; y: number; damage: number }
  | { type: 'enemyKilled'; x: number; y: number; kind: EnemyKind; coins: number; gem: boolean }
  | { type: 'bossHit'; x: number; y: number; damage: number }
  | {
      type: 'bossKilled';
      level: number;
      shape: ShapeDef;
      rotation: number;
      coins: number;
      diamonds: number;
      gems: number;
    }
  | { type: 'cannonHit'; damage: number }
  | { type: 'shieldBlock'; x: number; y: number }
  | { type: 'ability'; id: AbilityId }
  | { type: 'levelStart'; level: number }
  | { type: 'gameOver'; level: number };

const W = BALANCE.world;

export function cannonPosition(state: GameState): Vec {
  return { x: state.run.cannon.x, y: W.cannonY };
}

export function bossPosition(): Vec {
  return { x: 0, y: W.bossY };
}

export function bossVertices(state: GameState): Vec[] | null {
  const boss = state.run.boss;
  if (!boss) return null;
  const p = bossPosition();
  return shapeVertices(boss.shape, BALANCE.boss.radius, boss.rotation, p.x, p.y);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Plus petite différence d'angle signée de a vers b. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Fait avancer la simulation d'un pas fixe. Les événements servent au rendu (effets). */
export function step(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  state.time += STEP;
  if (run.phase === 'gameOver') return;

  updateCannon(state, events);
  updateProjectiles(state, events);

  if (run.phase === 'levelClear') {
    run.phaseTimer -= STEP;
    if (run.phaseTimer <= 0) {
      run.level++;
      run.boss = createBoss(run.level);
      run.phase = 'playing';
      events.push({ type: 'levelStart', level: run.level });
    }
    return;
  }

  updateBoss(state);
  updateEnemies(state, events);
}

// ---------------------------------------------------------------- Canon

function updateCannon(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  const cfg = BALANCE.cannon;

  if (state.input.moveX !== null) {
    const target = clamp(state.input.moveX, W.cannonMinX, W.cannonMaxX);
    const maxMove = cfg.moveSpeed * STEP;
    c.x += clamp(target - c.x, -maxMove, maxMove);
  }

  const target = state.input.aim ?? autoAimTarget(state);
  const desired = clamp(Math.atan2(target.y - W.cannonY, target.x - c.x), -Math.PI + 0.15, -0.15);
  const maxTurn = cfg.turnSpeed * STEP;
  c.angle += clamp(angleDelta(c.angle, desired), -maxTurn, maxTurn);

  c.shieldTime = Math.max(0, c.shieldTime - STEP);
  for (const id of Object.keys(c.cooldowns) as AbilityId[]) {
    c.cooldowns[id] = Math.max(0, c.cooldowns[id] - STEP);
  }

  if (run.phase !== 'playing') {
    c.fireTimer = 0;
    return;
  }
  const stats = cannonStats(run.upgrades, state.meta.upgrades);
  const interval = 1 / stats.shotsPerSecond;
  c.fireTimer += STEP;
  while (c.fireTimer >= interval) {
    c.fireTimer -= interval;
    fire(state, stats.damage);
    events.push({ type: 'shot' });
  }
}

/** Visée automatique : l'ennemi le plus proche du canon (le plus bas), sinon le boss. */
function autoAimTarget(state: GameState): Vec {
  let best: Enemy | null = null;
  for (const e of state.run.enemies) {
    if (e.y < W.cannonY - 0.05 && (!best || e.y > best.y)) best = e;
  }
  if (best) return { x: best.x, y: best.y };
  return bossPosition();
}

function fire(state: GameState, damage: number): void {
  const c = state.run.cannon;
  const speed = BALANCE.cannon.projectileSpeed;
  const dx = Math.cos(c.angle);
  const dy = Math.sin(c.angle);
  const tip = BALANCE.cannon.radius * 1.6;
  const ox = c.x + dx * tip;
  const oy = W.cannonY + dy * tip;
  const offsets = state.meta.abilities.doubleShot ? [-1, 1] : [0];
  const half = BALANCE.abilities.doubleShot.spread / 2;
  for (const o of offsets) {
    state.run.projectiles.push({
      x: ox - dy * half * o,
      y: oy + dx * half * o,
      vx: dx * speed,
      vy: dy * speed,
      damage,
    });
  }
}

// ---------------------------------------------------------------- Boss et vagues

function updateBoss(state: GameState): void {
  const boss = state.run.boss;
  if (!boss) return;
  boss.rotation = (boss.rotation + BALANCE.boss.rotationSpeed * STEP) % (Math.PI * 2);

  boss.waveTimer -= STEP;
  if (boss.waveTimer <= 0) {
    boss.spawnQueue += waveCount(boss.level);
    boss.waveTimer += waveInterval(boss.level);
  }
  boss.spawnTimer -= STEP;
  if (boss.spawnQueue > 0 && boss.spawnTimer <= 0) {
    spawnEnemy(state, boss.level);
    boss.spawnQueue--;
    boss.spawnTimer = BALANCE.waves.spawnSpacing;
  }
}

export function spawnEnemy(state: GameState, level: number, forcedKind?: EnemyKind): Enemy {
  const run = state.run;
  const rare = BALANCE.enemies.rare;
  const kind: EnemyKind =
    forcedKind ??
    (level >= rare.fromLevel && nextRandom(state) < BALANCE.rareChance ? 'rare' : pickEnemyKind(level, nextRandom(state)));
  const stats = enemyStats(kind, level);
  const a = Math.PI * (0.15 + 0.7 * nextRandom(state));
  const b = bossPosition();
  const x = b.x + Math.cos(a) * BALANCE.boss.radius;
  const y = b.y + Math.sin(a) * BALANCE.boss.radius;
  const enemy: Enemy = {
    id: run.nextEnemyId++,
    kind,
    x,
    y,
    vx: 0,
    vy: stats.speed,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    coins: stats.coins,
    radius: stats.radius,
    speed: stats.speed,
    age: 0,
    phase: nextRandom(state) < 0.5 ? -1 : 1,
  };
  if (BALANCE.enemies[kind].behavior !== 'zigzag') {
    // Fonce vers la position du canon au moment du lancer.
    const dx = run.cannon.x - x;
    const dy = W.cannonY - y;
    const d = Math.hypot(dx, dy) || 1;
    enemy.vx = (dx / d) * stats.speed;
    enemy.vy = (dy / d) * stats.speed;
  }
  run.enemies.push(enemy);
  return enemy;
}

// ---------------------------------------------------------------- Ennemis

function updateEnemies(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  const cannonR = BALANCE.cannon.radius;
  const kept: Enemy[] = [];

  for (const e of run.enemies) {
    e.age += STEP;
    const def = BALANCE.enemies[e.kind];
    if (def.behavior === 'homing') {
      const want = Math.atan2(W.cannonY - e.y, c.x - e.x);
      const cur = Math.atan2(e.vy, e.vx);
      const turn = ('turnRate' in def ? def.turnRate : 0) * STEP;
      const a = cur + clamp(angleDelta(cur, want), -turn, turn);
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
    } else if (def.behavior === 'zigzag') {
      e.vx = e.phase * Math.sin(e.age * 2.5) * e.speed * 0.9;
      e.vy = e.speed * 0.55;
    }
    e.x += e.vx * STEP;
    e.y += e.vy * STEP;
    if (def.behavior === 'zigzag' && Math.abs(e.x) > W.width / 2 - e.radius) {
      e.x = clamp(e.x, -W.width / 2 + e.radius, W.width / 2 - e.radius);
      e.phase = -e.phase;
    }

    // Collision avec le canon.
    if (e.damage > 0 && Math.hypot(e.x - c.x, e.y - W.cannonY) < e.radius + cannonR) {
      if (c.shieldTime > 0) {
        events.push({ type: 'shieldBlock', x: e.x, y: e.y });
      } else {
        c.hp = Math.max(0, c.hp - e.damage);
        events.push({ type: 'cannonHit', damage: e.damage });
      }
      continue;
    }
    // Sorti du terrain : perdu.
    if (e.y > W.height + 0.1 || Math.abs(e.x) > W.width) continue;
    kept.push(e);
  }
  run.enemies = kept;

  if (c.hp <= 0) {
    run.phase = 'gameOver';
    run.projectiles = [];
    state.meta.runs++;
    events.push({ type: 'gameOver', level: run.level });
  }
}

function killEnemy(state: GameState, e: Enemy, events: GameEvent[]): void {
  const run = state.run;
  const meta = state.meta;
  const coins = e.coins * cannonStats(run.upgrades, meta.upgrades).coinMultiplier;
  run.coins += coins;
  run.kills++;
  meta.totalKills++;
  const gem = e.kind === 'rare';
  if (gem) {
    meta.gems += BALANCE.gems.rareEnemy;
    run.gemsEarned += BALANCE.gems.rareEnemy;
  }
  events.push({ type: 'enemyKilled', x: e.x, y: e.y, kind: e.kind, coins, gem });
}

// ---------------------------------------------------------------- Projectiles

function updateProjectiles(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  const pr = BALANCE.cannon.projectileRadius;
  let poly = run.phase === 'playing' ? bossVertices(state) : null;
  const kept = [];

  outer: for (const p of run.projectiles) {
    p.x += p.vx * STEP;
    p.y += p.vy * STEP;
    if (p.y < -0.1 || p.y > W.height + 0.1 || Math.abs(p.x) > W.width / 2 + 0.1) continue;

    for (const e of run.enemies) {
      if (e.hp > 0 && Math.hypot(p.x - e.x, p.y - e.y) < e.radius + pr) {
        e.hp -= p.damage;
        events.push({ type: 'enemyHit', x: e.x, y: e.y, damage: p.damage });
        if (e.hp <= 0) killEnemy(state, e, events);
        continue outer;
      }
    }

    const boss = run.boss;
    if (boss && poly && pointInPolygon(p, poly)) {
      boss.hp -= p.damage;
      events.push({ type: 'bossHit', x: p.x, y: p.y, damage: p.damage });
      if (boss.hp <= 0) {
        killBoss(state, events);
        poly = null;
      }
      continue;
    }
    kept.push(p);
  }
  run.projectiles = run.phase === 'playing' ? kept : [];
  run.enemies = run.enemies.filter((e) => e.hp > 0);
}

function killBoss(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  const meta = state.meta;
  const boss = run.boss;
  if (!boss) return;
  const level = boss.level;
  const stats = cannonStats(run.upgrades, meta.upgrades);

  const firstClear = level > meta.highestCleared;
  const diamonds = bossDiamonds(level, firstClear);
  const gems = firstClear && level % BALANCE.levelsPerTier === 0 ? BALANCE.gems.tierFirstClear : 0;
  const coins = bossCoins(level) * stats.coinMultiplier;
  meta.diamonds += diamonds;
  meta.gems += gems;
  meta.highestCleared = Math.max(meta.highestCleared, level);
  meta.bestLevel = Math.max(meta.bestLevel, level + 1);
  run.diamondsEarned += diamonds;
  run.gemsEarned += gems;
  run.coins += coins;

  events.push({ type: 'bossKilled', level, shape: boss.shape, rotation: boss.rotation, coins, diamonds, gems });

  // Les ennemis restants explosent (et rapportent leurs pièces).
  for (const e of run.enemies) {
    if (e.hp > 0) {
      e.hp = 0;
      killEnemy(state, e, events);
    }
  }
  run.enemies = [];
  run.boss = null;
  run.phase = 'levelClear';
  run.phaseTimer = BALANCE.boss.nextLevelDelay;
  const c = run.cannon;
  c.hp = Math.min(c.maxHp, c.hp + c.maxHp * BALANCE.cannon.healOnLevelClear);
}

// ---------------------------------------------------------------- Actions du joueur

/** Recalcule les PV max du canon ; un gain de PV max soigne d'autant. */
function refreshMaxHp(state: GameState): void {
  const c = state.run.cannon;
  const maxHp = cannonStats(state.run.upgrades, state.meta.upgrades).maxHp;
  if (maxHp > c.maxHp && state.run.phase !== 'gameOver') c.hp += maxHp - c.maxHp;
  c.maxHp = maxHp;
  c.hp = Math.min(c.hp, maxHp);
}

/** Achète jusqu'à `count` niveaux avec les pièces (Infinity = max). Renvoie le nombre acheté. */
export function buyRunUpgrade(state: GameState, id: RunUpgradeId, count: number): number {
  const run = state.run;
  if (run.phase === 'gameOver') return 0;
  const def = BALANCE.runUpgrades[id];
  const owned = run.upgrades[id];
  const n = Math.min(count, affordable(def, owned, run.coins));
  if (n <= 0) return 0;
  run.coins = Math.max(0, run.coins - bulkCost(def, owned, n));
  run.upgrades[id] = owned + n;
  refreshMaxHp(state);
  return n;
}

/** Achète un niveau d'atelier avec les diamants. */
export function buyDiamondUpgrade(state: GameState, id: DiamondUpgradeId): boolean {
  const meta = state.meta;
  const def = BALANCE.diamondUpgrades[id];
  if (affordable(def, meta.upgrades[id], meta.diamonds) < 1) return false;
  meta.diamonds -= bulkCost(def, meta.upgrades[id], 1);
  meta.upgrades[id]++;
  refreshMaxHp(state);
  return true;
}

export function unlockAbility(state: GameState, id: AbilityId): boolean {
  const meta = state.meta;
  const price = BALANCE.abilities[id].gemCost;
  if (meta.abilities[id] || meta.gems < price) return false;
  meta.gems -= price;
  meta.abilities[id] = true;
  return true;
}

/** Capacités actives (bouclier, onde de choc). Renvoie true si elle a été déclenchée. */
export function useAbility(state: GameState, id: AbilityId, events: GameEvent[]): boolean {
  const run = state.run;
  const c = run.cannon;
  if (!state.meta.abilities[id] || run.phase !== 'playing' || c.cooldowns[id] > 0) return false;
  if (id === 'shield') {
    const def = BALANCE.abilities.shield;
    c.shieldTime = def.duration;
    c.cooldowns.shield = def.cooldown;
  } else if (id === 'shockwave') {
    const def = BALANCE.abilities.shockwave;
    c.cooldowns.shockwave = def.cooldown;
    for (const e of run.enemies) {
      e.hp = 0;
      killEnemy(state, e, events);
    }
    run.enemies = [];
    const boss = run.boss;
    if (boss) {
      const dmg = boss.maxHp * def.bossDamageFraction;
      boss.hp -= dmg;
      events.push({ type: 'bossHit', x: bossPosition().x, y: bossPosition().y, damage: dmg });
      if (boss.hp <= 0) killBoss(state, events);
    }
  } else {
    return false;
  }
  events.push({ type: 'ability', id });
  return true;
}

export function isActiveAbility(id: AbilityId): boolean {
  return 'cooldown' in BALANCE.abilities[id];
}

/** Nouvelle partie au niveau 1 (la progression permanente est conservée). */
export function restartRun(state: GameState): void {
  state.run = createRun(state.meta, 1);
  state.input.aim = null;
  state.input.moveX = null;
}

