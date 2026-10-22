import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  affordable,
  bossDiamonds,
  bossHp,
  bossShape,
  bulkCost,
  cannonStats,
  cost,
  enemyStats,
  pickEnemyKind,
  tierOf,
  waveCount,
  waveInterval,
} from '../src/game/formulas';
import { pointInPolygon, polygonVertices, shapeVertices, starVertices } from '../src/game/geometry';

const zeroRun = { damage: 0, fireRate: 0, maxHp: 0 };
const zeroMeta = { damage: 0, fireRate: 0, maxHp: 0, coins: 0 };

describe('formules', () => {
  it('PV du boss = base × croissance^(niveau − 1)', () => {
    const b = BALANCE.boss;
    expect(bossHp(1)).toBe(b.baseHp);
    expect(bossHp(5)).toBeCloseTo(b.baseHp * b.hpGrowth ** 4);
  });

  it('ennemis plus forts à chaque niveau', () => {
    const a = enemyStats('grunt', 1);
    const b = enemyStats('grunt', 10);
    expect(a.hp).toBe(BALANCE.enemies.grunt.hp);
    expect(b.hp).toBeGreaterThan(a.hp);
    expect(b.damage).toBeGreaterThan(a.damage);
    expect(b.coins).toBeGreaterThan(a.coins);
    expect(enemyStats('tank', 1).coins).toBeGreaterThan(a.coins);
  });

  it('vagues plus grandes et plus fréquentes, avec plafonds', () => {
    expect(waveCount(20)).toBeGreaterThan(waveCount(1));
    expect(waveInterval(20)).toBeLessThan(waveInterval(1));
    expect(waveCount(1000)).toBe(BALANCE.waves.countMax);
    expect(waveInterval(1000)).toBe(BALANCE.waves.intervalMin);
  });

  it('types d’ennemis débloqués selon le niveau', () => {
    for (let i = 0; i < 20; i++) expect(pickEnemyKind(1, i / 20)).toBe('grunt');
    const kinds = new Set(Array.from({ length: 50 }, (_, i) => pickEnemyKind(20, i / 50)));
    expect(kinds).toEqual(new Set(['grunt', 'tank', 'hunter']));
  });

  it('diamants : plus au premier passage et aux niveaux élevés', () => {
    expect(bossDiamonds(1, false)).toBe(BALANCE.diamonds.perBoss);
    expect(bossDiamonds(1, true)).toBe(BALANCE.diamonds.perBoss + BALANCE.diamonds.firstClearBonus);
    expect(bossDiamonds(30, false)).toBeGreaterThan(bossDiamonds(1, false));
  });

  it('coût = base × croissance^(achats), achat en lot cohérent', () => {
    const def = BALANCE.runUpgrades.damage;
    expect(cost(def, 0)).toBe(def.baseCost);
    expect(cost(def, 3)).toBeCloseTo(def.baseCost * def.costGrowth ** 3);
    expect(bulkCost(def, 0, 2)).toBeCloseTo(def.baseCost * (1 + def.costGrowth));
    expect(affordable(def, 0, def.baseCost - 0.01)).toBe(0);
  });

  it('statistiques du canon : partie × atelier', () => {
    const base = cannonStats(zeroRun, zeroMeta);
    expect(base.damage).toBe(BALANCE.cannon.baseDamage);
    expect(base.maxHp).toBe(BALANCE.cannon.baseHp);
    expect(base.coinMultiplier).toBe(1);
    const up = cannonStats({ ...zeroRun, damage: 2 }, { ...zeroMeta, damage: 1 });
    const r = BALANCE.runUpgrades.damage.effectPerLevel;
    const d = BALANCE.diamondUpgrades.damage.effectPerLevel;
    expect(up.damage).toBeCloseTo((1 + r) ** 2 * (1 + d));
    const fast = cannonStats({ ...zeroRun, fireRate: 500 }, zeroMeta);
    expect(fast.shotsPerSecond).toBe(BALANCE.cannon.maxShotsPerSecond);
  });

  it('paliers et formes de boss', () => {
    expect(tierOf(10)).toBe(0);
    expect(tierOf(11)).toBe(1);
    expect(bossShape(1)).toEqual({ sides: 3 });
    expect(bossShape(11)).toEqual({ sides: 4 });
    expect(bossShape(55).star).toBe(5);
  });
});

describe('géométrie', () => {
  it('polygone régulier : sommets sur le cercle, premier en haut', () => {
    const pts = polygonVertices(3, 2, 0);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(-2);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(2);
  });

  it('étoile : rayons alternés', () => {
    const pts = starVertices(5, 2, 1, 0);
    expect(pts).toHaveLength(10);
    pts.forEach((p, i) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(i % 2 === 0 ? 2 : 1));
  });

  it('shapeVertices : centre, rotation et étirement', () => {
    const tri = shapeVertices({ sides: 3 }, 1, Math.PI, 5, 5);
    expect(tri[0].x).toBeCloseTo(5);
    expect(tri[0].y).toBeCloseTo(6); // sommet tourné vers le bas
    const rh = shapeVertices({ sides: 4, scaleX: 0.5 }, 1, 0);
    expect(Math.max(...rh.map((p) => Math.abs(p.x)))).toBeCloseTo(0.5);
    expect(shapeVertices({ star: 8, inner: 0.6 }, 1, 0)).toHaveLength(16);
  });

  it('point dans polygone', () => {
    const tri = polygonVertices(3, 1, 0);
    expect(pointInPolygon({ x: 0, y: 0 }, tri)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 0.9 }, tri)).toBe(false);
  });
});
