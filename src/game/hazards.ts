import { boostMultiplier, hitCannon, isFighting } from './cannon';
import { BALANCE } from './config';
import type { GameEvent } from './events';
import { cannonStats, enemyStats, worldOf, worldTheme } from './formulas';
import { clamp } from './math';
import { nextRandom } from './rng';
import { W } from './state';
import type { GameState, Hazard } from './state';

/**
 * Dangers propres à chaque monde, qui agissent sur le canon :
 * - Nébuleuse : nuages lumineux qui font tirer le canon plus vite quand il est dedans ;
 * - Champ d'astéroïdes : rochers qui bloquent les tirs et blessent au contact ;
 * - Supernova : éruptions en colonne, annoncées, à esquiver ;
 * - Trou noir : attire le canon et dévie les tirs ;
 * - Tempête ionique : frappes annoncées autour du canon, capacités plus lentes à recharger.
 */
const HALF = W.width / 2;

function add(state: GameState, h: Omit<Hazard, 'id'>): Hazard {
  const hz = { id: state.run.nextId++, ...h };
  state.run.hazards.push(hz);
  return hz;
}

function blank(kind: Hazard['kind'], x: number, y: number, r: number): Omit<Hazard, 'id'> {
  return { kind, x, y, vx: 0, vy: 0, r, hp: 0, maxHp: 0, timer: 0, stage: 0, rot: 0, vr: 0, flash: 0 };
}

/** Position du trou noir : côté alterné à chaque niveau. */
export function blackHolePosition(level: number): { x: number; y: number } {
  const def = BALANCE.worlds[3];
  return { x: (level % 2 === 0 ? 1 : -1) * (def.x ?? 0.3), y: def.y ?? 0.95 };
}

function spawn(state: GameState): void {
  const run = state.run;
  const theme = worldTheme(run.level);
  const r = () => nextRandom(state);
  const c = run.cannon;
  const rMin = theme.radiusMin ?? 0.05;
  const rMax = theme.radiusMax ?? rMin;
  switch (theme.hazard) {
    case 'nebula': {
      const rad = rMin + (rMax - rMin) * r();
      const h = blank('cloud', (r() - 0.5) * 0.8, -rad, rad);
      h.vy = theme.speed ?? 0.05;
      h.vx = (r() - 0.5) * 0.04;
      add(state, h);
      run.hazardTimer = theme.interval ?? 5;
      break;
    }
    case 'asteroids': {
      const rad = rMin + (rMax - rMin) * r();
      const side = r() < 0.5 ? -1 : 1;
      const h = blank('rock', side * (0.2 + r() * 0.35), -rad - 0.02, rad);
      const speed = (theme.speed ?? 0.18) * (0.7 + r() * 0.6);
      h.vx = -side * speed * (0.15 + r() * 0.35);
      h.vy = speed;
      h.vr = (r() - 0.5) * 3;
      h.rot = r() * Math.PI * 2;
      const grunt = enemyStats('grunt', run.level);
      h.maxHp = grunt.hp * (theme.hpFactor ?? 2.5) * (rad / 0.04);
      h.hp = h.maxHp;
      add(state, h);
      run.hazardTimer = (theme.interval ?? 2.2) * (0.6 + r() * 0.8);
      break;
    }
    case 'flares': {
      const x = clamp(c.x + (r() - 0.5) * 0.5, -HALF + 0.08, HALF - 0.08);
      const h = blank('flare', x, 0, (theme.width ?? 0.14) / 2);
      h.timer = theme.warn ?? 1.2;
      add(state, h);
      run.hazardTimer = (theme.interval ?? 8) * (0.75 + r() * 0.5);
      break;
    }
    case 'ion': {
      const x = clamp(c.x + (r() - 0.5) * 0.3, -HALF + 0.05, HALF - 0.05);
      const y = clamp(c.y + (r() - 0.5) * 0.25, W.cannonMinY, W.cannonMaxY);
      const h = blank('strike', x, y, theme.radiusMin ?? 0.09);
      h.timer = theme.warn ?? 1;
      add(state, h);
      run.hazardTimer = (theme.interval ?? 3.5) * (0.7 + r() * 0.6);
      break;
    }
  }
}

/** Dégâts d'un rocher détruit par le joueur : il rapporte un peu de pièces. */
export function damageRock(state: GameState, h: Hazard, amount: number, events: GameEvent[]): void {
  if (h.hp <= 0) return;
  h.hp -= amount;
  h.flash = 0.06;
  if (h.hp <= 0) {
    const run = state.run;
    const coins = enemyStats('grunt', run.level).coins * cannonStats(run.upgrades, state.meta.workshop).coinMultiplier * boostMultiplier(state);
    run.coins += coins;
    run.coinsEarned += coins;
    events.push({ type: 'rockKilled', x: h.x, y: h.y, radius: h.r, coins });
  }
}

