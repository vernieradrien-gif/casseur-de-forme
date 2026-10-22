import type { ActiveAbilityId, EnemyKind } from './config';
import type { Vec } from './geometry';

/**
 * Événements produits par la simulation : ils servent uniquement au rendu,
 * au son et à l'interface (jamais relus par la simulation).
 */
export type GameEvent =
  | { type: 'levelStart'; level: number; grand: boolean; golden: boolean; newEnemy: EnemyKind | null }
  | { type: 'waveStart'; index: number; total: number }
  | { type: 'shot'; x: number; y: number }
  | { type: 'enemyHit'; x: number; y: number; damage: number }
  | { type: 'enemyBlocked'; x: number; y: number }
  | { type: 'enemyKilled'; x: number; y: number; kind: EnemyKind; coins: number; gem: boolean; radius: number }
  | { type: 'enemyCrash'; x: number; y: number; kind: EnemyKind; radius: number }
  | { type: 'enemyShot'; x: number; y: number }
  | { type: 'waveShieldHit'; x: number; y: number }
  | { type: 'shieldDown'; x: number; y: number; radius: number }
  | { type: 'bossHit'; x: number; y: number; damage: number; weak: boolean }
  | { type: 'bossAbsorb'; x: number; y: number }
  | { type: 'bossShieldBroken'; x: number; y: number; radius: number }
  | { type: 'ringBroken'; x: number; y: number; radius: number }
  | { type: 'bossEnraged'; x: number; y: number }
  | { type: 'bossSplit'; x: number; y: number; radius: number; tier: number }
  | { type: 'bossFire'; x: number; y: number }
  | { type: 'bossKilled'; x: number; y: number; radius: number; tier: number; golden: boolean; rotation: number; level: number }
  | { type: 'levelClear'; level: number; coins: number; diamonds: number; gems: number; golden: boolean }
  | { type: 'cannonHit'; damage: number; x: number; y: number }
  | { type: 'cannonBlocked'; x: number; y: number }
  | { type: 'bulletDestroyed'; x: number; y: number }
  | { type: 'ability'; id: ActiveAbilityId }
  | { type: 'laser'; x: number }
  | { type: 'lightning'; points: Vec[] }
  | { type: 'cannonBurst'; x: number; y: number; step: number }
  | { type: 'cannonDestroyed'; x: number; y: number }
  | { type: 'gameOver'; level: number }
  | { type: 'continued' }
  | { type: 'achievement'; id: string; gems: number }
  | { type: 'dailyComplete'; gems: number }
  | { type: 'campaignComplete'; gems: number };
