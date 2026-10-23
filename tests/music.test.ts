import { describe, expect, it } from 'vitest';
import { THEME_COUNT, themeFor } from '../src/audio/music';
import type { ThemeId } from '../src/audio/music';

const ids = (kind: 'wave' | 'boss', n: number): ThemeId[] => Array.from({ length: n }, (_, i) => `${kind}${i}` as ThemeId);

describe('musiques', () => {
  it('5 thèmes de vagues et 5 thèmes de boss, tous différents', () => {
    expect(THEME_COUNT).toEqual({ waves: 5, bosses: 5 });
    const all = [...ids('wave', 5), ...ids('boss', 5)].map((id) => themeFor(id));
    const signatures = new Set(all.map((t) => `${t.bpm}|${t.chords.flat().join(',')}`));
    expect(signatures.size).toBe(10);
    // Les boss sont plus rapides que les vagues du même monde.
    for (let w = 0; w < 5; w++) expect(themeFor(`boss${w}`).bpm).toBeGreaterThan(themeFor(`wave${w}`).bpm);
  });

  it('mélodies graves (sol 2 à do 4 environ) qui suivent les accords', () => {
    for (const id of [...ids('wave', 5), ...ids('boss', 5)]) {
      const t = themeFor(id);
      for (const melody of [t.lead, t.leadB!]) {
        expect(melody).toHaveLength(8);
        melody.forEach((bar, b) => {
          const pcs = t.chords[b].map((n) => n % 12);
          for (const [step, midi, len] of bar) {
            expect(midi, id).toBeGreaterThanOrEqual(53);
            expect(midi, id).toBeLessThanOrEqual(77);
            expect(len).toBeGreaterThanOrEqual(1);
            if (step % 4 === 0) expect(pcs, `${id} mesure ${b}`).toContain(midi % 12);
          }
        });
      }
      // Les mélodies A et B sont différentes.
      expect(JSON.stringify(t.lead)).not.toBe(JSON.stringify(t.leadB));
    }
  });

  it('toujours la même mélodie pour un thème donné ; le mode infini reprend les thèmes', () => {
    expect(JSON.stringify(themeFor('wave2').lead)).toBe(JSON.stringify(themeFor('wave2').lead));
    expect(themeFor('wave7')).toBe(themeFor('wave2'));
    expect(themeFor('boss5')).toBe(themeFor('boss0'));
    expect(themeFor('menu').lead[0][0]).toEqual([0, 76, 6]);
  });
});