export function updateHazards(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  const theme = worldTheme(run.level);
  const c = run.cannon;
  const fighting = isFighting(run.phase);
  const maxHp = c.maxHp;

  if (theme.hazard === 'blackhole') {
    const pos = blackHolePosition(run.level);
    let hole = run.hazards.find((h) => h.kind === 'hole');
    if (!hole) hole = add(state, blank('hole', pos.x, pos.y, theme.radiusMin ?? 0.045));
    hole.x = pos.x;
    hole.y = pos.y;
    hole.rot += dt * 1.5;
    if (fighting) {
      // Attraction du canon (plus forte de près) et déviation des tirs.
      const dx = hole.x - c.x;
      const dy = hole.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = ((theme.pull ?? 0.16) * dt) / Math.max(0.35, d);
      c.x = clamp(c.x + (dx / d) * pull, W.cannonMinX, W.cannonMaxX);
      c.y = clamp(c.y + (dy / d) * pull, W.cannonMinY, W.cannonMaxY);
      const bend = (theme.bulletPull ?? 0.25) * dt;
      for (const p of run.projectiles) {
        const px = hole.x - p.x;
        const py = hole.y - p.y;
        const pd = Math.hypot(px, py) || 1;
        p.vx += (px / pd) * bend * 2;
      }
      for (const b of run.bullets) {
        const bx = hole.x - b.x;
        const by = hole.y - b.y;
        const bd = Math.hypot(bx, by) || 1;
        b.vx += (bx / bd) * bend * 0.6;
        b.vy += (by / bd) * bend * 0.3;
      }
      if (d < hole.r + BALANCE.cannon.radius) {
        if (hitCannon(state, maxHp * (theme.damage ?? 0.2), c.x, c.y, events)) {
          c.x = clamp(c.x - (dx / d) * 0.18, W.cannonMinX, W.cannonMaxX);
          c.y = clamp(c.y - (dy / d) * 0.18, W.cannonMinY, W.cannonMaxY);
          events.push({ type: 'cannonCrash', x: c.x, y: c.y });
        }
      }
    }
  } else if (fighting) {
    run.hazardTimer -= dt;
    if (run.hazardTimer <= 0) spawn(state);
  }

  for (const h of run.hazards) {
    h.flash = Math.max(0, h.flash - dt);
    switch (h.kind) {
      case 'cloud':
      case 'rock':
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
        if (h.kind === 'rock' && h.hp > 0 && fighting && Math.hypot(h.x - c.x, h.y - c.y) < h.r + BALANCE.cannon.radius) {
          hitCannon(state, enemyStats('grunt', run.level).damage * (theme.damageFactor ?? 1.5), h.x, h.y, events);
          h.hp = 0;
          events.push({ type: 'rockKilled', x: h.x, y: h.y, radius: h.r, coins: 0 });
        }
        if (h.y - h.r > W.height + 0.05 || Math.abs(h.x) > HALF + 0.4) h.hp = -1;
        break;
      case 'flare':
      case 'strike': {
        h.timer -= dt;
        if (h.stage === 0 && h.timer <= 0) {
          h.stage = 1;
          h.timer = h.kind === 'flare' ? (theme.burn ?? 0.6) : 0.25;
          events.push({ type: 'hazardStrike', kind: h.kind, x: h.x, y: h.kind === 'flare' ? c.y : h.y });
        } else if (h.stage === 0 && h.flash === 0 && h.timer > 0) {
          // Signal d'alerte une fois au début.
          if (h.rot === 0) {
            h.rot = 1;
            events.push({ type: 'hazardWarn', kind: h.kind, x: h.x, y: h.y });
          }
        }
        if (h.stage === 1 && h.vr === 0 && fighting) {
          const inside = h.kind === 'flare' ? Math.abs(c.x - h.x) < h.r + BALANCE.cannon.radius * 0.6 : Math.hypot(c.x - h.x, c.y - h.y) < h.r + BALANCE.cannon.radius * 0.5;
          if (inside && hitCannon(state, maxHp * (theme.damage ?? 0.25), c.x, c.y, events)) h.vr = 1;
        }
        if (h.stage === 1 && h.timer <= 0) h.hp = -1;
        break;
      }
      case 'hole':
        break;
    }
  }
  // Retire les dangers terminés (les nuages n'ont pas de PV : ils partent par le bas).
  run.hazards = run.hazards.filter((h) => {
    if (h.kind === 'cloud') return h.y - h.r < W.height + 0.05;
    if (h.kind === 'rock') return h.hp > 0;
    return h.hp >= 0;
  });
  if (theme.hazard !== 'blackhole') run.hazards = run.hazards.filter((h) => h.kind !== 'hole');
}

/** Monde courant (0-indexé) pour l'affichage. */
export function currentWorld(state: GameState): number {
  return worldOf(state.run.level);
}
