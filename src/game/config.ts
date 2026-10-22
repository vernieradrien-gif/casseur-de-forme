import balanceJson from '../config/balance.json';
import achievementsJson from '../config/achievements.json';
import type { ShapeDef } from './geometry';

/**
 * Types de la configuration d'équilibrage (`src/config/balance.json`).
 * L'affectation `BALANCE: Balance = balanceJson` fait vérifier le JSON par TypeScript.
 */

export type EnemyKind = 'grunt' | 'weaver' | 'tank' | 'hunter' | 'shooter' | 'splitter' | 'dasher' | 'armored' | 'rare';
export type FormationId = 'line' | 'rain' | 'snake' | 'v' | 'fan' | 'sides';
export type RunUpgradeId = 'damage' | 'fireRate' | 'maxHp';
export type WorkshopId = 'damage' | 'fireRate' | 'maxHp' | 'coins' | 'startCoins' | 'repair' | 'offline';
export type WeaponId = 'orbs' | 'laser' | 'lightning';
export type AbilityId = 'autoAim' | 'shield' | 'shockwave' | 'multishot';
/** Capacités déclenchées par un bouton (Multi-tir est passif). */
export type ActiveAbilityId = Exclude<AbilityId, 'multishot'>;
export type StatId =
  | 'kills'
  | 'bossKills'
  | 'goldenBosses'
  | 'rareStars'
  | 'runs'
  | 'abilityUses'
  | 'noHitBosses'
  | 'dailyCompleted';
export type AchievementStat = StatId | 'bestLevel' | 'weaponsUnlocked' | 'workshopLevels';

export interface CostDef {
  baseCost: number;
  costGrowth: number;
}

export interface UpgradeDef extends CostDef {
  effectPerLevel: number;
  maxLevel?: number;
}

export interface AttackDef {
  /** aimed | fan | burst | ring | spiral */
  type: string;
  count: number;
  spread: number;
}

export interface TierDef {
  shape: ShapeDef;
  weakPoints: number;
  fast?: boolean;
  armor?: number;
  regen?: number;
  shield?: number;
  fragments?: number;
  rings?: number;
  attack: AttackDef;
}

export interface EnemyDef {
  hp: number;
  speed: number;
  damage: number;
  coins: number;
  radius: number;
  fromLevel: number;
  weight: number;
  drift: number;
  /** Part de l'effectif d'une vague (les ennemis résistants viennent moins nombreux). */
  waveShare: number;
  turnRate?: number;
  fireInterval?: number;
  shots?: number;
  stopY?: number;
  dashSpeed?: number;
  aimTime?: number;
  shieldHits?: number;
  fleeAfter?: number;
}

export interface WeaponDef extends CostDef {
  gemCost: number;
  maxLevel: number;
  damageFactor: number;
  count?: number;
  radius?: number;
  orbRadius?: number;
  speed?: number;
  hitCooldown?: number;
  cooldown?: number;
  duration?: number;
  width?: number;
  chains?: number;
  range?: number;
}

export interface AbilityDef {
  gemCost: number;
  upgradeCost: number;
  maxLevel: number;
  duration?: number;
  durationPerLevel?: number;
  cooldown?: number;
  cooldownPerLevel?: number;
  bossDamage?: number;
  bossDamagePerLevel?: number;
  spread?: number;
  angle?: number;
  damageShare?: number[];
}

