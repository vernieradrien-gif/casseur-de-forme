import { geometricSum, grow, maxAffordable } from './bignum';
import { BALANCE, ENEMY_KINDS, FORMATIONS, WORLDS } from './config';
import type {
  AbilityId,
  Balance,
  BossKind,
  CannonDef,
  CannonId,
  CostDef,
  EnemyKind,
  FormationId,
  PassiveStat,
  RunUpgradeId,
  TierDef,
  WeaponId,
  WorkshopId,
  WorldDef,
  WorldId,
} from './config';

// ---------- Niveaux, paliers, mondes ----------

/** Palier (0-indexé, sans fin) : niveaux 1-10 → 0, 11-20 → 1… */
export function tierOf(level: number, cfg: Balance = BALANCE): number {
  return Math.floor((level - 1) / cfg.levelsPerTier);
}

/** Indice de la forme du palier (les formes recommencent en mode infini). */
export function tierIndex(level: number, cfg: Balance = BALANCE): number {
  return tierOf(level, cfg) % cfg.tiers.length;
}

export function tierDef(level: number, cfg: Balance = BALANCE): TierDef {
  return cfg.tiers[tierIndex(level, cfg)];
}

/** Le dernier niveau de chaque palier est un grand boss (super boss, ou titan tous les 50 niveaux). */
export function isGrandBoss(level: number, cfg: Balance = BALANCE): boolean {
  return level % cfg.special.superEvery === 0;
}

/** Type de boss du niveau : titan tous les 50 niveaux, super boss tous les 10, sinon forme classique. */
export function bossKindAt(level: number, cfg: Balance = BALANCE): BossKind {
  if (level % cfg.special.megaEvery === 0) return 'mega';
  if (level % cfg.special.superEvery === 0) return 'super';
  return 'normal';
}

/** Nombre de vagues avant la phase boss. */
export function wavesForLevel(level: number, cfg: Balance = BALANCE): number {
  const kind = bossKindAt(level, cfg);
  if (kind === 'mega') return cfg.level.megaBossWaves;
  if (kind === 'super') return cfg.level.grandBossWaves;
  let count = cfg.level.waves[0].count;
  for (const w of cfg.level.waves) if (level >= w.fromLevel) count = w.count;
  return count;
}

/** Monde (0-indexé) d'un niveau : 1-50 → 0, 51-100 → 1… */
export function worldOf(level: number, cfg: Balance = BALANCE): number {
  return Math.floor((level - 1) / cfg.levelsPerWorld);
}

export function worldStart(world: number, cfg: Balance = BALANCE): number {
  return 1 + world * cfg.levelsPerWorld;
}

/** Nombre de mondes où l'on peut reprendre (le début du monde a été atteint). */
export function worldsUnlocked(bestLevel: number, cfg: Balance = BALANCE): number {
  return worldOf(Math.max(1, bestLevel), cfg) + 1;
}

/** Thème du monde (fond et danger) : les thèmes recommencent après le dernier. */
export function worldTheme(level: number, cfg: Balance = BALANCE): WorldDef {
  return cfg.worlds[worldOf(level, cfg) % cfg.worlds.length];
}

export function worldThemeId(world: number, cfg: Balance = BALANCE): WorldId {
  return WORLDS[world % cfg.worlds.length];
}

/** Position dans le monde, de 0 (premier niveau) à 1 (dernier). */
export function worldProgress(level: number, cfg: Balance = BALANCE): number {
  return ((level - 1) % cfg.levelsPerWorld) / (cfg.levelsPerWorld - 1);
}

/** La difficulté accélère vers la fin de chaque monde, puis souffle au début du suivant. */
export function worldRamp(level: number, cfg: Balance = BALANCE): number {
  const r = cfg.boss.worldRamp;
  return 1 + r.amount * Math.pow(worldProgress(level, cfg), r.power);
}

// ---------- Boss ----------

