import { BALANCE } from './config';
import { spawnEnemy } from './enemies';
import type { GameEvent } from './events';
import {
  applyArmor,
  bossArmorValue,
  bossBulletDamage,
  bossFireInterval,
  bossHp,
  bossRadius,
  enemyKindsAt,
  isGrandBoss,
  tierIndex,
} from './formulas';
import { shapeVertices } from './geometry';
import type { Vec } from './geometry';
import { nextRandom } from './rng';
import { W } from './state';
import type { Boss, GameState } from './state';

const B = BALANCE.boss;
const HALF = W.width / 2;

/** Nombre de sommets « extérieurs » d'une forme (pointes des étoiles). */
function outerVertexCount(boss: Pick<Boss, 'shape'>): number {
  return boss.shape.star ?? boss.shape.sides ?? 3;
}

function weakPointIndices(boss: Pick<Boss, 'shape'>, count: number): number[] {
  const n = outerVertexCount(boss);
  const c = Math.max(0, Math.min(count, n));
  const step = boss.shape.star ? 2 : 1;
  const out: number[] = [];
  for (let k = 0; k < c; k++) out.push(Math.round((k * n) / c) * step);
  return out;
}

export function createBoss(state: GameState, level: number, golden: boolean): Boss {
  const run = state.run;
  const tier = tierIndex(level);
  const def = BALANCE.tiers[tier];
  const grand = isGrandBoss(level);
  const maxHp = bossHp(level);
  const rings = def.rings ?? 0;
  const boss: Boss = {
    id: run.nextId++,
    level,
    tier,
    shape: def.shape,
    radius: bossRadius(level),
    x: 0,
    y: W.bossY,
    vx: B.moveSpeed * (nextRandom(state) < 0.5 ? -1 : 1),
    hp: maxHp,
    maxHp,
    rotation: 0,
    golden,
    grand,
    fragment: false,
    armor: def.armor ?? 0,
    regen: def.regen ?? 0,
    fast: def.fast ?? false,
    fragments: def.fragments ?? 0,
    shieldHits: def.shield ?? 0,
    shieldMax: def.shield ?? 0,
    shieldTimer: 0,
    rings,
    ringHp: maxHp * B.ringShare,
    ringMaxHp: maxHp * B.ringShare,
    sinceHit: 0,
    fireTimer: bossFireInterval(level),
    burstLeft: 0,
    burstTimer: 0,
    minionTimer: B.minionInterval * 0.6,
    enraged: false,
    weakPoints: [],
    flash: 0,
  };
  boss.weakPoints = weakPointIndices(boss, def.weakPoints);
  return boss;
}

/** Fragment d'un boss qui se divise à sa mort. */
function createFragment(state: GameState, parent: Boss, side: number): Boss {
  const f = createBoss(state, parent.level, parent.golden);
  f.fragment = true;
  f.fragments = 0;
  f.rings = 0;
  f.shieldHits = 0;
  f.shieldMax = 0;
  f.radius = parent.radius * B.fragmentRadius;
  f.maxHp = parent.maxHp * B.fragmentHpShare;
  f.hp = f.maxHp;
  f.x = parent.x + side * parent.radius * 0.6;
  f.y = parent.y;
  f.vx = side * B.moveSpeed * 1.5;
  f.rotation = parent.rotation;
  f.enraged = true;
  f.weakPoints = weakPointIndices(f, 1);
  f.fireTimer = bossFireInterval(parent.level) * (side > 0 ? 0.5 : 1);
  return f;
}

export function bossVertices(boss: Boss): Vec[] {
  return shapeVertices(boss.shape, boss.radius, boss.rotation, boss.x, boss.y);
}

export function weakPointPositions(boss: Boss, vertices = bossVertices(boss)): Vec[] {
  return boss.weakPoints.map((i) => {
    const v = vertices[i % vertices.length];
    return { x: boss.x + (v.x - boss.x) * 0.9, y: boss.y + (v.y - boss.y) * 0.9 };
  });
}

/** Rayon de l'anneau extérieur restant (0 s'il n'y en a plus). */
export function outerRingRadius(boss: Boss): number {
  return boss.rings > 0 ? boss.radius + B.ringGap * boss.rings : 0;
}

/** Bouclier de vagues : la forme est invulnérable tant que les vagues ne sont pas passées. */
export function waveShieldRadius(boss: Boss): number {
  return boss.radius * B.waveShieldScale;
}

/** Part des PV restants (anneaux compris) pour la barre de vie. */
export function bossHealthRatio(boss: Boss): number {
  const ringsTotal = boss.ringMaxHp * (BALANCE.tiers[boss.tier].rings ?? 0) * (boss.fragment ? 0 : 1);
  const rings = boss.rings > 0 ? boss.ringMaxHp * (boss.rings - 1) + boss.ringHp : 0;
  return Math.max(0, (boss.hp + rings) / (boss.maxHp + ringsTotal));
}

