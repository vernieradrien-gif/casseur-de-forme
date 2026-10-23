import {
  bossTouches,
  bossVertices,
  createBoss,
  damageBoss,
  damagePart,
  isComposite,
  outerRingRadius,
  partAt,
  updateBosses,
  waveShieldRadius,
  weakPointPositions,
} from './boss';
import { beamDps, boostMultiplier, hitCannon, isFighting, updateCannon } from './cannon';
import { BALANCE } from './config';
import { damageEnemy, killEnemy, updateEnemies } from './enemies';
import type { GameEvent } from './events';
import {
  bossCoins,
  bossDiamonds,
  cannonStats,
  grandBossGems,
  healOnClear,
  isGrandBoss,
  newEnemyAt,
  tierIndex,
  wavesForLevel,
} from './formulas';
import { pointInPolygon } from './geometry';
import type { Vec } from './geometry';
import { damageRock, updateHazards } from './hazards';
import { angleDelta, clamp, compact } from './math';
import { addDaily, addToSet, checkAchievements } from './progress';
import { nextRandom } from './rng';
import { W } from './state';
import type { Boss, BossPart, Enemy, GameState, Projectile } from './state';
import { startWave, updateWaves } from './waves';
import { updateWeapons } from './weapons';

/** Pas de temps fixe de la simulation : 60 mises à jour par seconde. */
export const STEP = 1 / 60;
const L = BALANCE.level;
const HALF = W.width / 2;
/** Vérification des succès toutes les N mises à jour. */
const ACHIEVEMENT_CHECK_STEPS = 30;

export type { GameEvent } from './events';

/** Prépare le niveau courant : boss protégé par son bouclier, puis vagues. */
export function beginLevel(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  const level = run.level;
  const grand = isGrandBoss(level);
  run.golden = !grand && nextRandom(state) < BALANCE.boss.goldenChance;
  run.phase = 'waves';
  run.phaseTimer = 0;
  run.hitDuringBoss = false;
  run.bosses = [createBoss(state, level, run.golden)];
  run.waves.total = wavesForLevel(level);
  run.hazards = run.hazards.filter((h) => h.kind === 'cloud');
  run.hazardTimer = 1.5;
  events.push({ type: 'levelStart', level, grand, golden: run.golden, newEnemy: newEnemyAt(level) });
  startWave(state, 0, L.firstWaveDelay, events);
}

/** Fait avancer la simulation d'un pas fixe. Les événements servent au rendu et au son. */
export function step(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  state.time += STEP;
  if (run.phase === 'gameOver') return;
  if (run.phase === 'waves' && run.waves.total === 0) beginLevel(state, events);

  const dt = STEP * run.timeScale;
  run.time += dt;
  if (isFighting(run.phase) && state.meta.boostTime > 0) state.meta.boostTime = Math.max(0, state.meta.boostTime - STEP);

  updateCannon(state, dt, events);
  updateHazards(state, dt, events);
  updateWeapons(state, dt, events);
  updateBeam(state, dt, events);
  updateProjectiles(state, dt, events);
  updateBullets(state, dt, events);
  updateEnemies(state, dt, events);
  updateBosses(state, dt, events);
  checkBossContact(state, events);
  updatePhase(state, dt, events);

  compact(run.enemies, (e) => e.hp > 0);
  compact(run.bullets, (b) => b.damage > 0);
  compact(run.bosses, (b) => b.hp > 0);
  if (Math.round(state.time / STEP) % ACHIEVEMENT_CHECK_STEPS === 0) checkAchievements(state, events);
}