/** Multiplicateur de PV du palier (tableau, puis croissance régulière en mode infini). */
export function tierHpMultiplier(level: number, cfg: Balance = BALANCE): number {
  const m = cfg.boss.tierHpMultipliers;
  const t = tierOf(level, cfg);
  const last = m.length - 1;
  return t <= last ? m[t] : m[last] * Math.pow(cfg.boss.tierHpMultiplier, t - last);
}

export function bossHp(level: number, cfg: Balance = BALANCE): number {
  const b = cfg.boss;
  const kind = bossKindAt(level, cfg);
  const special = kind === 'mega' ? cfg.special.mega.hpMultiplier : kind === 'super' ? cfg.special.super.hpMultiplier : 1;
  // Les super boss suivent une montée plus douce (ils sont déjà un pic de difficulté).
  const ramp = Math.pow(worldRamp(level, cfg), kind === 'normal' ? 1 : b.worldRamp.specialShare);
  return grow(b.baseHp, b.hpGrowth, level - 1) * tierHpMultiplier(level, cfg) * ramp * special;
}

export function bossRadius(level: number, cfg: Balance = BALANCE): number {
  const kind = bossKindAt(level, cfg);
  return kind === 'normal' ? cfg.boss.radius : cfg.special[kind].span;
}

export function bossCoins(level: number, golden: boolean, cfg: Balance = BALANCE): number {
  const b = cfg.boss;
  const grand = isGrandBoss(level, cfg) ? b.grandCoinMultiplier : 1;
  return grow(b.baseCoins, b.coinGrowth, level - 1) * grand * (golden ? b.goldenCoinMultiplier : 1);
}

/** Diamants pour un niveau terminé ; bonus si le niveau est franchi pour la première fois. */
export function bossDiamonds(level: number, firstClear: boolean, cfg: Balance = BALANCE): number {
  const d = cfg.diamonds;
  const base = d.perBoss + Math.floor((level - 1) / d.bonusEveryLevels);
  return base * (isGrandBoss(level, cfg) ? d.grandMultiplier : 1) + (firstClear ? d.firstClearBonus : 0);
}

/** Gemmes au premier passage d'un grand boss. */
export function grandBossGems(level: number, cfg: Balance = BALANCE): number {
  if (!isGrandBoss(level, cfg)) return 0;
  return cfg.gems.grandFirstClear + cfg.gems.grandFirstClearPerTier * tierOf(level, cfg);
}

export function bossBulletDamage(level: number, cfg: Balance = BALANCE): number {
  const b = cfg.boss.bullet;
  return grow(b.damage, b.damageGrowth, level - 1) * Math.pow(worldRamp(level, cfg), cfg.boss.worldRamp.damageShare);
}

export function bossFireInterval(level: number, cfg: Balance = BALANCE): number {
  const b = cfg.boss.bullet;
  return Math.max(b.intervalMin, b.interval - b.intervalPerLevel * (level - 1));
}

/** Valeur retirée à chaque coup par le blindage (suit la puissance attendue du joueur). */
export function bossArmorValue(armor: number, level: number, cfg: Balance = BALANCE): number {
  return armor * grow(cfg.cannon.baseDamage, cfg.boss.armorRefGrowth, level - 1);
}

/** Dégâts après blindage : jamais moins d'une fraction du coup. */
export function applyArmor(damage: number, armorValue: number, cfg: Balance = BALANCE): number {
  return Math.max(damage * cfg.boss.armorMinFraction, damage - armorValue);
}

// ---------- Vagues et ennemis ----------

export function enemiesPerWave(level: number, cfg: Balance = BALANCE): number {
  const w = cfg.waves;
  return Math.min(w.countMax, w.countBase + Math.floor(w.countPerLevel * (level - 1)));
}

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
    hp: grow(e.hp, s.hpGrowth, level - 1) * Math.pow(worldRamp(level, cfg), cfg.boss.worldRamp.enemyHpShare),
    damage: grow(e.damage, s.damageGrowth, level - 1) * Math.pow(worldRamp(level, cfg), cfg.boss.worldRamp.damageShare),
    coins: grow(e.coins, s.coinGrowth, level - 1),
    speed: e.speed,
    radius: e.radius,
  };
}

