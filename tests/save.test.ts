import { describe, expect, it } from 'vitest';
import { AutoPlayer, spendCoins } from '../src/game/autoplayer';
import type { GameEvent } from '../src/game/events';
import { STEP, step } from '../src/game/simulation';
import { createState } from '../src/game/state';
import {
  SAVE_VERSION,
  defaultExtra,
  defaultLanguage,
  defaultSettings,
  deserialize,
  exportCode,
  importCode,
  loadGame,
  migrate,
  saveGame,
  serialize,
} from '../src/storage/save';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

function played(seconds = 40) {
  const s = createState(12);
  const p = new AutoPlayer();
  const ev: GameEvent[] = [];
  for (let i = 0; i < seconds / STEP; i++) {
    p.play(s, ev);
    step(s, ev);
    spendCoins(s);
    ev.length = 0;
  }
  return s;
}

describe('sauvegarde v4', () => {
  it('aller-retour JSON : partie reprise au début du niveau, méta, paramètres', () => {
    const s = played();
    s.meta.diamonds = 7;
    s.meta.gems = 3;
    s.meta.abilities.shield = 2;
    s.meta.weapons.orbs = 3;
    s.meta.equipped = ['orbs'];
    s.meta.achievements = ['kills1'];
    s.meta.collection.bosses = [0];
    s.meta.achievementsClaimed = ['kills1'];
    s.meta.daily = {
      date: '2026-10-22',
      objectives: [{ id: 'kills', target: 150, gems: 3, progress: 12, claimed: false }],
      bonusClaimed: false,
      gemAds: 2,
    };
    s.meta.cannons.burst = true;
    s.meta.cannon = 'burst';
    s.meta.abilities.autoAim = 1;
    s.meta.abilities.aimAngle = 2;
    const settings = { ...defaultSettings(), music: 0.3, sfx: 0.4, vibration: false, powerSave: true, language: 'en' as const, cloudSync: true };
    const extra = { ...defaultExtra(), boostReadyAt: 123 };
    const data = JSON.parse(JSON.stringify(serialize(s, settings, extra, 1000)));
    expect(data.version).toBe(SAVE_VERSION);
    const back = deserialize(data);
    const r = back.state.run;
    expect(r.level).toBe(s.run.level);
    expect(r.phase).toBe('waves');
    expect(r.waves.total).toBe(0);
    expect(r.enemies).toHaveLength(0);
    expect(r.coins).toBeCloseTo(s.run.coins);
    expect(r.upgrades).toEqual(s.run.upgrades);
    expect(back.state.meta).toEqual(s.meta);
    expect(back.settings).toEqual(settings);
    expect(back.extra.boostReadyAt).toBe(123);
    expect(back.savedAt).toBe(1000);
    expect(back.hasRun).toBe(true);
  });

  it('partie perdue sauvegardée → nouvelle partie au niveau 1', () => {
    const s = createState(13);
    s.run.level = 6;
    s.run.phase = 'gameOver';
    const { state, hasRun } = deserialize(serialize(s, defaultSettings(), defaultExtra()));
    expect(state.run.level).toBe(1);
    expect(state.run.phase).toBe('waves');
    expect(hasRun).toBe(false);
  });

  it('migrations v1 → v2 → v3 → v4', () => {
    const v1 = { version: 1, level: 14, maxLevel: 15, coins: 99, kills: 20, upgrades: { damage: 3 } };
    expect(migrate(v1)?.version).toBe(SAVE_VERSION);
    const a = deserialize(v1);
    expect(a.state.run.level).toBe(1);
    expect(a.state.meta.bestLevel).toBe(15);

    const v2 = {
      version: 2,
      savedAt: 5000,
      run: { level: 7, coins: 42, upgrades: { damage: 2, fireRate: 1, maxHp: 0 }, hp: 5, over: false },
      meta: {
        diamonds: 30,
        gems: 4,
        bestLevel: 12,
        highestCleared: 11,
        upgrades: { damage: 3, fireRate: 1, maxHp: 2, coins: 1 },
        abilities: { shield: true, doubleShot: true, shockwave: false },
        totalKills: 321,
        runs: 6,
      },
      settings: { controlMode: 'drag', vibration: false },
    };
    const b = deserialize(v2);
    const m = b.state.meta;
    expect(m.diamonds).toBe(30);
    expect(m.gems).toBe(4);
    expect(m.bestLevel).toBe(12);
    expect(m.workshop).toEqual({ damage: 3, fireRate: 1, maxHp: 2, coins: 1, startCoins: 0, repair: 0, offline: 0 });
    expect(m.abilities).toEqual({ autoAim: 0, shield: 1, shockwave: 0, multishot: 1, aimAngle: 0 });
    expect(m.stats.kills).toBe(321);
    expect(m.stats.runs).toBe(6);
    expect(b.state.run.level).toBe(7);
    expect(b.state.run.coins).toBe(42);
    expect(b.state.run.upgrades.damage).toBe(2);
    expect(b.state.run.cannon.hp).toBe(5);
    expect(b.settings.vibration).toBe(false);
    expect(b.savedAt).toBe(5000);
    expect(m.cannon).toBe('classic');
  });

  it('migration v3 → v4 : succès déjà payés, canon classique, nouveaux objectifs du jour', () => {
    const v3 = {
      version: 3,
      meta: {
        bestLevel: 9,
        gems: 6,
        achievements: ['kills1', 'level5'],
        daily: { date: '2026-10-22', kills: 40, done: false },
      },
    };
    const m = deserialize(v3).state.meta;
    expect(m.achievementsClaimed).toEqual(['kills1', 'level5']);
    expect(m.gems).toBe(6);
    expect(m.cannon).toBe('classic');
    expect(m.cannons.classic).toBe(true);
    expect(m.cannons.burst).toBe(false);
    expect(m.daily.date).toBe('');
    expect(m.daily.objectives).toEqual([]);
  });

  it('canon choisi mais non débloqué → canon classique', () => {
    const { state } = deserialize({ version: 4, meta: { cannon: 'beam', cannons: { beam: false } } });
    expect(state.meta.cannon).toBe('classic');
  });

  it('données corrompues → valeurs par défaut', () => {
    expect(deserialize(null).state.run.level).toBe(1);
    expect(deserialize({ version: 999 }).state.run.level).toBe(1);
    const { state, settings } = deserialize({
      version: 3,
      run: { level: -3, coins: 'abc', upgrades: { damage: NaN } },
      meta: {
        diamonds: -5,
        abilities: { shield: 'oui' },
        weapons: { orbs: 2 },
        equipped: ['orbs', 'orbs', 'laser', 'canon'],
        collection: { bosses: [0, 99, 'x'], enemies: ['grunt', 'dragon'] },
        achievements: ['kills1', 4],
      },
      settings: { music: 7, language: 'de', vibration: 3 },
    });
    expect(state.run.level).toBe(1);
    expect(state.run.coins).toBe(0);
    expect(state.meta.diamonds).toBe(0);
    expect(state.meta.abilities.shield).toBe(0);
    expect(state.meta.equipped).toEqual(['orbs']);
    expect(state.meta.collection.bosses).toEqual([0]);
    expect(state.meta.collection.enemies).toEqual(['grunt']);
    expect(state.meta.achievements).toEqual(['kills1']);
    expect(settings.music).toBe(1);
    expect(settings.language).toBe(defaultSettings().language);
    expect(settings.vibration).toBe(true);
  });

  it('robuste aux fermetures brutales : stockage plein ou JSON tronqué', () => {
    const storage = new MemoryStorage();
    const s = played(10);
    saveGame(s, defaultSettings(), defaultExtra(), storage);
    expect(loadGame(storage).state.meta).toEqual(s.meta);
    storage.setItem('casseur-de-forme.save', '{"version":3,"meta":{"diam');
    expect(loadGame(storage).state.run.level).toBe(1);
    const full = new MemoryStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => saveGame(s, defaultSettings(), defaultExtra(), full)).not.toThrow();
  });

  it('export / import en code texte', () => {
    const s = played(10);
    s.meta.diamonds = 77;
    const code = exportCode(s, defaultSettings(), defaultExtra(), 42);
    expect(code.startsWith('CDF4.')).toBe(true);
    const back = importCode(code);
    expect(back?.state.meta.diamonds).toBe(77);
    expect(back?.savedAt).toBe(42);
    expect(importCode('n’importe quoi')).toBeNull();
    expect(importCode('CDF3.@@@')).toBeNull();
    expect(importCode('CDF3.' + btoa('{"version":99}'))).toBeNull();
    // Les anciens codes (v3) restent acceptés.
    expect(importCode('CDF3.' + btoa('{"version":3,"meta":{"diamonds":5}}'))?.state.meta.diamonds).toBe(5);
  });

  it('langue par défaut selon le navigateur', () => {
    expect(defaultLanguage('fr-FR')).toBe('fr');
    expect(defaultLanguage('en-US')).toBe('en');
    expect(defaultLanguage('de')).toBe('en');
  });
});
