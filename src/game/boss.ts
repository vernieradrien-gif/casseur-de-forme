import { BALANCE } from './config';
import { spawnEnemy } from './enemies';
import type { GameEvent } from './events';
import {
  applyArmor,
  bossArmorValue,
  bossBulletDamage,
  bossFireInterval,
  bossHp,
  bossKindAt,
  bossRadius,
  cannonPassive,
  enemyKindsAt,
  isGrandBoss,
  tierIndex,
} from './formulas';
import { shapeVertices } from './geometry';
import type { Vec } from './geometry';
import { nextRandom } from './rng';
import { W } from './state';
import type { Boss, BossPart, GameState } from './state';

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

export function isComposite(boss: Boss): boolean {
  return boss.kind !== 'normal';
}

/**
 * Super boss et titan : un cœur entouré d'anneaux de blocs blindés qui tournent (avec des trous),
 * et des canons. Seuls le cœur et les canons sont vulnérables.
 */
function buildParts(state: GameState, boss: Boss): void {
  const def = BALANCE.special[boss.kind === 'mega' ? 'mega' : 'super'];
  const parts: BossPart[] = [{ role: 'core', ring: -1, angle: 0, dist: 0, half: def.coreHalf, hp: boss.maxHp, maxHp: boss.maxHp, flash: 0, fireTimer: def.coreInterval }];
  def.rings.forEach((ring, r) => {
    const every = Math.max(2, Math.floor(ring.slots / Math.max(1, ring.gaps)));
    for (let i = 0; i < ring.slots; i++) {
      if (ring.gaps > 0 && i % every === 0) continue;
      parts.push({ role: 'armor', ring: r, angle: (i * Math.PI * 2) / ring.slots, dist: ring.dist, half: def.blockHalf, hp: 0, maxHp: 0, flash: 0, fireTimer: 0 });
    }
  });
  for (let g = 0; g < def.guns; g++) {
    const angle = def.guns === 2 ? (g === 0 ? 0 : Math.PI) : Math.PI / 4 + (g * Math.PI) / 2;
    const hp = boss.maxHp * def.gunHpShare;
    parts.push({ role: 'gun', ring: -1, angle, dist: def.gunDist, half: def.gunHalf, hp, maxHp: hp, flash: 0, fireTimer: def.gunInterval * (0.5 + g * 0.3) });
  }
  boss.parts = parts;
  boss.ringRot = def.rings.map(() => nextRandom(state) * Math.PI * 2);
}

export function createBoss(state: GameState, level: number, golden: boolean): Boss {
  const run = state.run;
  const tier = tierIndex(level);
  const def = BALANCE.tiers[tier];
  const kind = bossKindAt(level);
  const composite = kind !== 'normal';
  const grand = isGrandBoss(level);
  const maxHp = bossHp(level);
  const rings = composite ? 0 : (def.rings ?? 0);
  const radius = bossRadius(level);
  const boss: Boss = {
    id: run.nextId++,
    kind,
    level,
    tier,
    shape: def.shape,
    radius,
    span: radius,
    x: 0,
    y: composite ? BALANCE.special[kind].y : W.bossY,
    vx: B.moveSpeed * (nextRandom(state) < 0.5 ? -1 : 1) * (composite ? 0.7 : 1),
    hp: maxHp,
    maxHp,
    rotation: 0,
    golden: golden && !composite,
    grand,
    fragment: false,
    armor: composite ? 0 : (def.armor ?? 0),
    regen: composite ? 0 : (def.regen ?? 0),
    fast: !composite && (def.fast ?? false),
    fragments: composite ? 0 : (def.fragments ?? 0),
    shieldHits: composite ? 0 : (def.shield ?? 0),
    shieldMax: composite ? 0 : (def.shield ?? 0),
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
    parts: [],
    ringRot: [],
  };
  if (composite) buildParts(state, boss);
  else boss.weakPoints = weakPointIndices(boss, def.weakPoints);
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
  f.span = f.radius;
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

/** Angle courant d'un bloc (anneau tournant, ou rotation lente du boss). */
export function partAngle(boss: Boss, p: BossPart): number {
  return p.angle + (p.ring >= 0 ? (boss.ringRot[p.ring] ?? 0) : 0);
}

export function partPosition(boss: Boss, p: BossPart): Vec {
  const a = partAngle(boss, p);
  return { x: boss.x + Math.cos(a) * p.dist, y: boss.y + Math.sin(a) * p.dist };
}

function partAlive(p: BossPart): boolean {
  return p.role === 'armor' || p.hp > 0;
}

/** Bloc qui contient le point (blocs carrés orientés selon leur angle), sinon null. */
export function partAt(boss: Boss, x: number, y: number, margin = 0): BossPart | null {
  for (const p of boss.parts) {
    if (!partAlive(p)) continue;
    const c = partPosition(boss, p);
    const dx = x - c.x;
    const dy = y - c.y;
    if (Math.abs(dx) > p.half * 1.5 + margin || Math.abs(dy) > p.half * 1.5 + margin) continue;
    const a = -partAngle(boss, p);
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) < p.half + margin && Math.abs(ly) < p.half + margin) return p;
  }
  return null;
}

