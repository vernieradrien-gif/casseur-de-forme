import { ACHIEVEMENTS, BALANCE, CANNONS, WEAPONS, WORKSHOP } from './config';
import type { AchievementStat, CannonId, DailyKind, EnemyKind } from './config';
import type { GameEvent } from './events';
import type { DailyObjective, GameState, MetaState } from './state';
import { weaponSlots } from './formulas';

/** Valeur courante d'une statistique (succès, déblocage des canons). `world` : monde concerné (1 à 5). */
export function statValue(meta: MetaState, stat: AchievementStat | string, world = 0): number {
  switch (stat) {
    case 'bestLevel':
      return meta.bestLevel;
    case 'highestCleared':
      return meta.highestCleared;
    case 'weaponsUnlocked':
      return WEAPONS.filter((w) => meta.weapons[w] > 0).length;
    case 'workshopLevels':
      return WORKSHOP.reduce((sum, id) => sum + meta.workshop[id], 0);
    case 'cannonsUnlocked':
      return CANNONS.filter((c) => meta.cannons[c]).length;
    case 'worldCleared':
      return meta.highestCleared >= world * BALANCE.levelsPerWorld ? 1 : 0;
    case 'flawlessWorld':
      return meta.flawless.includes(world - 1) ? 1 : 0;
    default:
      return meta.stats[stat as keyof MetaState['stats']] ?? 0;
  }
}

/**
 * Récompenses de fin de monde : les armes cachées de l'armurerie sont offertes (niveau 1)
 * et équipées s'il reste un emplacement.
 */
export function checkWorldRewards(state: GameState, events: GameEvent[]): void {
  const meta = state.meta;
  const worldsDone = Math.floor(meta.highestCleared / BALANCE.levelsPerWorld);
  for (const id of WEAPONS) {
    const need = BALANCE.weapons[id].worldUnlock;
    if (!need || meta.weapons[id] > 0 || worldsDone < need) continue;
    meta.weapons[id] = 1;
    if (meta.equipped.length < weaponSlots(meta.bestLevel)) meta.equipped.push(id);
    events.push({ type: 'weaponUnlocked', id });
  }
}

/**
 * Débloque les succès atteints (la récompense se récupère dans l'écran Succès)
 * et les canons dont la condition est remplie.
 */
export function checkAchievements(state: GameState, events: GameEvent[]): void {
  const meta = state.meta;
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements.includes(a.id) || statValue(meta, a.stat, a.world) < a.goal) continue;
    meta.achievements.push(a.id);
    events.push({ type: 'achievement', id: a.id, gems: a.gems });
  }
  checkCannonUnlocks(state, events);
}

/** Succès débloqués dont la récompense n'a pas encore été récupérée. */
export function claimableAchievements(meta: MetaState): string[] {
  return meta.achievements.filter((id) => !meta.achievementsClaimed.includes(id));
}

/** Récupère la récompense d'un succès (en le touchant dans l'écran Succès). */
export function claimAchievement(state: GameState, id: string): number {
  const meta = state.meta;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def || !meta.achievements.includes(id) || meta.achievementsClaimed.includes(id)) return 0;
  meta.achievementsClaimed.push(id);
  meta.gems += def.gems;
  return def.gems;
}

/** Canons débloqués par un exploit (meilleur niveau, boss vaincus…). */
export function checkCannonUnlocks(state: GameState, events: GameEvent[]): void {
  const meta = state.meta;
  for (const id of CANNONS) {
    const def = BALANCE.cannons[id];
    if (meta.cannons[id] || !def.unlockStat) continue;
    if (statValue(meta, def.unlockStat) >= def.unlockValue) {
      meta.cannons[id] = true;
      events.push({ type: 'cannonUnlocked', id });
    }
  }
}

