import { ABILITIES, DIAMOND_UPGRADES, RUN_UPGRADES, cannonStats } from '../game/formulas';
import { createMeta, createRun, createState } from '../game/state';
import type { GameState, MetaState } from '../game/state';

/**
 * Sauvegarde localStorage, JSON versionné avec migrations.
 * La partie en cours est reprise au début du niveau où elle s'était arrêtée.
 */
export const SAVE_KEY = 'casseur-de-forme.save';
export const SAVE_VERSION = 2;

export type ControlMode = 'drag' | 'dragAim' | 'fixedAim';
export const CONTROL_MODES: ControlMode[] = ['drag', 'dragAim', 'fixedAim'];

export interface Settings {
  controlMode: ControlMode;
  vibration: boolean;
}

export function defaultSettings(): Settings {
  return { controlMode: 'drag', vibration: true };
}

export interface SaveData {
  version: number;
  savedAt: number;
  run: {
    level: number;
    coins: number;
    upgrades: Record<string, number>;
    hp: number;
    over: boolean;
  };
  meta: MetaState;
  settings: Settings;
}

export interface Loaded {
  state: GameState;
  settings: Settings;
}

export function serialize(state: GameState, settings: Settings, now = Date.now()): SaveData {
  const run = state.run;
  return {
    version: SAVE_VERSION,
    savedAt: now,
    run: {
      level: run.level,
      coins: run.coins,
      upgrades: { ...run.upgrades },
      hp: run.cannon.hp,
      over: run.phase === 'gameOver',
    },
    meta: structuredClone(state.meta),
    settings: { ...settings },
  };
}

function num(v: unknown, fallback: number, min = 0): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback;
}

function int(v: unknown, fallback: number, min = 0): number {
  return Math.floor(num(v, fallback, min));
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

/** Migrations successives : chaque fonction fait passer de la version n à n + 1. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  // v1 (jeu idle) → v2 : l'ancienne partie n'a pas d'équivalent ; on repart au niveau 1
  // en gardant le meilleur niveau atteint comme record.
  1: (d) => ({
    version: 2,
    run: { level: 1, coins: 0, upgrades: {}, hp: 0, over: false },
    meta: { bestLevel: int(d.maxLevel, 1, 1) },
    settings: {},
  }),
};

export function migrate(raw: unknown): Raw | null {
  let d = obj(raw);
  let v = int(d.version, 0);
  if (v < 1 || v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    d = MIGRATIONS[v](d);
    v++;
  }
  return d;
}

/** Reconstruit l'état ; toute valeur invalide est remplacée par sa valeur par défaut. */
export function deserialize(raw: unknown): Loaded {
  const d = migrate(raw);
  if (!d) return { state: createState(), settings: defaultSettings() };

  const meta = createMeta();
  const m = obj(d.meta);
  meta.diamonds = num(m.diamonds, 0);
  meta.gems = num(m.gems, 0);
  meta.bestLevel = int(m.bestLevel, 1, 1);
  meta.highestCleared = int(m.highestCleared, 0);
  meta.totalKills = int(m.totalKills, 0);
  meta.runs = int(m.runs, 0);
  const mu = obj(m.upgrades);
  for (const id of DIAMOND_UPGRADES) meta.upgrades[id] = int(mu[id], 0);
  const ma = obj(m.abilities);
  for (const id of ABILITIES) meta.abilities[id] = ma[id] === true;

  const r = obj(d.run);
  const state = createState();
  state.meta = meta;
  state.run = createRun(meta, r.over === true ? 1 : int(r.level, 1, 1));
  if (r.over !== true) {
    state.run.coins = num(r.coins, 0);
    const ru = obj(r.upgrades);
    for (const id of RUN_UPGRADES) state.run.upgrades[id] = int(ru[id], 0);
    const maxHp = cannonStats(state.run.upgrades, meta.upgrades).maxHp;
    state.run.cannon.maxHp = maxHp;
    const hp = num(r.hp, 0);
    state.run.cannon.hp = hp > 0 ? Math.min(hp, maxHp) : maxHp;
  }

  const s = obj(d.settings);
  const settings = defaultSettings();
  if (CONTROL_MODES.includes(s.controlMode as ControlMode)) settings.controlMode = s.controlMode as ControlMode;
  if (typeof s.vibration === 'boolean') settings.vibration = s.vibration;

  return { state, settings };
}

export function loadGame(storage: Storage = localStorage): Loaded {
  try {
    const text = storage.getItem(SAVE_KEY);
    return deserialize(text ? JSON.parse(text) : null);
  } catch {
    return deserialize(null);
  }
}

export function saveGame(state: GameState, settings: Settings, storage: Storage = localStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(state, settings)));
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
