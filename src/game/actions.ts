import { damageBoss } from './boss';
import { isFighting } from './cannon';
import { BALANCE, WEAPONS } from './config';
import type { AbilityId, ActiveAbilityId, RunUpgradeId, WeaponId, WorkshopId } from './config';
import { killEnemy } from './enemies';
import type { GameEvent } from './events';
import {
  abilityCooldown,
  abilityDuration,
  abilityPrice,
  affordable,
  bulkCost,
  cannonStats,
  checkpointCoins,
  cost,
  shockwaveBossDamage,
  weaponSlots,
  weaponUpgradeCost,
  worldStart,
  worldsUnlocked,
} from './formulas';
import { checkAchievements } from './progress';
import { W, createRun } from './state';
import type { GameState } from './state';

/** Recalcule les PV max du canon ; un gain de PV max soigne d'autant. */
export function refreshMaxHp(state: GameState): void {
  const c = state.run.cannon;
  const maxHp = cannonStats(state.run.upgrades, state.meta.workshop).maxHp;
  if (maxHp > c.maxHp && c.hp > 0) c.hp += maxHp - c.maxHp;
  c.maxHp = maxHp;
  c.hp = Math.min(c.hp, maxHp);
}

/** Achète jusqu'à `count` niveaux avec les pièces (Infinity = max). Renvoie le nombre acheté. */
export function buyRunUpgrade(state: GameState, id: RunUpgradeId, count: number): number {
  const run = state.run;
  if (run.phase === 'gameOver' || run.phase === 'dying') return 0;
  const def = BALANCE.runUpgrades[id];
  const owned = run.upgrades[id];
  const n = Math.min(count, affordable(def, owned, run.coins));
  if (n <= 0) return 0;
  run.coins = Math.max(0, run.coins - bulkCost(def, owned, n));
  run.upgrades[id] = owned + n;
  refreshMaxHp(state);
  return n;
}

export function workshopMaxed(state: GameState, id: WorkshopId): boolean {
  const max = BALANCE.workshop[id].maxLevel;
  return max !== undefined && state.meta.workshop[id] >= max;
}

/** Achète un niveau d'atelier avec les diamants. */
export function buyWorkshop(state: GameState, id: WorkshopId, events: GameEvent[] = []): boolean {
  const meta = state.meta;
  const def = BALANCE.workshop[id];
  if (workshopMaxed(state, id) || meta.diamonds < cost(def, meta.workshop[id])) return false;
  meta.diamonds -= cost(def, meta.workshop[id]);
  meta.workshop[id]++;
  refreshMaxHp(state);
  checkAchievements(state, events);
  return true;
}

/** Débloque (niveau 0 → 1) ou améliore une capacité avec des gemmes. */
export function buyAbility(state: GameState, id: AbilityId, events: GameEvent[] = []): boolean {
  const meta = state.meta;
  const level = meta.abilities[id];
  if (level >= BALANCE.abilities[id].maxLevel) return false;
  const price = abilityPrice(id, level);
  if (meta.gems < price) return false;
  meta.gems -= price;
  meta.abilities[id] = level + 1;
  checkAchievements(state, events);
  return true;
}

/** Débloque une arme (gemmes) ou l'améliore (diamants). Une arme débloquée s'équipe si un emplacement est libre. */
export function buyWeapon(state: GameState, id: WeaponId, events: GameEvent[] = []): boolean {
  const meta = state.meta;
  const def = BALANCE.weapons[id];
  const level = meta.weapons[id];
  if (level === 0) {
    if (meta.gems < def.gemCost) return false;
    meta.gems -= def.gemCost;
    meta.weapons[id] = 1;
    if (meta.equipped.length < weaponSlots(meta.bestLevel)) meta.equipped.push(id);
  } else {
    if (level >= def.maxLevel) return false;
    const price = weaponUpgradeCost(id, level);
    if (meta.diamonds < price) return false;
    meta.diamonds -= price;
    meta.weapons[id] = level + 1;
  }
  checkAchievements(state, events);
  return true;
}

