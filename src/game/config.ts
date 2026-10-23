import balanceJson from '../config/balance.json';
import achievementsJson from '../config/achievements.json';
import type { ShapeDef } from './geometry';

/**
 * Types de la configuration d'équilibrage (`src/config/balance.json`).
 * L'affectation `BALANCE: Balance = balanceJson` fait vérifier le JSON par TypeScript.
 */

export type EnemyKind =
  | 'grunt'
  | 'weaver'
  | 'turret'
  | 'tank'
  | 'strafer'
  | 'hunter'
  | 'shooter'
  | 'splitter'
  | 'dasher'
  | 'armored'
  | 'rare';
export type FormationId = 'line' | 'rain' | 'snake' | 'v' | 'fan' | 'sides';
export type RunUpgradeId = 'damage' | 'fireRate' | 'maxHp';
export type WorkshopId = 'damage' | 'fireRate' | 'maxHp' | 'coins' | 'startCoins' | 'repair' | 'offline';
export type WeaponId = 'orbs' | 'laser' | 'lightning' | 'drones' | 'cryo' | 'nova' | 'vortex';
export type AbilityId = 'autoAim' | 'aimAngle' | 'shield' | 'shockwave' | 'multishot';
/** Capacités déclenchées par un bouton (Multi-tir et l'angle de visée sont passifs). */
export type ActiveAbilityId = Exclude<AbilityId, 'multishot' | 'aimAngle'>;
export type CannonId =
  | 'classic'
  | 'burst'
  | 'shotgun'
  | 'beam'
  | 'missile'
  | 'plasma'
  | 'twin'
  | 'ricochet'
  | 'gatling'
  | 'storm'
  | 'prism';
/** Bonus passifs des canons (actifs tant que le canon est choisi). */
export type PassiveStat = 'damage' | 'maxHp' | 'coins' | 'diamonds' | 'cooldown' | 'weakPoint' | 'repair';
export type WorldId = 'nebula' | 'asteroids' | 'supernova' | 'blackhole' | 'ionstorm';
export type DailyKind = 'kills' | 'bosses' | 'weakHits' | 'rareStars' | 'abilityUses' | 'runs' | 'levels' | 'upgrades';
export type BossKind = 'normal' | 'super' | 'mega';
export type StatId =
  | 'kills'
  | 'bossKills'
  | 'goldenBosses'
  | 'rareStars'
  | 'runs'
  | 'abilityUses'
  | 'noHitBosses'
  | 'dailyCompleted'
  | 'weakHits'
  | 'superBosses'
  | 'megaBosses';
export type AchievementStat =
  | StatId
  | 'bestLevel'
  | 'highestCleared'
  | 'weaponsUnlocked'
  | 'workshopLevels'
  | 'cannonsUnlocked'
  /** Monde `world` terminé (1 à 5). */
  | 'worldCleared'
  /** Monde `world` terminé sans prendre aucun dégât. */
  | 'flawlessWorld';

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
  /** Tourelle, mitrailleur : temps avant de repartir. */
  leaveAfter?: number;
  strafeSpeed?: number;
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
  /** Arme cachée, offerte quand ce nombre de mondes est terminé. */
  worldUnlock?: number;
  /** Gel : ralentissement des ennemis et des tirs ennemis dans l'aura. */
  slow?: number;
  bulletSlow?: number;
  /** Trou de ver : attraction des ennemis. */
  pull?: number;
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
  /** Angle de visée (degrés) : de base, puis par niveau. */
  baseAngle?: number;
  anglePerLevel?: number;
}

/** Type de canon (tir principal). */
export interface CannonDef {
  /** Multiplicateurs de cadence et de dégâts par tir. */
  rate: number;
  damage: number;
  burst?: number;
  burstGap?: number;
  pellets?: number;
  spread?: number;
  width?: number;
  splash?: number;
  speed?: number;
  turnRate?: number;
  pierce?: number;
  radius?: number;
  /** Ricochet : rebonds sur les bords ; angle de tir alterné. */
  bounces?: number;
  angle?: number;
  /** Jumeaux : écart entre les deux fûts. */
  offset?: number;
  /** Gatling : cadence de départ et maximale (multiplicateurs), temps de montée. */
  spinMin?: number;
  spinMax?: number;
  spinTime?: number;
  /** Foudre : rebonds et portée de l'arc. */
  chains?: number;
  range?: number;
  /** Prisme : nombre de tirs en éventail. */
  shots?: number;
  /** Déblocage gratuit quand la statistique atteint la valeur (vide : achat seulement). */
  unlockStat: string;
  unlockValue: number;
  /** Prix en gemmes (0 : pas d'achat possible, seulement en jouant). */
  gemCost: number;
  /** Bonus passifs tant que ce canon est choisi (`stat` : un des PASSIVE_STATS). */
  passive?: { stat: string; value: number }[];
}

export interface RingDef {
  dist: number;
  slots: number;
  gaps: number;
  speed: number;
}

/** Super boss (tous les 10 niveaux) et titan (tous les 50) : assemblages de blocs. */
export interface SpecialBossDef {
  hpMultiplier: number;
  span: number;
  y: number;
  coreHalf: number;
  blockHalf: number;
  rings: RingDef[];
  guns: number;
  gunDist: number;
  gunHalf: number;
  gunHpShare: number;
  /** Part des PV du cœur perdue quand un canon du boss est détruit. */
  gunCoreDamage: number;
  gunInterval: number;
  coreInterval: number;
}

