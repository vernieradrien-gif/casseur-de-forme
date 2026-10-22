import { describe, expect, it } from 'vitest';
import { formatNumber, geometricSum, grow, maxAffordable } from '../src/game/bignum';

const S = ' ';

describe('formatNumber', () => {
  it('affiche les petits nombres en entier', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(999.9)).toBe('999');
  });

  it('garde une décimale sous 10', () => {
    expect(formatNumber(2.5)).toBe('2,5');
    expect(formatNumber(1.1)).toBe('1,1');
    expect(formatNumber(9.99)).toBe('9,9');
  });

  it('utilise les suffixes avec une décimale française', () => {
    expect(formatNumber(1000)).toBe(`1${S}K`);
    expect(formatNumber(1234)).toBe(`1,2${S}K`);
    expect(formatNumber(3_400_000)).toBe(`3,4${S}M`);
    expect(formatNumber(5.6e9)).toBe(`5,6${S}B`);
    expect(formatNumber(7.8e12)).toBe(`7,8${S}T`);
    expect(formatNumber(1e15)).toBe(`1${S}Qa`);
    expect(formatNumber(1e18)).toBe(`1${S}Qi`);
    expect(formatNumber(1e21)).toBe(`1${S}Sx`);
    expect(formatNumber(1e24)).toBe(`1${S}Sp`);
    expect(formatNumber(1e27)).toBe(`1${S}Oc`);
    expect(formatNumber(1.5e30)).toBe(`1,5${S}No`);
    expect(formatNumber(2e33)).toBe(`2${S}Dc`);
  });

  it("tronque au lieu d'arrondir aux frontières", () => {
    expect(formatNumber(999_999)).toBe(`999,9${S}K`);
    expect(formatNumber(999_999_999)).toBe(`999,9${S}M`);
    expect(formatNumber(1_000_000)).toBe(`1${S}M`);
    expect(formatNumber(4350)).toBe(`4,3${S}K`);
  });

  it('est correct pour toutes les puissances de 10 jusqu’à 1e30', () => {
    const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];
    for (let e = 3; e <= 30; e++) {
      const expected = String(10 ** (e % 3)) + S + suffixes[Math.floor(e / 3)];
      expect(formatNumber(10 ** e)).toBe(expected);
      // Juste en dessous de la puissance : jamais « 1000 K ».
      expect(formatNumber(10 ** e * 0.99999)).not.toMatch(/^1000/);
    }
  });

  it('passe en notation scientifique au-delà des suffixes', () => {
    expect(formatNumber(1.23e36)).toBe('1,2e36');
    expect(formatNumber(1e100)).toBe('1e100');
  });

  it('gère les cas limites', () => {
    expect(formatNumber(-1500)).toBe(`-1,5${S}K`);
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(Infinity)).toBe('∞');
  });
});

describe('calculs géométriques', () => {
  it('grow', () => {
    expect(grow(10, 1.15, 0)).toBe(10);
    expect(grow(10, 1.15, 2)).toBeCloseTo(13.225);
    expect(grow(1, 10, 400)).toBe(Number.MAX_VALUE);
  });

  it('geometricSum correspond à la somme terme à terme', () => {
    let sum = 0;
    for (let i = 3; i < 13; i++) sum += grow(10, 1.15, i);
    expect(geometricSum(10, 1.15, 3, 10)).toBeCloseTo(sum, 6);
    expect(geometricSum(10, 1.15, 0, 0)).toBe(0);
    expect(geometricSum(5, 1, 0, 4)).toBe(20);
  });

  it('maxAffordable donne le plus grand nombre achetable', () => {
    expect(maxAffordable(10, 1.15, 0, 9.99)).toBe(0);
    expect(maxAffordable(10, 1.15, 0, 10)).toBe(1);
    expect(maxAffordable(10, 1.15, 0, 21.5)).toBe(2);
    for (const budget of [10, 50, 1234, 1e6, 1e20]) {
      const n = maxAffordable(10, 1.15, 5, budget);
      expect(geometricSum(10, 1.15, 5, n)).toBeLessThanOrEqual(budget);
      expect(geometricSum(10, 1.15, 5, n + 1)).toBeGreaterThan(budget);
    }
  });
});
