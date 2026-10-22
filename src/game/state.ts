import { shapeHp } from './formulas';
import type { UpgradeId } from './formulas';

export interface Shape {
  level: number;
  sides: number;
  hp: number;
  maxHp: number;
  rotation: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
}

export interface GameState {
  level: number;
  maxLevel: number;
  coins: number;
  kills: number;
  upgrades: Record<UpgradeId, number>;
  /** null pendant le court délai entre deux formes. */
  shape: Shape | null;
  respawnTimer: number;
  cannonTimer: number;
  projectiles: Projectile[];
  /** Temps de jeu simulé, en secondes. */
  time: number;
}

/** Jalon 1 : toutes les formes sont des triangles. */
export function createShape(level: number): Shape {
  const hp = shapeHp(level);
  return { level, sides: 3, hp, maxHp: hp, rotation: 0 };
}

export function createState(): GameState {
  return {
    level: 1,
    maxLevel: 1,
    coins: 0,
    kills: 0,
    upgrades: { damage: 0 },
    shape: createShape(1),
    respawnTimer: 0,
    cannonTimer: 0,
    projectiles: [],
    time: 0,
  };
}
