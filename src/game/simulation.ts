import { BALANCE, cannonDamage, shapeCoins, upgradeBulkCost, upgradeMaxAffordable } from './formulas';
import type { UpgradeId } from './formulas';
import { pointInPolygon, polygonVertices } from './geometry';
import { createShape } from './state';
import type { GameState } from './state';

/** Pas de temps fixe de la simulation : 60 mises à jour par seconde. */
export const STEP = 1 / 60;

export type GameEvent =
  | { type: 'shot' }
  | { type: 'hit'; x: number; y: number; damage: number }
  | { type: 'destroyed'; level: number; coins: number; sides: number; rotation: number; radius: number }
  | { type: 'spawn'; level: number };

/** Position du canon (repère monde : forme centrée en 0,0, y vers le bas). */
export function cannonPosition(): { x: number; y: number } {
  return { x: 0, y: BALANCE.cannon.distance };
}

/** Fait avancer la simulation d'un pas fixe. Les événements servent au rendu (effets). */
export function step(state: GameState, events: GameEvent[]): void {
  const dt = STEP;
  const cfg = BALANCE;
  state.time += dt;

  // Apparition de la forme suivante.
  if (!state.shape) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) {
      state.shape = createShape(state.level);
      events.push({ type: 'spawn', level: state.level });
    }
  }

  const shape = state.shape;
  if (shape) shape.rotation = (shape.rotation + cfg.shape.rotationSpeed * dt) % (Math.PI * 2);

  // Canon automatique : ne tire que si une forme est présente.
  const interval = 1 / cfg.cannon.shotsPerSecond;
  if (shape) {
    state.cannonTimer += dt;
    while (state.cannonTimer >= interval) {
      state.cannonTimer -= interval;
      const c = cannonPosition();
      const d = Math.hypot(c.x, c.y);
      const speed = cfg.cannon.projectileSpeed;
      state.projectiles.push({
        x: c.x,
        y: c.y,
        vx: (-c.x / d) * speed,
        vy: (-c.y / d) * speed,
        damage: cannonDamage(state.upgrades.damage),
      });
      events.push({ type: 'shot' });
    }
  } else {
    state.cannonTimer = Math.min(state.cannonTimer, interval);
  }

  // Déplacement et collisions des projectiles.
  const poly = shape ? polygonVertices(shape.sides, cfg.shape.radius, shape.rotation) : null;
  const kept = [];
  for (const p of state.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const current = state.shape;
    if (current && poly && (pointInPolygon(p, poly) || Math.hypot(p.x, p.y) < 0.02)) {
      current.hp -= p.damage;
      events.push({ type: 'hit', x: p.x, y: p.y, damage: p.damage });
      if (current.hp <= 0) destroyShape(state, events);
      continue;
    }
    // Projectile perdu (forme absente) : disparaît au centre.
    if (!current && p.vx * p.x + p.vy * p.y >= 0) continue;
    kept.push(p);
  }
  state.projectiles = kept;
}

function destroyShape(state: GameState, events: GameEvent[]): void {
  const shape = state.shape;
  if (!shape) return;
  const coins = shapeCoins(shape.level);
  state.coins += coins;
  state.kills++;
  events.push({
    type: 'destroyed',
    level: shape.level,
    coins,
    sides: shape.sides,
    rotation: shape.rotation,
    radius: BALANCE.shape.radius,
  });
  state.level++;
  state.maxLevel = Math.max(state.maxLevel, state.level);
  state.shape = null;
  state.respawnTimer = BALANCE.shape.respawnDelay;
}

/** Achète jusqu'à `count` niveaux (Infinity = max). Renvoie le nombre réellement acheté. */
export function buyUpgrade(state: GameState, id: UpgradeId, count: number): number {
  const owned = state.upgrades[id];
  const n = Math.min(count, upgradeMaxAffordable(id, owned, state.coins));
  if (n <= 0) return 0;
  state.coins = Math.max(0, state.coins - upgradeBulkCost(id, owned, n));
  state.upgrades[id] = owned + n;
  return n;
}