export interface Balance {
  world: { width: number; height: number; bossY: number; cannonY: number; cannonMinX: number; cannonMaxX: number };
  levelsPerTier: number;
  levelsPerWorld: number;
  campaignLevels: number;
  level: {
    waves: { fromLevel: number; count: number }[];
    grandBossWaves: number;
    firstWaveDelay: number;
    waveGap: number;
    waveMaxDuration: number;
    bossIntroTime: number;
    nextLevelDelay: number;
    dyingDuration: number;
    dyingTimeScale: number;
    defeatDelay: number;
  };
  boss: {
    baseHp: number;
    hpGrowth: number;
    /** Multiplicateur de PV par palier au-delà du tableau (mode infini). */
    tierHpMultiplier: number;
    /** Multiplicateur de PV de chaque palier (forte montée au début, plus douce ensuite). */
    tierHpMultipliers: number[];
    grandHpMultiplier: number;
    grandRadiusMultiplier: number;
    radius: number;
    rotationSpeed: number;
    moveSpeed: number;
    moveLimit: number;
    baseCoins: number;
    coinGrowth: number;
    grandCoinMultiplier: number;
    goldenChance: number;
    goldenCoinMultiplier: number;
    enrageBelow: number;
    enrageFactor: number;
    /** Secondes de phase boss pour doubler sa cadence de tir (fureur croissante). */
    furyTime: number;
    fastFactor: number;
    weakPointMultiplier: number;
    weakPointRadius: number;
    armorRefGrowth: number;
    armorMinFraction: number;
    waveShieldScale: number;
    shieldRecharge: number;
    regenDelay: number;
    fragmentHpShare: number;
    fragmentRadius: number;
    ringGap: number;
    /** Part des PV du cœur portée par chaque anneau. */
    ringShare: number;
    minionInterval: number;
    minionCount: number;
    minionsFromLevel: number;
    bullet: {
      damage: number;
      damageGrowth: number;
      speed: number;
      radius: number;
      interval: number;
      intervalMin: number;
      intervalPerLevel: number;
      burstGap: number;
      spiralIntervalFactor: number;
      aimedSpread: number;
    };
  };
  tiers: TierDef[];
  waves: {
    countBase: number;
    countPerLevel: number;
    countMax: number;
    rowSize: number;
    mixFromLevel: number;
    mixChance: number;
    formations: Record<FormationId, { fromLevel: number; weight: number }>;
  };
  enemies: Record<EnemyKind, EnemyDef>;
  rareChance: number;
  enemyScaling: { hpGrowth: number; damageGrowth: number; coinGrowth: number };
  cannon: {
    baseHp: number;
    baseDamage: number;
    shotsPerSecond: number;
    maxShotsPerSecond: number;
    projectileSpeed: number;
    projectileRadius: number;
    radius: number;
    moveSpeed: number;
    healOnLevelClear: number;
    hitInvulnerability: number;
    continueHp: number;
    continueInvulnerability: number;
    turnSpeed: number;
  };
  runUpgrades: Record<RunUpgradeId, UpgradeDef>;
  workshop: Record<WorkshopId, UpgradeDef>;
  weapons: Record<WeaponId, WeaponDef> & { levelEffect: number; slotLevels: number[] };
  abilities: Record<AbilityId, AbilityDef>;
  diamonds: { perBoss: number; bonusEveryLevels: number; firstClearBonus: number; grandMultiplier: number };
  gems: { rareEnemy: number; grandFirstClear: number; grandFirstClearPerTier: number; campaignComplete: number };
  offline: { baseHours: number; minMinutes: number; ratePerHour: number; ratePerBestLevel: number; efficiency: number };
  daily: { kills: number; gems: number };
  boost: { durationMinutes: number; cooldownMinutes: number; multiplier: number };
  checkpoint: { coinShare: number };
  ads: { interstitialMinGapMinutes: number; interstitialMinSessionMinutes: number };
}

export interface AchievementDef {
  id: string;
  stat: AchievementStat;
  goal: number;
  gems: number;
}

export const BALANCE: Balance = balanceJson;
export const ACHIEVEMENTS: AchievementDef[] = achievementsJson as AchievementDef[];

export const ENEMY_KINDS: EnemyKind[] = ['grunt', 'weaver', 'tank', 'hunter', 'shooter', 'splitter', 'dasher', 'armored', 'rare'];
export const FORMATIONS: FormationId[] = ['line', 'rain', 'snake', 'v', 'fan', 'sides'];
export const RUN_UPGRADES: RunUpgradeId[] = ['damage', 'fireRate', 'maxHp'];
export const WORKSHOP: WorkshopId[] = ['damage', 'fireRate', 'maxHp', 'coins', 'startCoins', 'repair', 'offline'];
export const WEAPONS: WeaponId[] = ['orbs', 'laser', 'lightning'];
export const ABILITIES: AbilityId[] = ['autoAim', 'shield', 'shockwave', 'multishot'];
export const ACTIVE_ABILITIES: ActiveAbilityId[] = ['autoAim', 'shield', 'shockwave'];
export const STATS: StatId[] = ['kills', 'bossKills', 'goldenBosses', 'rareStars', 'runs', 'abilityUses', 'noHitBosses', 'dailyCompleted'];
