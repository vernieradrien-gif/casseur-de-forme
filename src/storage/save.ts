import { createShape, createState } from '../game/state';
import type { GameState } from '../game/state';

/**
 * Sauvegarde minimale du jalon 1 (localStorage, JSON versionné).
 * Le système complet (migrations, export/import, méta-progression) arrive au jalon 3.
 */
export const SAVE_KEY = 'casseur-de-forme.save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: number;
  level: number;
  maxLevel: number;
  coins: number;
  kills: number;
  upgrades: { damage: number };
}

export function serialize(state: GameState, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    level: state.level,
    maxLevel: state.maxLevel,
    coins: state.coins,
    kills: state.kills,
    upgrades: { damage: state.upgrades.damage },
  };
}

function num(v: unknown, fallback: number, min = 0): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback;
}

/** Reconstruit un état à partir de données inconnues ; toute valeur invalide est remplacée par sa valeur par défaut. */
export function deserialize(raw: unknown): GameState {
  const state = createState();
  if (!raw || typeof raw !== 'object') return state;
  const d = raw as Partial<SaveData>;
  if (d.version !== SAVE_VERSION) return state;
  state.level = Math.floor(num(d.level, 1, 1));
  state.maxLevel = Math.max(state.level, Math.floor(num(d.maxLevel, 1, 1)));
  state.coins = num(d.coins, 0);
  state.kills = Math.floor(num(d.kills, 0));
  state.upgrades.damage = Math.floor(num(d.upgrades?.damage, 0));
  state.shape = createShape(state.level);
  return state;
}

export function loadGame(storage: Storage = localStorage): GameState {
  try {
    const text = storage.getItem(SAVE_KEY);
    return text ? deserialize(JSON.parse(text)) : createState();
  } catch {
    return createState();
  }
}

export function saveGame(state: GameState, storage: Storage = localStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(state)));
  } catch {
    // Stockage plein ou indisponible (navigation privée) : on continue sans sauvegarder.
  }
}

export function clearSave(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // ignoré
  }
}
