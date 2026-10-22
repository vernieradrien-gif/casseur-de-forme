import { ABILITIES, BALANCE, DIAMOND_UPGRADES, RUN_UPGRADES, bossHp, bossShape, cannonStats } from './formulas';
import type { AbilityId, DiamondUpgradeId, EnemyKind, RunUpgradeId } from './formulas';
import type { ShapeDef, Vec } from './geometry';

export interface Boss {
  level: number;
  shape: ShapeDef;
  hp: number;
  maxHp: number;
  rotation: number;
  /** Temps avant la prochaine vague. */
  waveTimer: number;
  /** Ennemis restant à lancer dans la vague en cours. */
  spawnQueue: number;
  spawnTimer: number;
}

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
  /** Temps de vie (zigzag, animation). */
  age: number;
  /** Côté de départ du zigzag (±1). */
  phase: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
}

export interface Cannon {
  x: number;
  /** Angle du fût (radians, −π/2 = vers le haut). */
  angle: number;
  hp: number;
  maxHp: number;
  fireTimer: number;
  shieldTime: number;
  cooldowns: Record<AbilityId, number>;
}

export type Phase = 'playing' | 'levelClear' | 'gameOver';

/** Partie en cours : tout est perdu à la défaite. */
export interface RunState {
  level: number;
  coins: number;
  upgrades: Record<RunUpgradeId, number>;
  phase: Phase;
  phaseTimer: number;
  boss: Boss | null;
  cannon: Cannon;
  enemies: Enemy[];
  projectiles: Projectile[];
  kills: number;
  diamondsEarned: number;
  gemsEarned: number;
  nextEnemyId: number;
}

/** Progression permanente. */
export interface MetaState {
  diamonds: number;
  gems: number;
  bestLevel: number;
  /** Plus haut niveau dont le boss a été vaincu (bonus de premier passage). */
  highestCleared: number;
  upgrades: Record<DiamondUpgradeId, number>;
  abilities: Record<AbilityId, boolean>;
  totalKills: number;
  runs: number;
}

/** Commandes du joueur, déjà traduites en coordonnées monde par l'interface. */
export interface Input {
  /** Abscisse vers laquelle déplacer le canon (null = ne bouge pas). */
  moveX: number | null;
  /** Point à viser (null = visée automatique). */
  aim: Vec | null;
}

export interface GameState {
  run: RunState;
  meta: MetaState;
  input: Input;
  /** Graine du générateur pseudo-aléatoire. */
  seed: number;
  time: number;
}

function record<K extends string, V>(keys: K[], value: V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>;
}

export function createMeta(): MetaState {
  return {
    diamonds: 0,
    gems: 0,
    bestLevel: 1,
    highestCleared: 0,
    upgrades: record(DIAMOND_UPGRADES, 0),
    abilities: record(ABILITIES, false),
    totalKills: 0,
    runs: 0,
  };
}

export function createBoss(level: number): Boss {
  const hp = bossHp(level);
  return {
    level,
    shape: bossShape(level),
    hp,
    maxHp: hp,
    rotation: 0,
    waveTimer: BALANCE.waves.firstDelay,
    spawnQueue: 0,
    spawnTimer: 0,
  };
}

export function createRun(meta: MetaState, level = 1): RunState {
  const upgrades = record(RUN_UPGRADES, 0);
  const stats = cannonStats(upgrades, meta.upgrades);
  return {
    level,
    coins: 0,
    upgrades,
    phase: 'playing',
    phaseTimer: 0,
    boss: createBoss(level),
    cannon: {
      x: 0,
      angle: -Math.PI / 2,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      fireTimer: 0,
      shieldTime: 0,
      cooldowns: record(ABILITIES, 0),
    },
    enemies: [],
    projectiles: [],
    kills: 0,
    diamondsEarned: 0,
    gemsEarned: 0,
    nextEnemyId: 1,
  };
}

export function createState(seed = Date.now() | 0): GameState {
  const meta = createMeta();
  return { run: createRun(meta), meta, input: { moveX: null, aim: null }, seed, time: 0 };
}