/** Types débloqués à ce niveau (hors étoile dorée). */
export function enemyKindsAt(level: number, cfg: Balance = BALANCE): EnemyKind[] {
  return ENEMY_KINDS.filter((k) => cfg.enemies[k].weight > 0 && level >= cfg.enemies[k].fromLevel);
}

/** Type présenté pour la première fois à ce niveau (un seul à la fois), sinon null. */
export function newEnemyAt(level: number, cfg: Balance = BALANCE): EnemyKind | null {
  return ENEMY_KINDS.find((k) => cfg.enemies[k].weight > 0 && cfg.enemies[k].fromLevel === level && level > 1) ?? null;
}

function weighted<K extends string>(keys: K[], weight: (k: K) => number, r: number): K {
  const total = keys.reduce((sum, k) => sum + weight(k), 0);
  let x = r * total;
  for (const k of keys) {
    x -= weight(k);
    if (x < 0) return k;
  }
  return keys[keys.length - 1];
}

/** Choisit un type d'ennemi selon les poids des types débloqués. `r` ∈ [0, 1[. */
export function pickEnemyKind(level: number, r: number, cfg: Balance = BALANCE): EnemyKind {
  return weighted(enemyKindsAt(level, cfg), (k) => cfg.enemies[k].weight, r);
}

export function pickFormation(level: number, r: number, cfg: Balance = BALANCE): FormationId {
  const f = cfg.waves.formations;
  const available = FORMATIONS.filter((id) => level >= f[id].fromLevel);
  return weighted(available, (id) => f[id].weight, r);
}

// ---------- Coûts ----------

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
export function compound(effectPerLevel: number, level: number): number {
  return grow(1, 1 + effectPerLevel, level);
}

// ---------- Canon ----------

export interface CannonStats {
  damage: number;
  shotsPerSecond: number;
  maxHp: number;
  coinMultiplier: number;
}

/** Bonus passif du canon choisi pour une statistique (0 si aucun). */
export function cannonPassive(cannon: CannonId, stat: PassiveStat, cfg: Balance = BALANCE): number {
  return (cfg.cannons[cannon].passive ?? []).reduce((sum, p) => sum + (p.stat === stat ? p.value : 0), 0);
}

export function cannonStats(
  run: Record<RunUpgradeId, number>,
  workshop: Record<WorkshopId, number>,
  cannon: CannonId = 'classic',
  cfg: Balance = BALANCE,
): CannonStats {
  const c = cfg.cannon;
  const r = cfg.runUpgrades;
  const w = cfg.workshop;
  const bonus = (stat: PassiveStat) => 1 + cannonPassive(cannon, stat, cfg);
  return {
    damage: c.baseDamage * compound(w.damage.effectPerLevel, workshop.damage) * compound(r.damage.effectPerLevel, run.damage) * bonus('damage'),
    shotsPerSecond: Math.min(
      c.maxShotsPerSecond,
      c.shotsPerSecond * compound(w.fireRate.effectPerLevel, workshop.fireRate) * compound(r.fireRate.effectPerLevel, run.fireRate),
    ),
    maxHp: c.baseHp * compound(w.maxHp.effectPerLevel, workshop.maxHp) * compound(r.maxHp.effectPerLevel, run.maxHp) * bonus('maxHp'),
    coinMultiplier: compound(w.coins.effectPerLevel, workshop.coins) * bonus('coins'),
  };
}

/** Part des PV max rendue en fin de niveau (Réparation de l'atelier et bonus du canon inclus). */
export function healOnClear(workshop: Record<WorkshopId, number>, cannon: CannonId = 'classic', cfg: Balance = BALANCE): number {
  return Math.min(1, cfg.cannon.healOnLevelClear + cfg.workshop.repair.effectPerLevel * workshop.repair + cannonPassive(cannon, 'repair', cfg));
}

/** Effet affiché d'un niveau d'atelier. */
export function workshopEffect(id: WorkshopId, level: number, cfg: Balance = BALANCE): number {
  const def = cfg.workshop[id];
  switch (id) {
    case 'startCoins':
      return def.effectPerLevel * level;
    case 'repair':
      return healOnClear({ repair: level } as Record<WorkshopId, number>, 'classic', cfg);
    case 'offline':
      return offlineCapHours(level, cfg);
    default:
      return compound(def.effectPerLevel, level);
  }
}

