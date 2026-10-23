import { ABILITIES, ACTIVE_ABILITIES, BALANCE, CANNONS, RUN_UPGRADES, STATS, WEAPONS, WORKSHOP } from './config';
import type {
  AbilityId,
  ActiveAbilityId,
  BossKind,
  CannonId,
  DailyKind,
  EnemyKind,
  RunUpgradeId,
  StatId,
  WeaponId,
  WorkshopId,
} from './config';
import { cannonStats } from './formulas';
import type { ShapeDef } from './geometry';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  damage: number;
  coins: number;
  radius: number;
  speed: number;
  age: number;
  /** Vague d'origine (−1 : lancé par le boss ou issu d'une division). */
  wave: number;
  /** Ondulation latérale de la formation (serpent, zigzag). */
  amp: number;
  freq: number;
  phase: number;
  /** Étape du comportement (tireur : descend / tire / repart ; kamikaze : descend / vise / fonce…). */
  mode: number;
  timer: number;
  shots: number;
  /** Tirs encore absorbés par le bouclier frontal (Blindé). */
  shieldHits: number;
  /** Cible verrouillée du kamikaze. */
  tx: number;
  ty: number;
  /** Éclair blanc après un impact (secondes). */
  flash: number;
  /** Délai avant qu'un orbe puisse de nouveau le toucher. */
  orbCd: number;
}

/** Bloc d'un super boss : cœur (vulnérable), blindage (invulnérable) ou canon (vulnérable, tire). */
export interface BossPart {
  role: 'core' | 'armor' | 'gun';
  /** Anneau tournant (−1 : fixe par rapport au boss). */
  ring: number;
  angle: number;
  dist: number;
  half: number;
  hp: number;
  maxHp: number;
  flash: number;
  fireTimer: number;
}

export interface Boss {
  id: number;
  kind: BossKind;
  level: number;
  tier: number;
  shape: ShapeDef;
  radius: number;
  /** Encombrement (collisions, déplacements). */
  span: number;
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  rotation: number;
  golden: boolean;
  grand: boolean;
  /** Fragment issu de la division d'un boss (ne se divise plus). */
  fragment: boolean;
  armor: number;
  regen: number;
  fast: boolean;
  fragments: number;
  /** Bouclier de propriété : coups encore absorbés, capacité, recharge. */
  shieldHits: number;
  shieldMax: number;
  shieldTimer: number;
  /** Anneaux restants à détruire avant le cœur. */
  rings: number;
  ringHp: number;
  ringMaxHp: number;
  sinceHit: number;
  fireTimer: number;
  burstLeft: number;
  burstTimer: number;
  minionTimer: number;
  enraged: boolean;
  /** Indices des sommets portant une zone faible. */
  weakPoints: number[];
  flash: number;
  /** Super boss et titan : blocs et rotation des anneaux de blindage. */
  parts: BossPart[];
  ringRot: number[];
}

export type ProjectileKind = 'bullet' | 'pellet' | 'missile' | 'plasma';

export interface Projectile {
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  /** Plasma : ennemis encore traversables et déjà touchés. */
  pierce: number;
  hit: number[];
  /** Missile : rayon d'explosion. */
  splash: number;
  life: number;
  /** Ricochet : rebonds restants sur les bords. */
  bounces: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
}

export interface Spawn {
  /** Instant d'apparition depuis le début de la vague. */
  t: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  amp: number;
  freq: number;
  phase: number;
}

export interface WaveState {
  /** Vague en cours (0-indexée). */
  index: number;
  total: number;
  /** Temps depuis le début de la vague en cours (négatif : attente avant la vague). */
  time: number;
  queue: Spawn[];
  /** Nombre d'ennemis de la vague en cours (pour la barre de progression). */
  size: number;
}