/** Monde (fond et danger propre). */
export interface WorldDef {
  /** WorldId */
  id: string;
  hazard: string;
  interval?: number;
  radiusMin?: number;
  radiusMax?: number;
  speed?: number;
  bonus?: number;
  hpFactor?: number;
  damageFactor?: number;
  warn?: number;
  burn?: number;
  width?: number;
  damage?: number;
  pull?: number;
  bulletPull?: number;
  x?: number;
  y?: number;
  cooldownFactor?: number;
}

export interface DailyDef {
  /** DailyKind */
  id: string;
  target: number;
  gems: number;
}

export interface Balance {
  world: {
    width: number;
    height: number;
    bossY: number;
    cannonY: number;
    cannonMinX: number;
    cannonMaxX: number;
    cannonMinY: number;
    cannonMaxY: number;
  };
  levelsPerTier: number;
  levelsPerWorld: number;
  campaignLevels: number;
  level: {
    waves: { fromLevel: number; count: number }[];
    grandBossWaves: number;
    megaBossWaves: number;
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
    /**
     * Montée de difficulté vers la fin de chaque monde : × (1 + amount × position^power).
     * Exposants appliqués : PV des super boss (specialShare), PV des ennemis (enemyHpShare),
     * dégâts des ennemis et des tirs du boss (damageShare).
     */
    worldRamp: {
      amount: number;
      /** Montée propre à chaque monde (remplace `amount` ; le dernier sert au mode infini). */
      amountByWorld?: number[];
      power: number;
      specialShare: number;
      enemyHpShare: number;
      damageShare: number;
    };
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
    /** Contact avec le boss ou son bouclier : part des PV max perdue, invulnérabilité, recul. */
    bodyHitDamage: number;
    bodyHitInvulnerability: number;
    knockback: number;
  };
  runUpgrades: Record<RunUpgradeId, UpgradeDef>;
  workshop: Record<WorkshopId, UpgradeDef>;
  weapons: Record<WeaponId, WeaponDef> & { levelEffect: number; slotLevels: number[] };
  abilities: Record<AbilityId, AbilityDef>;
  /** `lateGrowth` : après le premier monde, les diamants augmentent de ce facteur à chaque niveau. */
  diamonds: { perBoss: number; bonusEveryLevels: number; firstClearBonus: number; grandMultiplier: number; lateGrowth: number };
  gems: { rareEnemy: number; grandFirstClear: number; grandFirstClearPerTier: number; campaignComplete: number };
  offline: { baseHours: number; minMinutes: number; ratePerHour: number; ratePerBestLevel: number; efficiency: number };
  daily: { count: number; allBonus: number; pool: DailyDef[] };
  cannons: Record<CannonId, CannonDef>;
  special: { superEvery: number; megaEvery: number; super: SpecialBossDef; mega: SpecialBossDef };
  worlds: WorldDef[];
  boost: { durationMinutes: number; cooldownMinutes: number; multiplier: number };
  /** Pubs récompensées contre des gemmes : au plus `perDay` par jour, `gems` chacune. */
  gemAds: { perDay: number; gems: number };
  checkpoint: { coinShare: number };
  /**
   * Après `fromLevel`, les PV et les dégâts (boss, ennemis, tirs) augmentent moins vite d'un niveau à l'autre :
   * les améliorations de partie suivent, la difficulté vient surtout de la fin de chaque monde.
   */
  lateGrowth: { fromLevel: number; hp: number; damage: number };
}

export interface AchievementDef {
  id: string;
  stat: AchievementStat;
  goal: number;
  gems: number;
  /** Monde concerné (succès « terminer le monde N », « sans dégât »). */
  world?: number;
}

export const BALANCE: Balance = balanceJson;
export const ACHIEVEMENTS: AchievementDef[] = achievementsJson as AchievementDef[];

export const ENEMY_KINDS: EnemyKind[] = [
  'grunt',
  'weaver',
  'turret',
  'tank',
  'strafer',
  'hunter',
  'shooter',
  'splitter',
  'dasher',
  'armored',
  'rare',
];
export const FORMATIONS: FormationId[] = ['line', 'rain', 'snake', 'v', 'fan', 'sides'];
export const RUN_UPGRADES: RunUpgradeId[] = ['damage', 'fireRate', 'maxHp'];
export const WORKSHOP: WorkshopId[] = ['damage', 'fireRate', 'maxHp', 'coins', 'startCoins', 'repair', 'offline'];
export const WEAPONS: WeaponId[] = ['orbs', 'laser', 'lightning', 'drones', 'cryo', 'nova', 'vortex'];
export const ABILITIES: AbilityId[] = ['autoAim', 'aimAngle', 'shield', 'shockwave', 'multishot'];
export const CANNONS: CannonId[] = ['classic', 'burst', 'shotgun', 'missile', 'beam', 'plasma', 'twin', 'ricochet', 'gatling', 'storm', 'prism'];
export const PASSIVE_STATS: PassiveStat[] = ['damage', 'maxHp', 'coins', 'diamonds', 'cooldown', 'weakPoint', 'repair'];
export const WORLDS: WorldId[] = ['nebula', 'asteroids', 'supernova', 'blackhole', 'ionstorm'];
export const ACTIVE_ABILITIES: ActiveAbilityId[] = ['autoAim', 'shield', 'shockwave'];
export const STATS: StatId[] = [
  'kills',
  'bossKills',
  'goldenBosses',
  'rareStars',
  'runs',
  'abilityUses',
  'noHitBosses',
  'dailyCompleted',
  'weakHits',
  'superBosses',
  'megaBosses',
];
