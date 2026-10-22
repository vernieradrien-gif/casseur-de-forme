import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/game/config';
import {
  abilityCooldown,
  abilityDuration,
  abilityPrice,
  affordable,
  applyArmor,
  bossCoins,
  bossDiamonds,
  bossHp,
  bossRadius,
  bulkCost,
  cannonStats,
  checkpointCoins,
  cost,
  enemiesPerWave,
  enemyKindsAt,
  enemyStats,
  grandBossGems,
  healOnClear,
  isGrandBoss,
  newEnemyAt,
  offlineCapHours,
  offlineDiamonds,
  pickEnemyKind,
  pickFormation,
  tierDef,
  tierIndex,
  tierOf,
  wavesForLevel,
  weaponPower,
  weaponSlots,
  worldOf,
  worldStart,
  worldsUnlocked,
} from '../src/game/formulas';
import { pointInPolygon, polygonVertices, shapeVertices, starVertices } from '../src/game/geometry';
import { createMeta } from '../src/game/state';

const zeroRun = { damage: 0, fireRate: 0, maxHp: 0 };

describe('niveaux, paliers et mondes', () => {
  it('paliers de 10 niveaux et formes qui recommencent en mode infini', () => {
    expect(tierOf(10)).toBe(0);
    expect(tierOf(11)).toBe(1);
    expect(tierDef(1).shape).toEqual({ sides: 3 });
    expect(tierDef(11).shape).toEqual({ sides: 4 });
    expect(tierDef(55).shape.star).toBe(5);
    expect(tierIndex(95)).toBe(9);
    expect(tierIndex(101)).toBe(0);
  });

  it('grand boss au niveau 10 de chaque palier', () => {
    expect(isGrandBoss(10)).toBe(true);
    expect(isGrandBoss(20)).toBe(true);
    expect(isGrandBoss(15)).toBe(false);
  });

  it('3 vagues, 4 dès le niveau 21, 5 dès le niveau 51 ; moins pour un grand boss', () => {
    expect(wavesForLevel(1)).toBe(3);
    expect(wavesForLevel(21)).toBe(4);
    expect(wavesForLevel(51)).toBe(5);
    expect(wavesForLevel(10)).toBe(BALANCE.level.grandBossWaves);
  });

  it('mondes de 50 niveaux comme points de reprise', () => {
    expect(worldOf(1)).toBe(0);
    expect(worldOf(50)).toBe(0);
    expect(worldOf(51)).toBe(1);
    expect(worldStart(0)).toBe(1);
    expect(worldStart(2)).toBe(101);
    expect(worldsUnlocked(1)).toBe(1);
    expect(worldsUnlocked(50)).toBe(1);
    expect(worldsUnlocked(51)).toBe(2);
  });

  it('pièces de départ pour un monde avancé', () => {
    expect(checkpointCoins(1)).toBe(0);
    expect(checkpointCoins(51)).toBeGreaterThan(1000);
    expect(checkpointCoins(101)).toBeGreaterThan(checkpointCoins(51));
  });
});

describe('boss', () => {
  it('PV = base × croissance^(niveau − 1) × multiplicateur de palier (× grand boss)', () => {
    const b = BALANCE.boss;
    expect(bossHp(1)).toBe(b.baseHp);
    expect(bossHp(5)).toBeCloseTo(b.baseHp * b.hpGrowth ** 4);
    expect(bossHp(12)).toBeCloseTo(b.baseHp * b.hpGrowth ** 11 * b.tierHpMultipliers[1]);
    expect(bossHp(10)).toBeCloseTo(b.baseHp * b.hpGrowth ** 9 * b.grandHpMultiplier);
    // Mode infini : la croissance continue.
    expect(bossHp(150)).toBeGreaterThan(bossHp(100));
  });

  it('grand boss plus grand, boss doré ×10 pièces', () => {
    expect(bossRadius(10)).toBeGreaterThan(bossRadius(9));
    expect(bossCoins(3, true)).toBeCloseTo(bossCoins(3, false) * BALANCE.boss.goldenCoinMultiplier);
  });

  it('diamants : 1 + plancher((niveau − 1) / 5), bonus de premier passage, ×3 sur grand boss', () => {
    const d = BALANCE.diamonds;
    expect(bossDiamonds(1, false)).toBe(d.perBoss);
    expect(bossDiamonds(1, true)).toBe(d.perBoss + d.firstClearBonus);
    expect(bossDiamonds(6, false)).toBe(d.perBoss + 1);
    expect(bossDiamonds(10, false)).toBe((d.perBoss + 1) * d.grandMultiplier);
  });

  it('gemmes au premier passage des grands boss seulement', () => {
    expect(grandBossGems(9)).toBe(0);
    expect(grandBossGems(10)).toBe(BALANCE.gems.grandFirstClear);
    expect(grandBossGems(20)).toBe(BALANCE.gems.grandFirstClear + BALANCE.gems.grandFirstClearPerTier);
  });

  it('blindage : retire une valeur fixe, jamais plus qu’une fraction du coup', () => {
    expect(applyArmor(10, 3)).toBe(7);
    expect(applyArmor(10, 100)).toBeCloseTo(10 * BALANCE.boss.armorMinFraction);
  });
});