export interface Cannon {
  x: number;
  y: number;
  /** Angle du fût (radians, −π/2 = vers le haut). */
  angle: number;
  hp: number;
  maxHp: number;
  fireTimer: number;
  /** Rafale en cours : tirs restants et délai. */
  burstLeft: number;
  burstTimer: number;
  /** Rayon (canon « Rayon ») : actif et extrémité haute atteinte. */
  beamOn: boolean;
  beamTop: number;
  /** Jumeaux et Ricochet : fût ou angle alterné à chaque tir. */
  alt: number;
  /** Gatling : montée en cadence (0 à 1). */
  spin: number;
  /** Foudre : arcs tirés à ce pas (dégâts), lancés par la simulation. */
  bolts: number[];
  invulnerable: number;
  shieldTime: number;
  autoAimTime: number;
  cooldowns: Record<ActiveAbilityId, number>;
}

export interface WeaponState {
  laserTimer: number;
  laserActive: number;
  /** Dégâts du laser sur le boss pas encore affichés (affichage groupé). */
  laserAcc: number;
  lightningTimer: number;
  orbAngle: number;
  /** Drones, Nova, Trou de ver : recharges. */
  droneTimer: number;
  novaTimer: number;
  vortexTimer: number;
  /** Trou de ver actif : position et temps restant. */
  vortexX: number;
  vortexY: number;
  vortexTime: number;
}

/** Danger propre au monde : nuage de nébuleuse, astéroïde, éruption, trou noir, frappe ionique. */
export interface Hazard {
  id: number;
  kind: 'cloud' | 'rock' | 'flare' | 'hole' | 'strike';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  /** Éruption et frappe : temps restant d'alerte puis de brûlure. */
  timer: number;
  /** 0 = alerte, 1 = actif. */
  stage: number;
  rot: number;
  vr: number;
  flash: number;
}

export type Phase = 'waves' | 'bossIntro' | 'boss' | 'levelClear' | 'dying' | 'gameOver';

/** Partie en cours : tout est perdu à la défaite. */
export interface RunState {
  level: number;
  /** Niveau de départ (début de monde). */
  startLevel: number;
  /** Record avant cette partie (pour annoncer un nouveau record). */
  previousBest: number;
  coins: number;
  upgrades: Record<RunUpgradeId, number>;
  phase: Phase;
  phaseTimer: number;
  /** Phase à reprendre après la seconde chance. */
  resumePhase: Phase;
  /** Boss doré pour ce niveau. */
  golden: boolean;
  /** Temps de simulation de la partie (secondes, ralenti compris). */
  time: number;
  /** Facteur de ralenti (explosion du canon). */
  timeScale: number;
  waves: WaveState;
  bosses: Boss[];
  cannon: Cannon;
  weapons: WeaponState;
  enemies: Enemy[];
  projectiles: Projectile[];
  bullets: Bullet[];
  hazards: Hazard[];
  hazardTimer: number;
  kills: number;
  coinsEarned: number;
  diamondsEarned: number;
  gemsEarned: number;
  /** Seconde chance déjà utilisée. */
  continued: boolean;
  diamondsDoubled: boolean;
  /** Le canon a été touché pendant la phase boss (succès « sans dégâts »). */
  hitDuringBoss: boolean;
  /** Premier niveau de la série en cours sans aucun dégât (succès « monde sans dégât »). */
  noHitFrom: number;
  nextId: number;
}

export interface DailyObjective {
  id: DailyKind;
  target: number;
  gems: number;
  progress: number;
  claimed: boolean;
}

export interface DailyState {
  /** Jour (AAAA-MM-JJ) fourni par l'interface. */
  date: string;
  objectives: DailyObjective[];
  /** Bonus quand tous les objectifs du jour sont récupérés. */
  bonusClaimed: boolean;
}

export interface CollectionState {
  /** Indices des formes de boss vaincues (normales et dorées). */
  bosses: number[];
  golden: number[];
  enemies: EnemyKind[];
  /** Super boss et titans vaincus. */
  special: BossKind[];
}

