import { ABILITIES, ACTIVE_ABILITIES, BALANCE, RUN_UPGRADES, STATS, WEAPONS, WORKSHOP } from './config';
import type { AbilityId, ActiveAbilityId, EnemyKind, RunUpgradeId, StatId, WeaponId, WorkshopId } from './config';
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
  /** Étape du comportement (tireur : descend / tire / repart ; kamikaze : descend / vise / fonce). */
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

export interface Boss {
  id: number;
  level: number;
  tier: number;
  shape: ShapeDef;
  radius: number;
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
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
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
  /** Angle du fût (radians, −π/2 = vers le haut). */
  angle: number;
  hp: number;
  maxHp: number;
  fireTimer: number;
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
  kills: number;
  coinsEarned: number;
  diamondsEarned: number;
  gemsEarned: number;
  /** Seconde chance déjà utilisée. */
  continued: boolean;
  diamondsDoubled: boolean;
  /** Le canon a été touché pendant la phase boss (succès « sans dégâts »). */
  hitDuringBoss: boolean;
  nextId: number;
}

export interface DailyState {
  /** Jour (AAAA-MM-JJ) fourni par l'interface. */
  date: string;
  kills: number;
  done: boolean;
}

export interface CollectionState {
  /** Indices des formes de boss vaincues (normales et dorées). */
  bosses: number[];
  golden: number[];
  enemies: EnemyKind[];
}

/** Progression permanente. */
export interface MetaState {
  diamonds: number;
  gems: number;
  bestLevel: number;
  /** Plus haut niveau terminé (bonus de premier passage). */
  highestCleared: number;
  workshop: Record<WorkshopId, number>;
  /** Niveau des capacités (0 = verrouillée). */
  abilities: Record<AbilityId, number>;
  /** Niveau des armes (0 = verrouillée). */
  weapons: Record<WeaponId, number>;
  equipped: WeaponId[];
  stats: Record<StatId, number>;
  achievements: string[];
  collection: CollectionState;
  daily: DailyState;
  campaignComplete: boolean;
  /** Boost ×2 restant (secondes de jeu). */
  boostTime: number;
}

/** Commandes du joueur, déjà traduites en coordonnées monde par l'interface. */
export interface Input {
  /** Abscisse vers laquelle déplacer le canon (null = ne bouge pas). */
  moveX: number | null;
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
  return {
    diamonds: 0,
    gems: 0,
    bestLevel: 1,
    highestCleared: 0,
    workshop: record(WORKSHOP, 0),
    abilities: record(ABILITIES, 0),
    weapons: record(WEAPONS, 0),
    equipped: [],
    stats: record(STATS, 0),
    achievements: [],
    collection: { bosses: [], golden: [], enemies: [] },
    daily: { date: '', kills: 0, done: false },
    campaignComplete: false,
    boostTime: 0,
  };
}

export function createWaves(): WaveState {
  return { index: 0, total: 0, time: 0, queue: [], size: 0 };
}

export function createRun(meta: MetaState, level = 1): RunState {
  const upgrades = record(RUN_UPGRADES, 0);
  const stats = cannonStats(upgrades, meta.workshop);
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
      angle: -Math.PI / 2,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      fireTimer: 0,
      invulnerable: 0,
      shieldTime: 0,
      autoAimTime: 0,
      cooldowns: record(ACTIVE_ABILITIES, 0),
    },
    weapons: { laserTimer: 2, laserActive: 0, laserAcc: 0, lightningTimer: 1, orbAngle: 0 },
    enemies: [],
    projectiles: [],
    bullets: [],
    kills: 0,
    coinsEarned: 0,
    diamondsEarned: 0,
    gemsEarned: 0,
    continued: false,
    diamondsDoubled: false,
    hitDuringBoss: false,
    nextId: 1,
  };
}

/** État complet ; la partie n'est préparée (vagues, boss) qu'au premier `step` ou par `startLevel`. */
export function createState(seed = Date.now() | 0): GameState {
  const meta = createMeta();
  return { run: createRun(meta), meta, input: { moveX: null }, seed, time: 0 };
}

export const W = BALANCE.world;
