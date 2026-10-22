import { bossVertices, createBoss, damageBoss, outerRingRadius, updateBosses, waveShieldRadius, weakPointPositions } from './boss';
import { boostMultiplier, hitCannon, isFighting, updateCannon } from './cannon';
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
import { compact } from './math';
import { addToSet, checkAchievements } from './progress';
import { nextRandom } from './rng';
import { W } from './state';
import type { GameState } from './state';
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
  updateWeapons(state, dt, events);
  updateProjectiles(state, dt, events);
  updateBullets(state, dt, events);
  updateEnemies(state, dt, events);
  updateBosses(state, dt, events);
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
        if (before < t && run.phaseTimer >= t) events.push({ type: 'cannonBurst', x: run.cannon.x, y: W.cannonY, step: i + 1 });
      });
      if (before < L.dyingDuration * 0.75 && run.phaseTimer >= L.dyingDuration * 0.75) {
        events.push({ type: 'cannonDestroyed', x: run.cannon.x, y: W.cannonY });
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
  addToSet(meta.collection.bosses, tier);
  if (run.golden) {
    meta.stats.goldenBosses++;
    addToSet(meta.collection.golden, tier);
  }
  if (!run.hitDuringBoss) meta.stats.noHitBosses++;
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

// ---------------------------------------------------------------- Tirs du canon

function updateProjectiles(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const pr = BALANCE.cannon.projectileRadius;
  const wpR = BALANCE.boss.weakPointRadius;
  const shielded = run.phase === 'waves' || run.phase === 'bossIntro';
  // Géométrie des boss calculée une fois par pas.
  const geo = run.bosses.map((b) => {
    const poly = bossVertices(b);
    return { boss: b, poly, weak: weakPointPositions(b, poly) };
  });

  compact(run.projectiles, (p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < -0.1 || p.y > W.height + 0.1 || Math.abs(p.x) > HALF + 0.1) return false;

    for (const e of run.enemies) {
      if (e.hp > 0 && Math.abs(p.x - e.x) < e.radius + pr && Math.abs(p.y - e.y) < e.radius + pr) {
        if (Math.hypot(p.x - e.x, p.y - e.y) < e.radius + pr) {
          damageEnemy(state, e, p.damage, events);
          return false;
        }
      }
    }

    for (const g of geo) {
      const b = g.boss;
      if (b.hp <= 0) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d = Math.hypot(dx, dy);
      if (shielded) {
        if (d < waveShieldRadius(b)) {
          damageBoss(state, b, p.damage, p.x, p.y, events);
          return false;
        }
        continue;
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
        return false;
      }
      if (pointInPolygon(p, g.poly)) {
        damageBoss(state, b, p.damage, p.x, p.y, events);
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
    if (fighting && Math.hypot(b.x - c.x, b.y - W.cannonY) < hitR + b.radius) {
      hitCannon(state, b.damage, b.x, b.y, events);
      b.damage = 0;
    }
  }
}
