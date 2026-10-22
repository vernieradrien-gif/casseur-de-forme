import { describe, expect, it } from 'vitest';
import {
  cannonDamage,
  shapeCoins,
  shapeHp,
  tierOf,
  upgradeBulkCost,
  upgradeCost,
  upgradeMaxAffordable,
} from '../src/game/formulas';
import { pointInPolygon, polygonVertices, starVertices } from '../src/game/geometry';

describe('formules du cahier des charges', () => {
  it('PV = 10 × 1,22^(niveau − 1)', () => {
    expect(shapeHp(1)).toBe(10);
    expect(shapeHp(2)).toBeCloseTo(12.2);
    expect(shapeHp(10)).toBeCloseTo(10 * 1.22 ** 9);
  });

  it('pièces = 1 × 1,17^(niveau − 1)', () => {
    expect(shapeCoins(1)).toBe(1);
    expect(shapeCoins(5)).toBeCloseTo(1.17 ** 4);
  });

  it('coût = coût de base × 1,15^(achats)', () => {
    expect(upgradeCost('damage', 0)).toBe(10);
    expect(upgradeCost('damage', 3)).toBeCloseTo(10 * 1.15 ** 3);
    expect(upgradeBulkCost('damage', 0, 2)).toBeCloseTo(10 + 11.5);
    expect(upgradeMaxAffordable('damage', 0, 21.5)).toBe(2);
  });

  it('dégâts +10 % par niveau (composé)', () => {
    expect(cannonDamage(0)).toBe(1);
    expect(cannonDamage(1)).toBeCloseTo(1.1);
    expect(cannonDamage(10)).toBeCloseTo(1.1 ** 10);
  });

  it('paliers de 10 niveaux', () => {
    expect(tierOf(1)).toBe(0);
    expect(tierOf(10)).toBe(0);
    expect(tierOf(11)).toBe(1);
    expect(tierOf(100)).toBe(9);
  });
});

describe('géométrie', () => {
  it('polygone régulier : sommets sur le cercle, premier en haut', () => {
    const pts = polygonVertices(3, 2, 0);
    expect(pts).toHaveLength(3);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(-2);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(2);
  });

  it('étoile : rayons alternés', () => {
    const pts = starVertices(5, 2, 1, 0);
    expect(pts).toHaveLength(10);
    pts.forEach((p, i) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(i % 2 === 0 ? 2 : 1));
  });

  it('point dans polygone', () => {
    const tri = polygonVertices(3, 1, 0);
    expect(pointInPolygon({ x: 0, y: 0 }, tri)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 0.9 }, tri)).toBe(false);
    expect(pointInPolygon({ x: 2, y: 0 }, tri)).toBe(false);
  });
});
