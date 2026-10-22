import balance from '../config/balance.json';
import { geometricSum, grow, maxAffordable } from './bignum';

export type Balance = typeof balance;
export type UpgradeId = keyof Balance['upgrades'];

export const BALANCE: Balance = balance;

/** Palier (0-indexé) d'un niveau : niveaux 1-10 → 0, 11-20 → 1… */
export function tierOf(level: number, cfg: Balance = BALANCE): number {
  return Math.floor((level - 1) / cfg.shape.levelsPerTier);
}

function tierMultiplier(level: number, cfg: Balance): number {
  const m = cfg.shape.tierMultipliers;
  return m[Math.min(tierOf(level, cfg), m.length - 1)];
}

/** PV = base × croissance^(niveau − 1) × multiplicateur du palier. */
export function shapeHp(level: number, cfg: Balance = BALANCE): number {
  return grow(cfg.shape.baseHp, cfg.shape.hpGrowth, level - 1) * tierMultiplier(level, cfg);
}

/** Pièces = base × croissance^(niveau − 1). */
export function shapeCoins(level: number, cfg: Balance = BALANCE): number {
  return grow(cfg.shape.baseCoins, cfg.shape.coinGrowth, level - 1);
}

/** Coût du prochain achat = coût de base × croissance^(achats). */
export function upgradeCost(id: UpgradeId, owned: number, cfg: Balance = BALANCE): number {
  const u = cfg.upgrades[id];
  return grow(u.baseCost, u.costGrowth, owned);
}

/** Coût total de `count` achats consécutifs. */
export function upgradeBulkCost(id: UpgradeId, owned: number, count: number, cfg: Balance = BALANCE): number {
  const u = cfg.upgrades[id];
  return geometricSum(u.baseCost, u.costGrowth, owned, count);
}

/** Nombre d'achats possibles avec `coins`. */
export function upgradeMaxAffordable(id: UpgradeId, owned: number, coins: number, cfg: Balance = BALANCE): number {
  const u = cfg.upgrades[id];
  return maxAffordable(u.baseCost, u.costGrowth, owned, coins);
}

/** Dégâts d'un tir de canon : base × (1 + bonus)^niveau d'amélioration (bonus composé). */
export function cannonDamage(damageLevel: number, cfg: Balance = BALANCE): number {
  return grow(cfg.cannon.baseDamage, 1 + cfg.upgrades.damage.effectPerLevel, damageLevel);
}