function updatePhase(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  switch (run.phase) {
    case 'waves':
      if (updateWaves(state, dt, events)) {
        run.phase = 'bossIntro';
        run.phaseTimer = L.bossIntroTime;
        const b = run.bosses[0];
        if (b) events.push({ type: 'shieldDown', x: b.x, y: b.y, radius: waveShieldRadius(b) });
      }
      break;
    case 'bossIntro':
      run.phaseTimer -= dt;
      if (run.phaseTimer <= 0) {
        run.phase = 'boss';
        run.phaseTimer = 0;
      }
      break;
    case 'boss':
      run.phaseTimer += dt;
      if (run.bosses.every((b) => b.hp <= 0)) clearLevel(state, events);
      break;
    case 'levelClear':
      run.phaseTimer -= dt;
      if (run.phaseTimer <= 0) {
        run.level++;
        run.waves.total = 0;
        beginLevel(state, events);
      }
      break;
    case 'dying': {
      // Explosion du canon en plusieurs temps (temps réel, la scène est au ralenti), puis courte attente.
      const before = run.phaseTimer;
      run.phaseTimer += STEP;
      const bursts = [0.45, 0.9];
      bursts.forEach((t, i) => {
        if (before < t && run.phaseTimer >= t) events.push({ type: 'cannonBurst', x: run.cannon.x, y: run.cannon.y, step: i + 1 });
      });
      if (before < L.dyingDuration * 0.75 && run.phaseTimer >= L.dyingDuration * 0.75) {
        events.push({ type: 'cannonDestroyed', x: run.cannon.x, y: run.cannon.y });
      }
      if (run.phaseTimer >= L.dyingDuration + L.defeatDelay) {
        run.phase = 'gameOver';
        run.timeScale = 1;
        events.push({ type: 'gameOver', level: run.level });
      }
      break;
    }
  }
}

/** Boss vaincu : les ennemis restants explosent, récompenses, soin, niveau suivant. */
function clearLevel(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  const meta = state.meta;
  const level = run.level;
  for (const e of run.enemies) if (e.hp > 0) killEnemy(state, e, events);
  run.bullets.length = 0;
  run.hazards = run.hazards.filter((h) => h.kind === 'cloud' || h.kind === 'hole');

  const firstClear = level > meta.highestCleared;
  const diamonds = bossDiamonds(level, firstClear);
  let gems = firstClear ? grandBossGems(level) : 0;
  const coins = bossCoins(level, run.golden) * cannonStats(run.upgrades, meta.workshop).coinMultiplier * boostMultiplier(state);
  meta.diamonds += diamonds;
  run.diamondsEarned += diamonds;
  run.coins += coins;
  run.coinsEarned += coins;
  meta.highestCleared = Math.max(meta.highestCleared, level);
  meta.bestLevel = Math.max(meta.bestLevel, level + 1);
  meta.stats.bossKills++;
  const tier = tierIndex(level);
  if (level % BALANCE.special.megaEvery === 0) {
    meta.stats.megaBosses++;
    addToSet(meta.collection.special, 'mega');
  } else if (level % BALANCE.special.superEvery === 0) {
    meta.stats.superBosses++;
    addToSet(meta.collection.special, 'super');
  } else {
    addToSet(meta.collection.bosses, tier);
  }
  if (run.golden) {
    meta.stats.goldenBosses++;
    addToSet(meta.collection.golden, tier);
  }
  if (!run.hitDuringBoss) meta.stats.noHitBosses++;
  addDaily(state, 'bosses', 1, events);
  addDaily(state, 'levels', 1, events);
  if (level === BALANCE.campaignLevels && !meta.campaignComplete) {
    meta.campaignComplete = true;
    gems += BALANCE.gems.campaignComplete;
    events.push({ type: 'campaignComplete', gems: BALANCE.gems.campaignComplete });
  }
  meta.gems += gems;
  run.gemsEarned += gems;

  const c = run.cannon;
  c.hp = Math.min(c.maxHp, c.hp + c.maxHp * healOnClear(meta.workshop));
  c.autoAimTime = 0;
  run.phase = 'levelClear';
  run.phaseTimer = L.nextLevelDelay;
  events.push({ type: 'levelClear', level, coins, diamonds, gems, golden: run.golden });
  checkAchievements(state, events);
}

// ---------------------------------------------------------------- Contact canon / boss

/** Le canon qui touche le boss ou son bouclier encaisse de gros dégâts de zone et recule. */
function checkBossContact(state: GameState, events: GameEvent[]): void {
  const run = state.run;
  if (!isFighting(run.phase)) return;
  const c = run.cannon;
  const shielded = run.phase !== 'boss';
  for (const b of run.bosses) {
    if (!bossTouches(b, c.x, c.y, BALANCE.cannon.radius, shielded)) continue;
    const dx = c.x - b.x;
    const dy = c.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = BALANCE.cannon.knockback;
    c.x = clamp(c.x + (dx / d) * k * 0.5, W.cannonMinX, W.cannonMaxX);
    c.y = clamp(c.y + Math.max(0.5, dy / d) * k, W.cannonMinY, W.cannonMaxY);
    if (c.shieldTime <= 0 && c.invulnerable <= 0) {
      events.push({ type: 'cannonCrash', x: c.x, y: c.y });
      hitCannon(state, c.maxHp * BALANCE.cannon.bodyHitDamage, c.x, c.y - BALANCE.cannon.radius, events);
      c.invulnerable = Math.max(c.invulnerable, BALANCE.cannon.bodyHitInvulnerability);
    }
    break;
  }
}

