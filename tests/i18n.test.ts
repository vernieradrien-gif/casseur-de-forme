import { describe, expect, it } from 'vitest';
import { ABILITIES, ACHIEVEMENTS, BALANCE, CANNONS, ENEMY_KINDS, PASSIVE_STATS, RUN_UPGRADES, WEAPONS, WORKSHOP } from '../src/game/config';
import { formatNumber } from '../src/game/bignum';
import en from '../src/i18n/en.json';
import fr from '../src/i18n/fr.json';
import { formatDuration, setLanguage, t } from '../src/i18n';

describe('textes français et anglais', () => {
  it('les deux langues ont exactement les mêmes clés', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('les mêmes paramètres {…} dans chaque traduction', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) expect(params(en[k]), k).toEqual(params(fr[k]));
  });

  it('tous les éléments du jeu ont un nom', () => {
    const keys = [
      ...RUN_UPGRADES.flatMap((id) => [`run.${id}.name`, `run.${id}.desc`]),
      ...WORKSHOP.flatMap((id) => [`meta.${id}.name`, `meta.${id}.desc`]),
      ...WEAPONS.flatMap((id) => [`weapon.${id}.name`, `weapon.${id}.desc`]),
      ...ABILITIES.flatMap((id) => [`ability.${id}.name`, `ability.${id}.desc`]),
      ...ENEMY_KINDS.flatMap((k) => [`enemy.${k}.name`, `enemy.${k}.desc`]),
      ...BALANCE.tiers.flatMap((_, i) => [`boss.${i}`, `bossProp.${i}`]),
      ...ACHIEVEMENTS.map((a) => `ach.${a.stat}`),
    ];
    for (const k of keys) expect(k in fr, k).toBe(true);
  });

  it('45 succès, identifiants uniques', () => {
    expect(ACHIEVEMENTS).toHaveLength(45);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(45);
  });

  it('chaque canon a un nom, une description et des bonus valides', () => {
    for (const id of CANNONS) {
      expect(`cannon.${id}.name` in fr, id).toBe(true);
      expect(`cannon.${id}.desc` in fr, id).toBe(true);
      for (const p of BALANCE.cannons[id].passive ?? []) {
        expect(PASSIVE_STATS, id).toContain(p.stat);
        expect(`passive.${p.stat}` in fr, p.stat).toBe(true);
      }
    }
  });

  it('changement de langue : textes et séparateur décimal', () => {
    setLanguage('en');
    expect(t('resume')).toBe('Resume');
    expect(formatNumber(1234)).toBe('1.2 K');
    expect(formatDuration(3700)).toBe('1 h 1 min');
    setLanguage('fr');
    expect(t('resume')).toBe('Reprendre');
    expect(t('level', { level: 4 })).toBe('Niveau 4');
    expect(formatNumber(1234)).toBe('1,2 K');
    expect(formatDuration(125)).toBe('2 min 5 s');
  });
});