export function cannonUnlockProgress(meta: MetaState, id: CannonId): { value: number; goal: number } | null {
  const def = BALANCE.cannons[id];
  if (!def.unlockStat) return null;
  return { value: Math.min(def.unlockValue, statValue(meta, def.unlockStat)), goal: def.unlockValue };
}

// ---------------------------------------------------------------- Objectifs du jour

/** Petit hachage du jour : les mêmes objectifs pour tout le monde le même jour. */
function hashDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Choisit les objectifs du jour (différents chaque jour, toujours les mêmes pour un jour donné). */
export function dailyObjectivesFor(date: string): DailyObjective[] {
  const pool = [...BALANCE.daily.pool];
  let h = hashDate(date);
  const out: DailyObjective[] = [];
  while (out.length < BALANCE.daily.count && pool.length > 0) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const def = pool.splice(h % pool.length, 1)[0];
    out.push({ id: def.id as DailyKind, target: def.target, gems: def.gems, progress: 0, claimed: false });
  }
  return out;
}

/** Change de jour : de nouveaux objectifs. `date` est fournie par l'interface. */
export function rollDaily(meta: MetaState, date: string): void {
  if (meta.daily.date !== date) meta.daily = { date, objectives: dailyObjectivesFor(date), bonusClaimed: false, gemAds: 0 };
}

/** Fait avancer les objectifs du jour d'un type donné. */
export function addDaily(state: GameState, kind: DailyKind, amount: number, events: GameEvent[]): void {
  for (const o of state.meta.daily.objectives) {
    if (o.id !== kind || o.progress >= o.target) continue;
    o.progress = Math.min(o.target, o.progress + amount);
    if (o.progress >= o.target) events.push({ type: 'dailyComplete', id: o.id, gems: o.gems });
  }
}

export function claimableDaily(meta: MetaState): number {
  const n = meta.daily.objectives.filter((o) => o.progress >= o.target && !o.claimed).length;
  return n + (dailyBonusReady(meta) ? 1 : 0);
}

export function dailyBonusReady(meta: MetaState): boolean {
  const d = meta.daily;
  return !d.bonusClaimed && d.objectives.length > 0 && d.objectives.every((o) => o.claimed);
}

/** Récupère la récompense d'un objectif du jour terminé. */
export function claimDaily(state: GameState, index: number): number {
  const meta = state.meta;
  const o = meta.daily.objectives[index];
  if (!o || o.claimed || o.progress < o.target) return 0;
  o.claimed = true;
  meta.gems += o.gems;
  meta.stats.dailyCompleted++;
  return o.gems;
}

/** Pubs « gemmes » encore disponibles aujourd'hui. */
export function gemAdsLeft(meta: MetaState): number {
  return Math.max(0, BALANCE.gemAds.perDay - meta.daily.gemAds);
}

/** Récompense d'une pub « gemmes » (au plus perDay par jour). Renvoie les gemmes gagnées. */
export function claimGemAd(state: GameState): number {
  const meta = state.meta;
  if (gemAdsLeft(meta) <= 0) return 0;
  meta.daily.gemAds++;
  meta.gems += BALANCE.gemAds.gems;
  return BALANCE.gemAds.gems;
}

/** Bonus quand tous les objectifs du jour ont été récupérés. */
export function claimDailyBonus(state: GameState): number {
  const meta = state.meta;
  if (!dailyBonusReady(meta)) return 0;
  meta.daily.bonusClaimed = true;
  meta.gems += BALANCE.daily.allBonus;
  return BALANCE.daily.allBonus;
}

// ---------------------------------------------------------------- Statistiques

/** Compte un ennemi détruit (statistiques et objectifs du jour). */
export function addKill(state: GameState, events: GameEvent[]): void {
  state.meta.stats.kills++;
  state.run.kills++;
  addDaily(state, 'kills', 1, events);
}

export function discoverEnemy(meta: MetaState, kind: EnemyKind): void {
  if (!meta.collection.enemies.includes(kind)) meta.collection.enemies.push(kind);
}

export function addToSet<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}
