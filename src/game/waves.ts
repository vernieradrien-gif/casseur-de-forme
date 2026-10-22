import { BALANCE } from './config';
import type { EnemyKind, FormationId } from './config';
import { spawnEnemy } from './enemies';
import type { GameEvent } from './events';
import { enemiesPerWave, newEnemyAt, pickEnemyKind, pickFormation } from './formulas';
import { nextRandom } from './rng';
import { W } from './state';
import type { GameState, Spawn } from './state';

const TOP = -0.05;

/** Nombre d'ennemis d'une vague selon le type principal (les plus résistants viennent moins nombreux). */
export function waveSize(level: number, kind: EnemyKind): number {
  return Math.max(2, Math.round(enemiesPerWave(level) * BALANCE.enemies[kind].waveShare));
}

/**
 * Prépare une vague : une formation lisible (ligne, V, serpent, pluie, côtés, éventail),
 * un type principal (le nouveau type est présenté seul dans la première vague de son niveau),
 * parfois un second type mêlé, et rarement une étoile dorée.
 */
export function planWave(state: GameState, level: number, index: number, bossX = 0): Spawn[] {
  const r = () => nextRandom(state);
  const cfg = BALANCE.waves;
  const formation: FormationId = pickFormation(level, r());
  const intro = index === 0 ? newEnemyAt(level) : null;
  const main = intro ?? pickEnemyKind(level, r());
  const second = !intro && level >= cfg.mixFromLevel && r() < cfg.mixChance ? pickEnemyKind(level, r()) : null;
  const count = waveSize(level, main);
  const kindAt = (i: number): EnemyKind => (second && i % 3 === 2 ? second : main);
  const spawns: Spawn[] = [];
  const add = (i: number, t: number, x: number, y: number, vx: number, vy: number, amp = 0, freq = 0, phase = 0) =>
    spawns.push({ t, kind: kindAt(i), x, y, vx, vy, amp, freq, phase });

  switch (formation) {
    case 'line': {
      const rows = Math.ceil(count / cfg.rowSize);
      let i = 0;
      for (let row = 0; row < rows; row++) {
        const n = Math.min(cfg.rowSize, count - i);
        for (let k = 0; k < n; k++) {
          const x = n === 1 ? (r() - 0.5) * 0.4 : -0.36 + (0.72 * k) / (n - 1);
          add(i++, row * 0.9, x, TOP, 0, 1);
        }
      }
      break;
    }
    case 'rain':
      for (let i = 0; i < count; i++) add(i, i * 0.32 + r() * 0.15, (r() - 0.5) * 0.84, TOP, 0, 1);
      break;
    case 'snake': {
      const x0 = (r() - 0.5) * 0.3;
      const freq = 2 + r() * 0.6;
      for (let i = 0; i < count; i++) add(i, i * 0.3, x0, TOP, 0, 1, 0.22, freq, 0);
      break;
    }
    case 'v': {
      const x0 = (r() - 0.5) * 0.3;
      const half = Math.ceil((count - 1) / 2);
      const dx = Math.min(0.065, (0.42 - Math.abs(x0)) / Math.max(1, half));
      for (let i = 0; i < count; i++) {
        const k = Math.ceil(i / 2);
        const side = i % 2 === 1 ? -1 : 1;
        add(i, 0, x0 + side * k * dx, TOP - k * 0.055, 0, 1);
      }
      break;
    }
    case 'fan': {
      const spread = 1.6;
      for (let i = 0; i < count; i++) {
        const a = Math.PI / 2 + spread * (count === 1 ? 0 : i / (count - 1) - 0.5);
        add(i, i * 0.1, bossX + (r() - 0.5) * 0.08, W.bossY + 0.1, Math.cos(a), Math.sin(a));
      }
      break;
    }
    case 'sides':
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const k = Math.floor(i / 2);
        add(i, k * 0.35, side * 0.56, 0.08 + (k % 3) * 0.04, -side * 0.75, 0.66);
      }
      break;
  }

  // Étoile dorée : rare, elle zigzague puis s'enfuit.
  const rare = BALANCE.enemies.rare;
  if (level >= rare.fromLevel && r() < BALANCE.rareChance * count) {
    const t = r() * 2;
    spawns.push({ t, kind: 'rare', x: (r() - 0.5) * 0.6, y: TOP, vx: 0, vy: 1, amp: 0, freq: 0, phase: 0 });
  }
  return spawns.sort((a, b) => a.t - b.t);
}

/** Lance la vague `index` (après `delay` secondes). */
export function startWave(state: GameState, index: number, delay: number, events: GameEvent[]): void {
  const run = state.run;
  const w = run.waves;
  w.index = index;
  w.time = -delay;
  w.queue = planWave(state, run.level, index, run.bosses[0]?.x ?? 0);
  w.size = w.queue.length;
  events.push({ type: 'waveStart', index, total: w.total });
}

export function waveAlive(state: GameState, index: number): number {
  let n = 0;
  for (const e of state.run.enemies) if (e.hp > 0 && e.wave === index) n++;
  return n;
}

/** Fait avancer les vagues ; renvoie true quand la dernière est terminée (détruite ou sortie). */
export function updateWaves(state: GameState, dt: number, events: GameEvent[]): boolean {
  const run = state.run;
  const w = run.waves;
  const cfg = BALANCE.level;
  w.time += dt;
  while (w.queue.length > 0 && w.queue[0].t <= w.time) {
    const s = w.queue.shift()!;
    spawnEnemy(state, run.level, s, w.index);
  }
  if (w.time < 0 || w.queue.length > 0) return false;
  const alive = waveAlive(state, w.index);
  if (w.index + 1 < w.total) {
    if (alive === 0 || w.time > cfg.waveMaxDuration) startWave(state, w.index + 1, cfg.waveGap, events);
    return false;
  }
  // Dernière vague : tous les ennemis des vagues doivent avoir disparu (sécurité : durée maximale doublée).
  const anyWaveEnemy = run.enemies.some((e) => e.hp > 0 && e.wave >= 0);
  return !anyWaveEnemy || w.time > cfg.waveMaxDuration * 2;
}

/** Progression des vagues entre 0 et 1 (barre du haut). */
export function waveProgress(state: GameState): number {
  const run = state.run;
  const w = run.waves;
  if (run.phase !== 'waves') return 1;
  if (w.total === 0) return 0;
  const inWave = w.size > 0 && w.time >= 0 ? 1 - (w.queue.length + waveAlive(state, w.index)) / w.size : 0;
  return Math.min(1, (w.index + Math.max(0, Math.min(1, inWave))) / w.total);
}