// ---------- Armes et capacités ----------

export function weaponPower(level: number, cfg: Balance = BALANCE): number {
  return 1 + cfg.weapons.levelEffect * Math.max(0, level - 1);
}

export function weaponSlots(bestLevel: number, cfg: Balance = BALANCE): number {
  return cfg.weapons.slotLevels.filter((l) => bestLevel >= l).length;
}

export function weaponUpgradeCost(id: WeaponId, level: number, cfg: Balance = BALANCE): number {
  return cost(cfg.weapons[id], level - 1);
}

/** Demi-angle (radians) du cône de visée automatique : 20° de base, +20° par niveau, 160° au plus. */
export function aimHalfAngle(level: number, cfg: Balance = BALANCE): number {
  const d = cfg.abilities.aimAngle;
  const deg = Math.min(160, (d.baseAngle ?? 20) + (d.anglePerLevel ?? 20) * level);
  return ((deg / 2) * Math.PI) / 180;
}

export function aimAngleDegrees(level: number, cfg: Balance = BALANCE): number {
  return Math.round((aimHalfAngle(level, cfg) * 360) / Math.PI);
}

export function cannonDef(id: CannonId, cfg: Balance = BALANCE): CannonDef {
  return cfg.cannons[id];
}

/** Durée d'une capacité active au niveau donné (niveau 1 = juste débloquée). */
export function abilityDuration(id: AbilityId, level: number, cfg: Balance = BALANCE): number {
  const d = cfg.abilities[id];
  return (d.duration ?? 0) + (d.durationPerLevel ?? 0) * Math.max(0, level - 1);
}

export function abilityCooldown(id: AbilityId, level: number, cfg: Balance = BALANCE): number {
  const d = cfg.abilities[id];
  return Math.max(1, (d.cooldown ?? 0) - (d.cooldownPerLevel ?? 0) * Math.max(0, level - 1));
}

export function shockwaveBossDamage(level: number, cfg: Balance = BALANCE): number {
  const d = cfg.abilities.shockwave;
  return (d.bossDamage ?? 0) + (d.bossDamagePerLevel ?? 0) * Math.max(0, level - 1);
}

/** Prix en gemmes du prochain niveau (0 → déblocage). */
export function abilityPrice(id: AbilityId, level: number, cfg: Balance = BALANCE): number {
  const d = cfg.abilities[id];
  if (id === 'aimAngle') return d.gemCost + d.upgradeCost * level;
  return level === 0 ? d.gemCost : d.upgradeCost * level;
}

// ---------- Progression ----------

/** Pièces de départ quand on reprend au début d'un monde avancé. */
export function checkpointCoins(startLevel: number, cfg: Balance = BALANCE): number {
  if (startLevel <= 1) return 0;
  let total = 0;
  for (let l = 1; l < startLevel; l++) {
    const enemies = wavesForLevel(l, cfg) * enemiesPerWave(l, cfg);
    total += bossCoins(l, false, cfg) + enemies * enemyStats('grunt', l, cfg).coins;
  }
  return total * cfg.checkpoint.coinShare;
}

export function offlineCapHours(offlineLevel: number, cfg: Balance = BALANCE): number {
  return cfg.offline.baseHours + cfg.workshop.offline.effectPerLevel * offlineLevel;
}

/** Diamants gagnés hors ligne ; 0 si l'horloge a reculé ou l'absence est trop courte. */
export function offlineDiamonds(bestLevel: number, offlineLevel: number, seconds: number, cfg: Balance = BALANCE): number {
  const o = cfg.offline;
  if (!(seconds >= o.minMinutes * 60)) return 0;
  const hours = Math.min(seconds / 3600, offlineCapHours(offlineLevel, cfg));
  return Math.floor((o.ratePerHour + o.ratePerBestLevel * bestLevel) * o.efficiency * hours);
}