// ---------------------------------------------------------------- Rayon

interface RayHit {
  enemy?: Enemy;
  boss?: Boss;
  part?: BossPart | null;
  rock?: GameState['run']['hazards'][number];
  x: number;
  y: number;
}

/** Ce que le rayon (ou un laser) rencontre en premier en partant du canon dans la direction donnée. */
function raycast(state: GameState, x0: number, y0: number, angle: number, width: number, pierceEnemies: boolean): { hits: RayHit[]; end: Vec } {
  const run = state.run;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const hits: RayHit[] = [];
  const touched = new Set<number>();
  const shielded = run.phase !== 'boss';
  for (let s = 0.04; s < 2; s += 0.012) {
    const x = x0 + dx * s;
    const y = y0 + dy * s;
    if (y < -0.05 || Math.abs(x) > HALF + 0.05) return { hits, end: { x, y } };
    for (const e of run.enemies) {
      if (e.hp <= 0 || touched.has(e.id)) continue;
      if (Math.hypot(e.x - x, e.y - y) < e.radius + width / 2) {
        touched.add(e.id);
        hits.push({ enemy: e, x, y });
        if (!pierceEnemies) return { hits, end: { x, y } };
      }
    }
    for (const h of run.hazards) {
      if (h.kind === 'rock' && h.hp > 0 && Math.hypot(h.x - x, h.y - y) < h.r + width / 2) {
        hits.push({ rock: h, x, y });
        return { hits, end: { x, y } };
      }
    }
    for (const b of run.bosses) {
      if (b.hp <= 0) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (shielded) {
        if (d < waveShieldRadius(b)) {
          hits.push({ boss: b, x, y });
          return { hits, end: { x, y } };
        }
        continue;
      }
      if (isComposite(b)) {
        const part = partAt(b, x, y, width / 2);
        if (part) {
          hits.push({ boss: b, part, x, y });
          return { hits, end: { x, y } };
        }
      } else if (d < (b.rings > 0 ? outerRingRadius(b) : b.radius * 0.85)) {
        hits.push({ boss: b, x, y });
        return { hits, end: { x, y } };
      }
    }
  }
  return { hits, end: { x: x0 + dx * 2, y: y0 + dy * 2 } };
}

/** Canon « Rayon » : dégâts continus, traverse les ennemis, s'arrête sur le boss. */
function updateBeam(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  if (!c.beamOn || !isFighting(run.phase)) return;
  const width = BALANCE.cannons.beam.width ?? 0.028;
  const tip = BALANCE.cannon.radius * 1.4;
  const { hits, end } = raycast(state, c.x + Math.cos(c.angle) * tip, c.y + Math.sin(c.angle) * tip, c.angle, width, true);
  c.beamTop = end.y;
  const dmg = beamDps(state) * dt;
  const tick = Math.floor(run.time / 0.2) !== Math.floor((run.time - dt) / 0.2);
  for (const h of hits) {
    if (h.enemy) damageEnemy(state, h.enemy, dmg, events, true, !tick);
    else if (h.rock) damageRock(state, h.rock, dmg, events);
    else if (h.boss && h.part) damagePart(state, h.boss, h.part, dmg, h.x, h.y, events, !tick);
    else if (h.boss) damageBoss(state, h.boss, dmg, h.x, h.y, events, { silent: !tick });
  }
}

// ---------------------------------------------------------------- Tirs du canon

function nearestTarget(state: GameState, p: Projectile): Vec | null {
  let best: Vec | null = null;
  let bestD = Infinity;
  for (const e of state.run.enemies) {
    if (e.hp <= 0 || e.y > p.y + 0.05) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) return best;
  const b = state.run.bosses.find((x) => x.hp > 0);
  return b ? { x: b.x, y: b.y } : null;
}

/** Missile : explosion qui touche aussi les ennemis proches. */
function explode(state: GameState, p: Projectile, events: GameEvent[], except?: Enemy): void {
  for (const e of state.run.enemies) {
    if (e.hp > 0 && e !== except && Math.hypot(e.x - p.x, e.y - p.y) < p.splash + e.radius) damageEnemy(state, e, p.damage * 0.6, events, true);
  }
  events.push({ type: 'missileBoom', x: p.x, y: p.y, radius: p.splash });
}

