import { ACHIEVEMENTS, BALANCE, WEAPONS, WORKSHOP } from './config';
import type { AchievementStat, EnemyKind } from './config';
import type { GameEvent } from './events';
import type { GameState, MetaState } from './state';

/** Valeur courante d'une statistique de succès. */
export function statValue(meta: MetaState, stat: AchievementStat): number {
  switch (stat) {
    case 'bestLevel':
      return meta.bestLevel;
    case 'weaponsUnlocked':
      return WEAPONS.filter((w) => meta.weapons[w] > 0).length;
    case 'workshopLevels':
      return WORKSHOP.reduce((sum, id) => sum + meta.workshop[id], 0);
    default:
      return meta.stats[stat];
  }
}

/** Débloque les succès atteints et donne leurs gemmes. */
export function checkAchievements(state: GameState, events: GameEvent[]): void {
  const meta = state.meta;
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements.includes(a.id) || statValue(meta, a.stat) < a.goal) continue;
    meta.achievements.push(a.id);
    meta.gems += a.gems;
    state.run.gemsEarned += a.gems;
    events.push({ type: 'achievement', id: a.id, gems: a.gems });
  }
}

/** Change de jour : l'objectif quotidien repart à zéro. `date` est fournie par l'interface. */
export function rollDaily(meta: MetaState, date: string): void {
  if (meta.daily.date !== date) meta.daily = { date, kills: 0, done: false };
}

/** Compte un ennemi détruit (statistiques et objectif quotidien). */
export function addKill(state: GameState, events: GameEvent[]): void {
  const meta = state.meta;
  meta.stats.kills++;
  state.run.kills++;
  const d = meta.daily;
  if (d.date === '' || d.done) return;
  d.kills++;
  if (d.kills >= BALANCE.daily.kills) {
    d.done = true;
    meta.gems += BALANCE.daily.gems;
    state.run.gemsEarned += BALANCE.daily.gems;
    meta.stats.dailyCompleted++;
    events.push({ type: 'dailyComplete', gems: BALANCE.daily.gems });
  }
}

export function discoverEnemy(meta: MetaState, kind: EnemyKind): void {
  if (!meta.collection.enemies.includes(kind)) meta.collection.enemies.push(kind);
}

export function addToSet(list: number[], value: number): void {
  if (!list.includes(value)) list.push(value);
}