/** Équipe ou retire une arme (dans la limite des emplacements). */
export function toggleEquip(state: GameState, id: WeaponId): boolean {
  const meta = state.meta;
  if (meta.weapons[id] === 0) return false;
  const i = meta.equipped.indexOf(id);
  if (i >= 0) {
    meta.equipped.splice(i, 1);
    return true;
  }
  if (meta.equipped.length >= weaponSlots(meta.bestLevel)) return false;
  meta.equipped.push(id);
  meta.equipped.sort((a, b) => WEAPONS.indexOf(a) - WEAPONS.indexOf(b));
  return true;
}

export function abilityReady(state: GameState, id: ActiveAbilityId): boolean {
  const run = state.run;
  return state.meta.abilities[id] > 0 && isFighting(run.phase) && run.cannon.cooldowns[id] <= 0;
}

/** Capacités actives (boutons). Renvoie true si elle a été déclenchée. */
export function useAbility(state: GameState, id: ActiveAbilityId, events: GameEvent[]): boolean {
  if (!abilityReady(state, id)) return false;
  const run = state.run;
  const c = run.cannon;
  const level = state.meta.abilities[id];
  c.cooldowns[id] = abilityCooldown(id, level);
  if (id === 'autoAim') {
    c.autoAimTime = abilityDuration(id, level);
  } else if (id === 'shield') {
    c.shieldTime = abilityDuration(id, level);
  } else {
    for (const e of run.enemies) if (e.hp > 0) killEnemy(state, e, events);
    for (const b of run.bullets) b.damage = 0;
    if (run.phase === 'boss') {
      for (const boss of run.bosses) {
        if (boss.hp > 0) damageBoss(state, boss, boss.maxHp * shockwaveBossDamage(level), boss.x, boss.y, events, { pierce: true });
      }
    }
  }
  state.meta.stats.abilityUses++;
  events.push({ type: 'ability', id });
  return true;
}

/** Seconde chance (une par partie) : canon réparé, la partie reprend où elle en était. */
export function continueRun(state: GameState, events: GameEvent[]): boolean {
  const run = state.run;
  if (run.phase !== 'gameOver' || run.continued) return false;
  const c = run.cannon;
  const cfg = BALANCE.cannon;
  run.continued = true;
  run.phase = run.resumePhase === 'dying' || run.resumePhase === 'gameOver' ? 'waves' : run.resumePhase;
  run.timeScale = 1;
  c.hp = c.maxHp * cfg.continueHp;
  c.invulnerable = cfg.continueInvulnerability;
  run.bullets.length = 0;
  // Les ennemis proches du canon disparaissent pour laisser respirer.
  for (const e of run.enemies) if (e.y > W.cannonY - 0.6) e.hp = -1;
  events.push({ type: 'continued' });
  return true;
}

/** Double les diamants gagnés pendant la partie (pub récompensée, une fois). */
export function doubleRunDiamonds(state: GameState): number {
  const run = state.run;
  if (run.diamondsDoubled || run.diamondsEarned <= 0) return 0;
  run.diamondsDoubled = true;
  state.meta.diamonds += run.diamondsEarned;
  const added = run.diamondsEarned;
  run.diamondsEarned *= 2;
  return added;
}

/** Pièces au départ d'une partie (atelier + reprise au début d'un monde). */
export function startingCoins(state: GameState, startLevel: number): number {
  const mult = cannonStats(state.run.upgrades, state.meta.workshop).coinMultiplier;
  return BALANCE.workshop.startCoins.effectPerLevel * state.meta.workshop.startCoins + checkpointCoins(startLevel) * mult;
}

/** Nouvelle partie au début du monde `world` (déjà atteint). La progression permanente est conservée. */
export function startRun(state: GameState, world = 0): void {
  const w = Math.max(0, Math.min(world, worldsUnlocked(state.meta.bestLevel) - 1));
  const level = worldStart(w);
  state.run = createRun(state.meta, level);
  state.run.coins = startingCoins(state, level);
  state.input.moveX = null;
  state.meta.stats.runs++;
}

/** Active le boost ×2 dégâts et pièces (pub récompensée). */
export function activateBoost(state: GameState): void {
  state.meta.boostTime = BALANCE.boost.durationMinutes * 60;
}
