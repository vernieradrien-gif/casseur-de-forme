import { ABILITIES, ENEMY_KINDS, RUN_UPGRADES, STATS, WEAPONS, WORKSHOP } from '../game/config';
import type { EnemyKind, WeaponId } from '../game/config';
import { cannonStats, weaponSlots } from '../game/formulas';
import { createMeta, createRun, createState } from '../game/state';
import type { GameState, MetaState } from '../game/state';

/**
 * Sauvegarde localStorage, JSON versionné avec migrations (v1 → v2 → v3).
 * La partie en cours est reprise au début du niveau où elle s'était arrêtée.
 */
export const SAVE_KEY = 'casseur-de-forme.save';
export const SAVE_VERSION = 3;
const EXPORT_PREFIX = 'CDF3.';

export type Language = 'fr' | 'en';
export const LANGUAGES: Language[] = ['fr', 'en'];

export interface Settings {
  /** Volumes entre 0 et 1. */
  music: number;
  sfx: number;
  vibration: boolean;
  /** Économie d'énergie : rendu à 30 images/s. */
  powerSave: boolean;
  language: Language;
}

/** Informations hors simulation (horloge réelle). */
export interface Extra {
  /** Instant (ms) où le boost publicitaire redevient disponible. */
  boostReadyAt: number;
  /** Dernière publicité interstitielle (ms). */
  lastInterstitialAt: number;
  /** Écran de victoire (niveau 100) déjà montré. */
  victoryShown: boolean;
}

export function defaultLanguage(nav: string | undefined = typeof navigator !== 'undefined' ? navigator.language : 'fr'): Language {
  return (nav ?? 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function defaultSettings(): Settings {
  return { music: 0.6, sfx: 0.8, vibration: true, powerSave: false, language: defaultLanguage() };
}

export function defaultExtra(): Extra {
  return { boostReadyAt: 0, lastInterstitialAt: 0, victoryShown: false };
}

export interface SavedRun {
  level: number;
  startLevel: number;
  coins: number;
  upgrades: Record<string, number>;
  hp: number;
  over: boolean;
  continued: boolean;
  kills: number;
  coinsEarned: number;
  diamondsEarned: number;
  gemsEarned: number;
  diamondsDoubled: boolean;
}

export interface SaveData {
  version: number;
  savedAt: number;
  run: SavedRun;
  meta: MetaState;
  settings: Settings;
  extra: Extra;
}

export interface Loaded {
  state: GameState;
  settings: Settings;
  extra: Extra;
  /** Horodatage de la sauvegarde (0 si aucune) : sert au calcul des gains hors ligne. */
  savedAt: number;
  /** Une partie était en cours (niveau commencé, non perdue). */
  hasRun: boolean;
}

export function serialize(state: GameState, settings: Settings, extra: Extra, now = Date.now()): SaveData {
  const run = state.run;
  return {
    version: SAVE_VERSION,
    savedAt: now,
    run: {
      level: run.level,
      startLevel: run.startLevel,
      coins: run.coins,
      upgrades: { ...run.upgrades },
      hp: run.cannon.hp,
      over: run.phase === 'gameOver' || run.phase === 'dying',
      continued: run.continued,
      kills: run.kills,
      coinsEarned: run.coinsEarned,
      diamondsEarned: run.diamondsEarned,
      gemsEarned: run.gemsEarned,
      diamondsDoubled: run.diamondsDoubled,
    },
    meta: structuredClone(state.meta),
    settings: { ...settings },
    extra: { ...extra },
  };
}

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_VALUE): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? Math.min(v, max) : fallback;
}