/** Rayon de l'anneau extérieur restant (0 s'il n'y en a plus). */
export function outerRingRadius(boss: Boss): number {
  return boss.rings > 0 ? boss.radius + B.ringGap * boss.rings : 0;
}

/** Bouclier de vagues : la forme est invulnérable tant que les vagues ne sont pas passées. */
export function waveShieldRadius(boss: Boss): number {
  return isComposite(boss) ? boss.span * 1.12 : boss.radius * B.waveShieldScale;
}

/** Le cercle (x, y, r) touche-t-il le corps du boss ? (contact avec le canon) */
export function bossTouches(boss: Boss, x: number, y: number, r: number, shielded: boolean): boolean {
  if (boss.hp <= 0) return false;
  const d = Math.hypot(x - boss.x, y - boss.y);
  if (shielded) return d < waveShieldRadius(boss) + r;
  if (!isComposite(boss)) return d < boss.radius * 0.85 + r;
  if (d > boss.span + 0.06 + r) return false;
  return partAt(boss, x, y, r * 0.8) !== null;
}

/** Part des PV restants (anneaux compris) pour la barre de vie. */
export function bossHealthRatio(boss: Boss): number {
  if (isComposite(boss)) return Math.max(0, boss.hp / boss.maxHp);
  const ringsTotal = boss.ringMaxHp * (BALANCE.tiers[boss.tier].rings ?? 0) * (boss.fragment ? 0 : 1);
  const rings = boss.rings > 0 ? boss.ringMaxHp * (boss.rings - 1) + boss.ringHp : 0;
  return Math.max(0, (boss.hp + rings) / (boss.maxHp + ringsTotal));
}

/** Coup sur un bloc d'un super boss : le blindage absorbe, un canon perd des PV, le cœur fait perdre le boss. */
export function damagePart(state: GameState, boss: Boss, part: BossPart, amount: number, x: number, y: number, events: GameEvent[], silent = false): void {
  if (part.role === 'armor') {
    if (!silent) events.push({ type: 'bossAbsorb', x, y });
    return;
  }
  part.flash = 0.07;
  boss.sinceHit = 0;
  if (part.role === 'gun') {
    part.hp -= amount;
    if (!silent) events.push({ type: 'bossHit', x, y, damage: amount, weak: false });
    if (part.hp <= 0) {
      part.hp = 0;
      const pos = partPosition(boss, part);
      events.push({ type: 'partDestroyed', x: pos.x, y: pos.y, radius: part.half * 2 });
      // Détruire un canon ébranle le cœur.
      const core = BALANCE.special[boss.kind === 'mega' ? 'mega' : 'super'].gunCoreDamage * boss.maxHp;
      damagePart(state, boss, boss.parts[0], core, boss.x, boss.y, events, silent);
    }
    return;
  }
  boss.flash = 0.07;
  boss.hp -= amount;
  part.hp = Math.max(0, boss.hp);
  if (!silent) events.push({ type: 'bossHit', x, y, damage: amount, weak: true });
  if (boss.hp <= 0) killBoss(state, boss, events);
}

