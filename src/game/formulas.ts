import balance from '../config/balance.json';
import { geometricSum, grow, maxAffordable } from './bignum';
import type { ShapeDef } from './geometry';

export type Balance = typeof balance;
export type RunUpgradeId = keyof Balance['runUpgrades'];
export type DiamondUpgradeId = keyof Balance['diamondUpgrades'];
export type AbilityId = keyof Balance['abilities'];
export type EnemyKind = keyof Balance['enemies'];

export const BALANCE: Balance = balance;
export const RUN_UPGRADES = Object.keys(balance.runUpgrades) as RunUpgradeId[];
export const DIAMOND_UPGRADES = Object.keys(balance.diamondUpgrades) as DiamondUpgradeId[];
export const ABILITIES = Object.keys(balance.abilities) as AbilityId[];
export const ENEMY_KINDS = Object.keys(balance.enemies) as EnemyKind[];

/** Palier (0-indexé) d'un niveau : niveaux 1-10 → 0, 11-20 → 1… */
export function tierOf(level: number, cfg: Balance = BALANCE): number {
  return Math.floor((level - 1) / cfg.levelsPerTier);
}

export function bossShape(level: number, cfg: Balance = BALANCE): ShapeDef {
  const shapes = cfg.bossShapes;
  return shapes[tierOf(level, cfg) % shapes.length];
}

// ---------- Boss ----------

export function bossHp(level: number, cfg: Balance = BALANCE): number {
  const m = cfg.boss.tierMultipliers;
  const mult = m[Math.min(tierOf(level, cfg), m.length - 1)];
  return grow(cfg.boss.baseHp, cfg.boss.hpGrowth, level - 1) * mult;
}

export function bossCoins(level: number, cfg: Balance = BALANCE): number {
  return grow(cfg.boss.baseCoins, cfg.boss.coinGrowth, level - 1);
}

/** Diamants pour un boss vaincu ; bonus si le niveau est franchi pour la première fois. */
export function bossDiamonds(level: number, firstClear: boolean, cfg: Balance = BALANCE): number {
  const d = cfg.diamonds;
  return d.perBoss + Math.floor((level - 1) / d.bonusEveryLevels) + (firstClear ? d.firstClearBonus : 0);
}

// ---------- Vagues ----------

export function waveInterval(level: number, cfg: Balance = BALANCE): number {
  const w = cfg.waves;
  return Math.max(w.intervalMin, w.intervalBase - w.intervalPerLevel * (level - 1));
}

export function waveCount(level: number, cfg: Balance = BALANCE): number {
  const w = cfg.waves;
  return Math.min(w.countMax, w.countBase + Math.floor(w.countPerLevel * (level - 1)));
}

// ---------- Ennemis ----------

export interface EnemyStats {
  hp: number;
  damage: number;
  coins: number;
  speed: number;
  radius: number;
}

export function enemyStats(kind: EnemyKind, level: number, cfg: Balance = BALANCE): EnemyStats {
  const e = cfg.enemies[kind];
  const s = cfg.enemyScaling;
  return {
    hp: grow(e.hp, s.hpGrowth, level - 1),
    damage: grow(e.damage, s.damageGrowth, level - 1),
    coins: grow(e.coins, s.coinGrowth, level - 1),
    speed: e.speed,
    radius: e.radius,
  };
}

/** Choisit un type d'ennemi (hors « rare ») selon les poids des types débloqués. `r` ∈ [0, 1[. */
export function pickEnemyKind(level: number, r: number, cfg: Balance = BALANCE): EnemyKind {
  const available = ENEMY_KINDS.filter((k) => cfg.enemies[k].weight > 0 && level >= cfg.enemies[k].fromLevel);
  const total = available.reduce((sum, k) => sum + cfg.enemies[k].weight, 0);
  let x = r * total;
  for (const k of available) {
    x -= cfg.enemies[k].weight;
    if (x < 0) return k;
  }
  return available[available.length - 1];
}

// ---------- Améliorations ----------

interface CostDef {
  baseCost: number;
  costGrowth: number;
}

export function cost(def: CostDef, owned: number): number {
  return grow(def.baseCost, def.costGrowth, owned);
}

export function bulkCost(def: CostDef, owned: number, count: number): number {
  return geometricSum(def.baseCost, def.costGrowth, owned, count);
}

export function affordable(def: CostDef, owned: number, budget: number): number {
  return maxAffordable(def.baseCost, def.costGrowth, owned, budget);
}

/** Multiplicateur composé : (1 + effet)^niveau. */
function mult(effectPerLevel: number, level: number): number {
  return grow(1, 1 + effectPerLevel, level);
}

export interface CannonStats {
  damage: number;
  shotsPerSecond: number;
  maxHp: number;
  coinMultiplier: number;
}

export function cannonStats(
  run: Record<RunUpgradeId, number>,
  perm: Record<DiamondUpgradeId, number>,
  cfg: Balance = BALANCE,
): CannonStats {
  const c = cfg.cannon;
  const r = cfg.runUpgrades;
  const d = cfg.diamondUpgrades;
  return {
    damage: c.baseDamage * mult(d.damage.effectPerLevel, perm.damage) * mult(r.damage.effectPerLevel, run.damage),
    shotsPerSecond: Math.min(
      c.maxShotsPerSecond,
      c.shotsPerSecond * mult(d.fireRate.effectPerLevel, perm.fireRate) * mult(r.fireRate.effectPerLevel, run.fireRate),
    ),
    maxHp: c.baseHp * mult(d.maxHp.effectPerLevel, perm.maxHp) * mult(r.maxHp.effectPerLevel, run.maxHp),
    coinMultiplier: mult(d.coins.effectPerLevel, perm.coins),
  };
}