describe('vagues et ennemis', () => {
  it('ennemis plus forts à chaque niveau', () => {
    const a = enemyStats('grunt', 1);
    const b = enemyStats('grunt', 10);
    expect(a.hp).toBe(BALANCE.enemies.grunt.hp);
    expect(b.hp).toBeGreaterThan(a.hp);
    expect(b.damage).toBeGreaterThan(a.damage);
    expect(b.coins).toBeGreaterThan(a.coins);
    expect(enemyStats('tank', 1).hp).toBeGreaterThan(a.hp);
  });

  it('vagues plus grandes avec les niveaux, plafonnées', () => {
    expect(enemiesPerWave(30)).toBeGreaterThan(enemiesPerWave(1));
    expect(enemiesPerWave(10_000)).toBe(BALANCE.waves.countMax);
  });

  it('un nouveau type d’ennemi présenté à la fois (8 types entre les niveaux 1 et 40)', () => {
    expect(enemyKindsAt(1)).toEqual(['grunt']);
    expect(enemyKindsAt(3)).toEqual(['grunt', 'weaver']);
    expect(enemyKindsAt(40)).toHaveLength(8);
    expect(newEnemyAt(3)).toBe('weaver');
    expect(newEnemyAt(6)).toBe('tank');
    expect(newEnemyAt(12)).toBe('hunter');
    expect(newEnemyAt(16)).toBe('shooter');
    expect(newEnemyAt(22)).toBe('splitter');
    expect(newEnemyAt(30)).toBe('dasher');
    expect(newEnemyAt(40)).toBe('armored');
    expect(newEnemyAt(5)).toBeNull();
    for (let i = 0; i < 20; i++) expect(pickEnemyKind(1, i / 20)).toBe('grunt');
  });

  it('formations débloquées progressivement', () => {
    const at1 = new Set(Array.from({ length: 50 }, (_, i) => pickFormation(1, i / 50)));
    expect(at1).toEqual(new Set(['line', 'rain']));
    const at20 = new Set(Array.from({ length: 200 }, (_, i) => pickFormation(20, i / 200)));
    expect(at20).toEqual(new Set(['line', 'rain', 'snake', 'v', 'fan', 'sides']));
  });
});

describe('améliorations, armes, capacités', () => {
  it('coût = base × croissance^(achats), achat en lot cohérent', () => {
    const def = BALANCE.runUpgrades.damage;
    expect(cost(def, 0)).toBe(def.baseCost);
    expect(cost(def, 3)).toBeCloseTo(def.baseCost * def.costGrowth ** 3);
    expect(bulkCost(def, 0, 2)).toBeCloseTo(def.baseCost * (1 + def.costGrowth));
    expect(affordable(def, 0, def.baseCost - 0.01)).toBe(0);
  });

  it('statistiques du canon : partie × atelier, cadence plafonnée', () => {
    const w = createMeta().workshop;
    const base = cannonStats(zeroRun, w);
    expect(base.damage).toBe(BALANCE.cannon.baseDamage);
    expect(base.maxHp).toBe(BALANCE.cannon.baseHp);
    expect(base.coinMultiplier).toBe(1);
    const up = cannonStats({ ...zeroRun, damage: 2 }, { ...w, damage: 1 });
    const r = BALANCE.runUpgrades.damage.effectPerLevel;
    const d = BALANCE.workshop.damage.effectPerLevel;
    expect(up.damage).toBeCloseTo((1 + r) ** 2 * (1 + d));
    expect(cannonStats({ ...zeroRun, fireRate: 500 }, w).shotsPerSecond).toBe(BALANCE.cannon.maxShotsPerSecond);
    expect(healOnClear({ ...w, repair: 2 })).toBeCloseTo(BALANCE.cannon.healOnLevelClear + 2 * BALANCE.workshop.repair.effectPerLevel);
  });

  it('emplacements d’armes : 1, puis 2 au niveau 30, 3 au niveau 60', () => {
    expect(weaponSlots(1)).toBe(1);
    expect(weaponSlots(29)).toBe(1);
    expect(weaponSlots(30)).toBe(2);
    expect(weaponSlots(60)).toBe(3);
    expect(weaponPower(1)).toBe(1);
    expect(weaponPower(6)).toBeCloseTo(1 + 5 * BALANCE.weapons.levelEffect);
  });

  it('capacités : durée plus longue et recharge plus courte en montant de niveau', () => {
    expect(abilityDuration('autoAim', 3)).toBeGreaterThan(abilityDuration('autoAim', 1));
    expect(abilityCooldown('shield', 3)).toBeLessThan(abilityCooldown('shield', 1));
    expect(abilityPrice('autoAim', 0)).toBe(BALANCE.abilities.autoAim.gemCost);
    expect(abilityPrice('autoAim', 2)).toBe(BALANCE.abilities.autoAim.upgradeCost * 2);
  });
});

describe('hors ligne', () => {
  it('taux selon le meilleur niveau × temps, plafonné à 2 h (8 h avec l’atelier)', () => {
    const one = offlineDiamonds(20, 0, 3600);
    expect(one).toBeGreaterThan(0);
    expect(offlineDiamonds(20, 0, 2 * 3600)).toBeGreaterThanOrEqual(2 * one - 1);
    expect(offlineDiamonds(20, 0, 10 * 3600)).toBe(offlineDiamonds(20, 0, 2 * 3600));
    expect(offlineCapHours(6)).toBe(8);
    expect(offlineDiamonds(20, 6, 10 * 3600)).toBe(offlineDiamonds(20, 6, 8 * 3600));
    expect(offlineDiamonds(50, 0, 3600)).toBeGreaterThan(one);
  });

  it('aucun gain si l’absence est courte ou si l’horloge recule', () => {
    expect(offlineDiamonds(20, 0, 60)).toBe(0);
    expect(offlineDiamonds(20, 0, -3600)).toBe(0);
    expect(offlineDiamonds(20, 0, NaN)).toBe(0);
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
    expect(tri[0].y).toBeCloseTo(6);
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