/**
 * Dégâts au boss. Pendant les vagues, le bouclier encaisse tout.
 * `pierce` : ignore le blindage et le bouclier de propriété (laser, onde de choc).
 */
export function damageBoss(
  state: GameState,
  boss: Boss,
  amount: number,
  x: number,
  y: number,
  events: GameEvent[],
  opts: { weak?: boolean; pierce?: boolean; silent?: boolean } = {},
): void {
  if (boss.hp <= 0) return;
  if (state.run.phase !== 'boss') {
    if (!opts.silent) events.push({ type: 'waveShieldHit', x, y });
    return;
  }
  if (!opts.pierce && boss.shieldHits > 0) {
    boss.shieldHits--;
    if (boss.shieldHits === 0) {
      boss.shieldTimer = B.shieldRecharge;
      events.push({ type: 'bossShieldBroken', x: boss.x, y: boss.y, radius: boss.radius });
    } else if (!opts.silent) {
      events.push({ type: 'bossAbsorb', x, y });
    }
    return;
  }
  let dmg = amount * (opts.weak ? B.weakPointMultiplier : 1);
  if (!opts.pierce && boss.armor > 0) dmg = applyArmor(dmg, bossArmorValue(boss.armor, boss.level));
  boss.sinceHit = 0;
  boss.flash = 0.07;
  if (boss.rings > 0) {
    boss.ringHp -= dmg;
    if (boss.ringHp <= 0) {
      events.push({ type: 'ringBroken', x: boss.x, y: boss.y, radius: outerRingRadius(boss) });
      boss.rings--;
      boss.ringHp = boss.rings > 0 ? boss.ringMaxHp : 0;
    }
  } else {
    boss.hp -= dmg;
  }
  if (!opts.silent) events.push({ type: 'bossHit', x, y, damage: dmg, weak: opts.weak ?? false });
  if (boss.hp <= 0) killBoss(state, boss, events);
}

export function killBoss(state: GameState, boss: Boss, events: GameEvent[]): void {
  boss.hp = 0;
  events.push({
    type: 'bossKilled',
    x: boss.x,
    y: boss.y,
    radius: boss.radius,
    tier: boss.tier,
    golden: boss.golden,
    rotation: boss.rotation,
    level: boss.level,
  });
  if (boss.fragments > 0 && !boss.fragment) {
    events.push({ type: 'bossSplit', x: boss.x, y: boss.y, radius: boss.radius, tier: boss.tier });
    for (const side of [-1, 1]) state.run.bosses.push(createFragment(state, boss, side));
  }
}

function shootBullet(state: GameState, boss: Boss, angle: number, speedFactor = 1): void {
  // La fureur rend aussi les tirs plus dangereux.
  const fury = state.run.phase === 'boss' ? 1 + state.run.phaseTimer / (B.furyTime * 2) : 1;
  const speed = B.bullet.speed * speedFactor * (boss.enraged ? 1.15 : 1);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  state.run.bullets.push({
    x: boss.x + dx * boss.radius * 0.9,
    y: boss.y + dy * boss.radius * 0.9,
    vx: dx * speed,
    vy: dy * speed,
    damage: bossBulletDamage(boss.level) * fury,
    radius: B.bullet.radius * (boss.grand ? 1.25 : 1),
  });
}

function attack(state: GameState, boss: Boss, events: GameEvent[]): void {
  const def = BALANCE.tiers[boss.tier].attack;
  const c = state.run.cannon;
  const aim = Math.atan2(W.cannonY - boss.y, c.x - boss.x);
  const bonus = (boss.grand ? 1 : 0) + (boss.enraged ? 1 : 0);
  const fragmentFactor = boss.fragment ? 0.5 : 1;
  switch (def.type) {
    case 'fan': {
      const n = Math.max(2, Math.round((def.count + bonus) * fragmentFactor));
      for (let i = 0; i < n; i++) shootBullet(state, boss, aim + def.spread * (i / (n - 1) - 0.5));
      break;
    }
    case 'burst':
      boss.burstLeft = def.count + bonus;
      boss.burstTimer = 0;
      break;
    case 'ring':
    case 'spiral': {
      const n = Math.max(3, Math.round((def.count + bonus * (def.type === 'ring' ? 2 : 0)) * fragmentFactor));
      for (let i = 0; i < n; i++) shootBullet(state, boss, boss.rotation + (i * Math.PI * 2) / n, def.type === 'ring' ? 0.85 : 0.9);
      break;
    }
    default: {
      const n = Math.max(1, def.count + (boss.grand ? 1 : 0) + (boss.enraged ? 1 : 0));
      const spread = def.spread || B.bullet.aimedSpread;
      for (let i = 0; i < n; i++) shootBullet(state, boss, aim + (i - (n - 1) / 2) * spread);
    }
  }
  events.push({ type: 'bossFire', x: boss.x, y: boss.y });
}