function int(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.floor(num(v, fallback, min, max));
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

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
  // v2 → v3 : atelier = anciennes améliorations permanentes ; capacités booléennes → niveaux ;
  // Tir double → Multi-tir niveau 1 ; le mode de contrôle disparaît (glisser uniquement).
  2: (d) => {
    const m = obj(d.meta);
    const a = obj(m.abilities);
    const r = obj(d.run);
    return {
      version: 3,
      savedAt: d.savedAt,
      run: { level: r.level, startLevel: 1, coins: r.coins, upgrades: r.upgrades, hp: r.hp, over: r.over },
      meta: {
        diamonds: m.diamonds,
        gems: m.gems,
        bestLevel: m.bestLevel,
        highestCleared: m.highestCleared,
        workshop: m.upgrades,
        abilities: {
          shield: a.shield === true ? 1 : 0,
          shockwave: a.shockwave === true ? 1 : 0,
          multishot: a.doubleShot === true ? 1 : 0,
        },
        stats: { kills: m.totalKills, runs: m.runs },
      },
      settings: { vibration: obj(d.settings).vibration },
    };
  },
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

function readMeta(m: Raw): MetaState {
  const meta = createMeta();
  meta.diamonds = num(m.diamonds, 0);
  meta.gems = num(m.gems, 0);
  meta.bestLevel = int(m.bestLevel, 1, 1);
  meta.highestCleared = Math.min(int(m.highestCleared, 0), meta.bestLevel);
  const w = obj(m.workshop);
  for (const id of WORKSHOP) meta.workshop[id] = int(w[id], 0, 0, 10_000);
  const ab = obj(m.abilities);
  for (const id of ABILITIES) meta.abilities[id] = int(ab[id], 0, 0, 10);
  const wp = obj(m.weapons);
  for (const id of WEAPONS) meta.weapons[id] = int(wp[id], 0, 0, 1000);
  const eq = arr(m.equipped).filter((x): x is WeaponId => WEAPONS.includes(x as WeaponId) && meta.weapons[x as WeaponId] > 0);
  meta.equipped = [...new Set(eq)].slice(0, weaponSlots(meta.bestLevel));
  const st = obj(m.stats);
  for (const id of STATS) meta.stats[id] = int(st[id], 0);
  meta.achievements = [...new Set(arr(m.achievements).filter((x): x is string => typeof x === 'string'))];
  const col = obj(m.collection);
  const tiers = (v: unknown) => [...new Set(arr(v).filter((x): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 10))];
  meta.collection = {
    bosses: tiers(col.bosses),
    golden: tiers(col.golden),
    enemies: [...new Set(arr(col.enemies).filter((x): x is EnemyKind => ENEMY_KINDS.includes(x as EnemyKind)))],
  };
  const daily = obj(m.daily);
  meta.daily = {
    date: typeof daily.date === 'string' ? daily.date : '',
    kills: int(daily.kills, 0),
    done: daily.done === true,
  };
  meta.campaignComplete = m.campaignComplete === true;
  meta.boostTime = num(m.boostTime, 0, 0, 3600);
  return meta;
}

/** Reconstruit l'état ; toute valeur invalide est remplacée par sa valeur par défaut. */
export function deserialize(raw: unknown): Loaded {
  const d = migrate(raw);
  if (!d) return { state: createState(), settings: defaultSettings(), extra: defaultExtra(), savedAt: 0, hasRun: false };

  const meta = readMeta(obj(d.meta));
  const r = obj(d.run);
  const state = createState();
  state.meta = meta;
  const over = r.over === true;
  const level = over ? 1 : Math.min(int(r.level, 1, 1), Math.max(meta.bestLevel, 1) + 1);
  state.run = createRun(meta, level);
  const hasRun = !over && (level > 1 || num(r.coins, 0) > 0 || int(r.kills, 0) > 0);
  if (!over) {
    const run = state.run;
    run.startLevel = Math.min(int(r.startLevel, 1, 1), level);
    run.coins = num(r.coins, 0);
    const ru = obj(r.upgrades);
    for (const id of RUN_UPGRADES) run.upgrades[id] = int(ru[id], 0, 0, 100_000);
    run.continued = r.continued === true;
    run.kills = int(r.kills, 0);
    run.coinsEarned = num(r.coinsEarned, 0);
    run.diamondsEarned = num(r.diamondsEarned, 0);
    run.gemsEarned = num(r.gemsEarned, 0);
    run.diamondsDoubled = r.diamondsDoubled === true;
    const maxHp = cannonStats(run.upgrades, meta.workshop).maxHp;
    run.cannon.maxHp = maxHp;
    const hp = num(r.hp, 0);
    run.cannon.hp = hp > 0 ? Math.min(hp, maxHp) : maxHp;
  }

  const s = obj(d.settings);
  const settings = defaultSettings();
  settings.music = num(s.music, settings.music, 0, 1);
  settings.sfx = num(s.sfx, settings.sfx, 0, 1);
  if (typeof s.vibration === 'boolean') settings.vibration = s.vibration;
  if (typeof s.powerSave === 'boolean') settings.powerSave = s.powerSave;
  if (LANGUAGES.includes(s.language as Language)) settings.language = s.language as Language;

  const e = obj(d.extra);
  const extra: Extra = {
    boostReadyAt: num(e.boostReadyAt, 0),
    lastInterstitialAt: num(e.lastInterstitialAt, 0),
    victoryShown: e.victoryShown === true || meta.campaignComplete,
  };
  return { state, settings, extra, savedAt: num(d.savedAt, 0), hasRun };
}

export function loadGame(storage: Storage = localStorage): Loaded {
  try {
    const text = storage.getItem(SAVE_KEY);
    return deserialize(text ? JSON.parse(text) : null);
  } catch {
    return deserialize(null);
  }
}

export function saveGame(state: GameState, settings: Settings, extra: Extra, storage: Storage = localStorage, now = Date.now()): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(state, settings, extra, now)));
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

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(code: string): string {
  const bin = atob(code);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Code texte à copier pour transférer sa sauvegarde. */
export function exportCode(state: GameState, settings: Settings, extra: Extra, now = Date.now()): string {
  return EXPORT_PREFIX + toBase64(JSON.stringify(serialize(state, settings, extra, now)));
}

/** Lit un code d'export ; renvoie null s'il est invalide. */
export function importCode(code: string): Loaded | null {
  try {
    const text = code.trim();
    if (!text.startsWith(EXPORT_PREFIX)) return null;
    const raw: unknown = JSON.parse(fromBase64(text.slice(EXPORT_PREFIX.length)));
    if (!migrate(raw)) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}