function countWeakHit(state: GameState, events: GameEvent[]): void {
  state.meta.stats.weakHits++;
  addDaily(state, 'weakHits', 1, events);
}

function updateProjectiles(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const wpR = BALANCE.boss.weakPointRadius;
  const shielded = run.phase === 'waves' || run.phase === 'bossIntro';
  const missileTurn = (BALANCE.cannons.missile.turnRate ?? 5) * dt;
  // Géométrie des boss classiques calculée une fois par pas.
  const geo = run.bosses.map((b) => {
    if (isComposite(b)) return { boss: b, poly: [] as Vec[], weak: [] as Vec[] };
    const poly = bossVertices(b);
    return { boss: b, poly, weak: weakPointPositions(b, poly) };
  });

  compact(run.projectiles, (p) => {
    p.life -= dt;
    if (p.life <= 0) return false;
    if (p.kind === 'missile') {
      const t = nearestTarget(state, p);
      if (t) {
        const cur = Math.atan2(p.vy, p.vx);
        const a = cur + clamp(angleDelta(cur, Math.atan2(t.y - p.y, t.x - p.x)), -missileTurn, missileTurn);
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < -0.1 || p.y > W.height + 0.1 || Math.abs(p.x) > HALF + 0.1) return false;
    const pr = p.radius;

    for (const e of run.enemies) {
      if (e.hp <= 0 || Math.abs(p.x - e.x) > e.radius + pr || Math.abs(p.y - e.y) > e.radius + pr) continue;
      if (Math.hypot(p.x - e.x, p.y - e.y) >= e.radius + pr) continue;
      if (p.kind === 'plasma') {
        if (p.hit.includes(e.id)) continue;
        p.hit.push(e.id);
        damageEnemy(state, e, p.damage, events, true);
        p.pierce--;
        if (p.pierce <= 0) return false;
        continue;
      }
      damageEnemy(state, e, p.damage, events);
      if (p.kind === 'missile') explode(state, p, events, e);
      return false;
    }

    for (const h of run.hazards) {
      if (h.kind === 'rock' && h.hp > 0 && Math.hypot(p.x - h.x, p.y - h.y) < h.r + pr) {
        damageRock(state, h, p.damage, events);
        if (p.kind === 'missile') explode(state, p, events);
        return false;
      }
    }

    for (const g of geo) {
      const b = g.boss;
      if (b.hp <= 0) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (shielded) {
        if (d < waveShieldRadius(b)) {
          damageBoss(state, b, p.damage, p.x, p.y, events);
          return false;
        }
        continue;
      }
      if (isComposite(b)) {
        if (d > b.span + 0.08) continue;
        const part = partAt(b, p.x, p.y, pr * 0.5);
        if (!part) continue;
        damagePart(state, b, part, p.damage, p.x, p.y, events);
        if (part.role === 'core') countWeakHit(state, events);
        if (p.kind === 'missile') explode(state, p, events);
        return false;
      }
      if (d > b.radius * 1.6 + 0.1) continue;
      if (b.rings > 0) {
        if (d < outerRingRadius(b)) {
          damageBoss(state, b, p.damage, p.x, p.y, events);
          return false;
        }
        continue;
      }
      if (g.weak.some((w) => Math.hypot(p.x - w.x, p.y - w.y) < wpR + pr)) {
        damageBoss(state, b, p.damage, p.x, p.y, events, { weak: true });
        countWeakHit(state, events);
        if (p.kind === 'missile') explode(state, p, events);
        return false;
      }
      if (pointInPolygon(p, g.poly)) {
        damageBoss(state, b, p.damage, p.x, p.y, events);
        if (p.kind === 'missile') explode(state, p, events);
        return false;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------- Tirs ennemis

function updateBullets(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const c = run.cannon;
  const hitR = BALANCE.cannon.radius * 0.85;
  const fighting = isFighting(run.phase);
  for (const b of run.bullets) {
    if (b.damage <= 0) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > W.height + 0.05 || b.y < -0.1 || Math.abs(b.x) > HALF + 0.05) {
      b.damage = 0;
      continue;
    }
    if (fighting && Math.hypot(b.x - c.x, b.y - c.y) < hitR + b.radius) {
      hitCannon(state, b.damage, b.x, b.y, events);
      b.damage = 0;
    }
  }
}