function launchMinions(state: GameState, boss: Boss): void {
  const kinds = enemyKindsAt(boss.level).filter((k) => k === 'grunt' || k === 'weaver' || k === 'hunter');
  for (let i = 0; i < B.minionCount; i++) {
    const kind = kinds[Math.floor(nextRandom(state) * kinds.length)] ?? 'grunt';
    const side = i % 2 === 0 ? -1 : 1;
    spawnEnemy(state, boss.level, {
      kind,
      x: boss.x + side * boss.radius * 0.5,
      y: boss.y + boss.radius * 0.8,
      vx: side * 0.35,
      vy: 0.94,
      amp: 0,
      freq: 0,
      phase: 0,
    });
  }
}

export function updateBosses(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  for (const boss of run.bosses) {
    if (boss.hp <= 0) continue;
    boss.flash = Math.max(0, boss.flash - dt);
    if (run.phase === 'waves' || run.phase === 'bossIntro') {
      // Protégée par son bouclier, la forme se recentre et tourne lentement en lançant les vagues.
      boss.x += (0 - boss.x) * Math.min(1, dt * 2);
      boss.rotation = (boss.rotation + B.rotationSpeed * 0.5 * dt) % (Math.PI * 2);
      continue;
    }
    if (run.phase !== 'boss') {
      boss.rotation = (boss.rotation + B.rotationSpeed * 0.3 * dt) % (Math.PI * 2);
      continue;
    }

    if (!boss.enraged && boss.hp < boss.maxHp * B.enrageBelow) {
      boss.enraged = true;
      events.push({ type: 'bossEnraged', x: boss.x, y: boss.y });
    }
    const rate = (boss.fast ? B.fastFactor : 1) * (boss.enraged ? B.enrageFactor : 1);
    // Fureur : plus la phase boss dure, plus la forme tire vite (une partie finit toujours).
    const fury = 1 + run.phaseTimer / B.furyTime;
    boss.rotation = (boss.rotation + B.rotationSpeed * rate * dt) % (Math.PI * 2);

    // Va-et-vient horizontal.
    const limit = boss.fragment ? HALF - boss.radius - 0.03 : Math.min(B.moveLimit, HALF - boss.radius - 0.03);
    boss.x += boss.vx * (boss.enraged ? B.enrageFactor : 1) * dt;
    if (boss.x > limit) {
      boss.x = limit;
      boss.vx = -Math.abs(boss.vx);
    } else if (boss.x < -limit) {
      boss.x = -limit;
      boss.vx = Math.abs(boss.vx);
    }

    // Régénération si non touché.
    boss.sinceHit += dt;
    if (boss.regen > 0 && boss.sinceHit > B.regenDelay) boss.hp = Math.min(boss.maxHp, boss.hp + boss.regen * boss.maxHp * dt);

    // Recharge du bouclier de propriété.
    if (boss.shieldMax > 0 && boss.shieldHits === 0) {
      boss.shieldTimer -= dt;
      if (boss.shieldTimer <= 0) boss.shieldHits = boss.shieldMax;
    }

    // Tirs.
    const spiral = BALANCE.tiers[boss.tier].attack.type === 'spiral';
    boss.fireTimer -= dt * rate * fury;
    if (boss.fireTimer <= 0) {
      attack(state, boss, events);
      boss.fireTimer += bossFireInterval(boss.level) * (spiral ? B.bullet.spiralIntervalFactor : 1);
    }
    if (boss.burstLeft > 0) {
      boss.burstTimer -= dt;
      if (boss.burstTimer <= 0) {
        const aim = Math.atan2(W.cannonY - boss.y, run.cannon.x - boss.x);
        shootBullet(state, boss, aim + (nextRandom(state) - 0.5) * BALANCE.tiers[boss.tier].attack.spread, 1.1);
        boss.burstLeft--;
        boss.burstTimer = B.bullet.burstGap;
      }
    }

    // Lance parfois quelques ennemis.
    if (boss.level >= B.minionsFromLevel && !boss.fragment) {
      boss.minionTimer -= dt * (boss.grand ? 1.4 : 1) * Math.min(2, fury);
      if (boss.minionTimer <= 0) {
        launchMinions(state, boss);
        boss.minionTimer = B.minionInterval;
      }
    }
  }
}