/**
 * Dégâts au boss. Pendant les vagues, le bouclier encaisse tout.
 * `pierce` : ignore le blindage et le bouclier de propriété (laser, onde de choc).
 * Super boss : sans bloc précis, les dégâts vont à un canon encore actif, sinon au cœur.
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
  if (isComposite(boss)) {
    const target = opts.pierce ? null : boss.parts.find((p) => p.role === 'gun' && p.hp > 0);
    damagePart(state, boss, target ?? boss.parts[0], amount, x, y, events, opts.silent);
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
  let dmg = amount * (opts.weak ? B.weakPointMultiplier * (1 + cannonPassive(state.meta.cannon, 'weakPoint')) : 1);
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
    radius: boss.span,
    tier: boss.tier,
    golden: boss.golden,
    rotation: boss.rotation,
    level: boss.level,
    kind: boss.kind,
  });
  if (boss.fragments > 0 && !boss.fragment) {
    events.push({ type: 'bossSplit', x: boss.x, y: boss.y, radius: boss.radius, tier: boss.tier });
    for (const side of [-1, 1]) state.run.bosses.push(createFragment(state, boss, side));
  }
}

function shootFrom(state: GameState, boss: Boss, x: number, y: number, angle: number, speedFactor = 1): void {
  // La fureur rend aussi les tirs plus dangereux.
  const fury = state.run.phase === 'boss' ? 1 + state.run.phaseTimer / (B.furyTime * 2) : 1;
  const speed = B.bullet.speed * speedFactor * (boss.enraged ? 1.15 : 1);
  state.run.bullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage: bossBulletDamage(boss.level) * fury,
    radius: B.bullet.radius * (boss.grand ? 1.25 : 1),
  });
}

function shootBullet(state: GameState, boss: Boss, angle: number, speedFactor = 1): void {
  const r = (isComposite(boss) ? BALANCE.special[boss.kind === 'mega' ? 'mega' : 'super'].coreHalf : boss.radius) * 0.9;
  shootFrom(state, boss, boss.x + Math.cos(angle) * r, boss.y + Math.sin(angle) * r, angle, speedFactor);
}

function attack(state: GameState, boss: Boss, events: GameEvent[]): void {
  const def = BALANCE.tiers[boss.tier].attack;
  const c = state.run.cannon;
  const aim = Math.atan2(c.y - boss.y, c.x - boss.x);
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

/** Super boss : anneaux qui tournent, canons qui visent, cœur qui lance le motif du palier. */
function updateComposite(state: GameState, boss: Boss, dt: number, fury: number, events: GameEvent[]): void {
  const def = BALANCE.special[boss.kind === 'mega' ? 'mega' : 'super'];
  const c = state.run.cannon;
  const speed = boss.enraged ? 1.5 : 1;
  def.rings.forEach((ring, r) => (boss.ringRot[r] = (boss.ringRot[r] + ring.speed * speed * dt) % (Math.PI * 2)));
  for (const p of boss.parts) {
    p.flash = Math.max(0, p.flash - dt);
    if (p.role === 'gun' && p.hp > 0) {
      p.fireTimer -= dt * fury * speed;
      if (p.fireTimer <= 0) {
        const pos = partPosition(boss, p);
        const a = Math.atan2(c.y - pos.y, c.x - pos.x);
        shootFrom(state, boss, pos.x, pos.y, a, 1.05);
        if (boss.enraged) shootFrom(state, boss, pos.x, pos.y, a + 0.25, 1.05);
        p.fireTimer = def.gunInterval;
        events.push({ type: 'bossFire', x: pos.x, y: pos.y });
      }
    }
  }
  boss.fireTimer -= dt * fury * speed;
  if (boss.fireTimer <= 0) {
    attack(state, boss, events);
    boss.fireTimer = def.coreInterval;
  }
}

export function updateBosses(state: GameState, dt: number, events: GameEvent[]): void {
  const run = state.run;
  for (const boss of run.bosses) {
    if (boss.hp <= 0) continue;
    boss.flash = Math.max(0, boss.flash - dt);
    const composite = isComposite(boss);
    if (run.phase === 'waves' || run.phase === 'bossIntro') {
      // Protégée par son bouclier, la forme se recentre et tourne lentement en lançant les vagues.
      boss.x += (0 - boss.x) * Math.min(1, dt * 2);
      boss.rotation = (boss.rotation + B.rotationSpeed * 0.5 * dt) % (Math.PI * 2);
      if (composite) BALANCE.special[boss.kind === 'mega' ? 'mega' : 'super'].rings.forEach((ring, r) => (boss.ringRot[r] += ring.speed * 0.4 * dt));
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
    const reach = composite ? boss.span * 0.75 : boss.radius;
    const limit = boss.fragment ? HALF - reach - 0.03 : Math.min(B.moveLimit, HALF - reach - 0.03);
    boss.x += boss.vx * (boss.enraged ? B.enrageFactor : 1) * dt;
    if (boss.x > limit) {
      boss.x = limit;
      boss.vx = -Math.abs(boss.vx);
    } else if (boss.x < -limit) {
      boss.x = -limit;
      boss.vx = Math.abs(boss.vx);
    }

    if (composite) {
      updateComposite(state, boss, dt, fury, events);
    } else {
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
          const aim = Math.atan2(run.cannon.y - boss.y, run.cannon.x - boss.x);
          shootBullet(state, boss, aim + (nextRandom(state) - 0.5) * BALANCE.tiers[boss.tier].attack.spread, 1.1);
          boss.burstLeft--;
          boss.burstTimer = B.bullet.burstGap;
        }
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