/** Progression permanente. */
export interface MetaState {
  diamonds: number;
  gems: number;
  bestLevel: number;
  /** Plus haut niveau terminé (bonus de premier passage). */
  highestCleared: number;
  workshop: Record<WorkshopId, number>;
  /** Niveau des capacités (0 = verrouillée ; angle de visée : 0 = angle de base). */
  abilities: Record<AbilityId, number>;
  /** Niveau des armes (0 = verrouillée). */
  weapons: Record<WeaponId, number>;
  equipped: WeaponId[];
  /** Canons débloqués et canon choisi. */
  cannons: Record<CannonId, boolean>;
  cannon: CannonId;
  stats: Record<StatId, number>;
  /** Succès débloqués, et ceux dont la récompense a été récupérée. */
  achievements: string[];
  achievementsClaimed: string[];
  collection: CollectionState;
  daily: DailyState;
  campaignComplete: boolean;
  /** Mondes (0-indexés) terminés en une partie sans prendre aucun dégât. */
  flawless: number[];
  /** Boost ×2 restant (secondes de jeu). */
  boostTime: number;
}

/** Commandes du joueur, déjà traduites en coordonnées monde par l'interface. */
export interface Input {
  /** Position vers laquelle déplacer le canon (null = ne bouge pas). */
  moveX: number | null;
  moveY: number | null;
}

export interface GameState {
  run: RunState;
  meta: MetaState;
  input: Input;
  /** Graine du générateur pseudo-aléatoire. */
  seed: number;
  time: number;
}

export function record<K extends string, V>(keys: readonly K[], value: V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>;
}

export function createMeta(): MetaState {
  const cannons = record(CANNONS, false);
  cannons.classic = true;
  return {
    diamonds: 0,
    gems: 0,
    bestLevel: 1,
    highestCleared: 0,
    workshop: record(WORKSHOP, 0),
    abilities: record(ABILITIES, 0),
    weapons: record(WEAPONS, 0),
    equipped: [],
    cannons,
    cannon: 'classic',
    stats: record(STATS, 0),
    achievements: [],
    achievementsClaimed: [],
    collection: { bosses: [], golden: [], enemies: [], special: [] },
    daily: { date: '', objectives: [], bonusClaimed: false },
    campaignComplete: false,
    flawless: [],
    boostTime: 0,
  };
}

export function createWaves(): WaveState {
  return { index: 0, total: 0, time: 0, queue: [], size: 0 };
}

export function createRun(meta: MetaState, level = 1): RunState {
  const upgrades = record(RUN_UPGRADES, 0);
  const stats = cannonStats(upgrades, meta.workshop, meta.cannon);
  return {
    level,
    startLevel: level,
    previousBest: meta.bestLevel,
    coins: 0,
    upgrades,
    phase: 'waves',
    phaseTimer: 0,
    resumePhase: 'waves',
    golden: false,
    time: 0,
    timeScale: 1,
    waves: createWaves(),
    bosses: [],
    cannon: {
      x: 0,
      y: BALANCE.world.cannonY,
      angle: -Math.PI / 2,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      fireTimer: 0,
      burstLeft: 0,
      burstTimer: 0,
      beamOn: false,
      beamTop: 0,
      alt: 0,
      spin: 0,
      bolts: [],
      invulnerable: 0,
      shieldTime: 0,
      autoAimTime: 0,
      cooldowns: record(ACTIVE_ABILITIES, 0),
    },
    weapons: {
      laserTimer: 2,
      laserActive: 0,
      laserAcc: 0,
      lightningTimer: 1,
      orbAngle: 0,
      droneTimer: 0.5,
      novaTimer: 2,
      vortexTimer: 3,
      vortexX: 0,
      vortexY: 0,
      vortexTime: 0,
    },
    enemies: [],
    projectiles: [],
    bullets: [],
    hazards: [],
    hazardTimer: 1,
    kills: 0,
    coinsEarned: 0,
    diamondsEarned: 0,
    gemsEarned: 0,
    continued: false,
    diamondsDoubled: false,
    hitDuringBoss: false,
    noHitFrom: level,
    nextId: 1,
  };
}

/** État complet ; la partie n'est préparée (vagues, boss) qu'au premier `step`. */
export function createState(seed = Date.now() | 0): GameState {
  const meta = createMeta();
  return { run: createRun(meta), meta, input: { moveX: null, moveY: null }, seed, time: 0 };
}

export const W = BALANCE.world;
