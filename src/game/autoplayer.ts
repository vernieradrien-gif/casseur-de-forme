import { abilityReady, buyAbility, buyRunUpgrade, buyWeapon, buyWorkshop, useAbility, workshopMaxed } from './actions';
import { ABILITIES, ACTIVE_ABILITIES, BALANCE, RUN_UPGRADES, WEAPONS } from './config';
import type { WorkshopId } from './config';
import type { GameEvent } from './events';
import { abilityPrice, cost, weaponUpgradeCost } from './formulas';
import { nextRandom } from './rng';
import { W } from './state';
import type { GameState } from './state';

/**
 * Joueur automatique (simulation d'équilibrage et tests) : il se place sous les cibles,
 * esquive ce qui arrive sur lui avec un temps de réaction et des erreurs, utilise ses capacités
 * et dépense tout ce qu'il gagne.
 */
export interface AutoPlayerOptions {
  /** Temps entre deux décisions (secondes). */
  reaction: number;
  /** Erreur de placement (unités monde). */
  noise: number;
  /** Probabilité de ne pas voir une menace à chaque décision. */
  blindness: number;
  seed: number;
}

export const DEFAULT_PLAYER: AutoPlayerOptions = { reaction: 0.16, noise: 0.03, blindness: 0.15, seed: 7 };

export class AutoPlayer {
  private timer = 0;
  private target = 0;
  private readonly rng: { seed: number };

  constructor(private readonly opts: AutoPlayerOptions = DEFAULT_PLAYER) {
    this.rng = { seed: opts.seed };
  }

  private rand(): number {
    return nextRandom(this.rng);
  }

  /** À appeler avant chaque pas de simulation. */
  play(state: GameState, events: GameEvent[]): void {
    const run = state.run;
    if (run.phase === 'gameOver' || run.phase === 'dying') return;
    this.timer -= 1 / 60;
    if (this.timer <= 0) {
      this.timer = this.opts.reaction;
      this.target = this.decide(state) + (this.rand() - 0.5) * 2 * this.opts.noise;
      this.useAbilities(state, events);
    }
    state.input.moveX = this.target;
  }

  private danger(state: GameState, x: number, blind: boolean[]): number {
    const run = state.run;
    const cr = BALANCE.cannon.radius;
    let d = 0;
    run.enemies.forEach((e, i) => {
      if (blind[i] || e.hp <= 0 || e.damage <= 0) return;
      const dy = W.cannonY - e.y;
      if (dy < -0.05) return;
      if (e.kind === 'dasher' && e.mode === 1) {
        if (Math.abs(e.tx - x) < e.radius + cr + 0.05) d += 1.2;
        return;
      }
      const vy = Math.max(0.05, e.vy);
      const t = dy / vy;
      if (t > 1.3) return;
      const px = e.kind === 'hunter' ? e.x + Math.sign(x - e.x) * Math.min(Math.abs(x - e.x), 0.3 * t) : e.x + e.vx * t;
      if (Math.abs(px - x) < e.radius + cr + 0.03) d += 1.4 - t;
    });
    for (const b of run.bullets) {
      if (b.damage <= 0 || b.vy <= 0) continue;
      const t = (W.cannonY - b.y) / b.vy;
      if (t < 0 || t > 1) continue;
      const px = b.x + b.vx * t;
      if (Math.abs(px - x) < b.radius + cr + 0.03) d += (1.1 - t) * 1.5;
    }
    return d;
  }

  private decide(state: GameState): number {
    const run = state.run;
    const c = run.cannon;
    const blind = run.enemies.map(() => this.rand() < this.opts.blindness);
    // Cible : l'ennemi le plus bas, sinon le boss (avec un peu d'anticipation).
    let aimX: number | null = null;
    let aimW = 0.02;
    let lowest = -Infinity;
    for (const e of run.enemies) {
      if (e.hp > 0 && e.y > 0.02 && e.y < W.cannonY - 0.2 && e.y > lowest) {
        lowest = e.y;
        aimX = e.x + e.vx * 0.3;
        aimW = e.radius;
      }
    }
    if (aimX === null && run.phase === 'boss') {
      const b = run.bosses.find((x) => x.hp > 0);
      if (b) {
        aimX = b.x + b.vx * 0.35;
        aimW = b.radius * 0.5;
      }
    }
    let best = c.x;
    let bestScore = -Infinity;
    for (let x = W.cannonMinX; x <= W.cannonMaxX + 1e-9; x += 0.025) {
      let score = -Math.abs(x - c.x) * 0.4 - this.danger(state, x, blind) * 6;
      if (aimX !== null) score += Math.abs(x - aimX) < aimW ? 1 : -Math.abs(x - aimX) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best;
  }

  private useAbilities(state: GameState, events: GameEvent[]): void {
    const run = state.run;
    for (const id of ACTIVE_ABILITIES) {
      if (!abilityReady(state, id)) continue;
      const enemies = run.enemies.filter((e) => e.hp > 0).length;
      const wanted =
        (id === 'autoAim' && (run.phase === 'boss' || enemies >= 4)) ||
        (id === 'shield' && (run.cannon.hp < run.cannon.maxHp * 0.5 || this.danger(state, run.cannon.x, []) > 0.6)) ||
        (id === 'shockwave' && (enemies >= 7 || (run.phase === 'boss' && run.cannon.hp < run.cannon.maxHp * 0.4)));
      if (wanted) useAbility(state, id, events);
    }
  }
}

/** Achète l'amélioration de partie la moins chère tant que possible. */
export function spendCoins(state: GameState): void {
  for (;;) {
    let best = RUN_UPGRADES[0];
    let bestCost = Infinity;
    for (const id of RUN_UPGRADES) {
      const c = cost(BALANCE.runUpgrades[id], state.run.upgrades[id]);
      if (c < bestCost) {
        bestCost = c;
        best = id;
      }
    }
    if (!buyRunUpgrade(state, best, 1)) return;
  }
}

const WORKSHOP_PRIORITY: WorkshopId[] = ['damage', 'fireRate', 'maxHp', 'coins', 'repair', 'startCoins'];

/** Dépense diamants et gemmes entre deux parties (atelier, capacités, armes). */
export function spendMeta(state: GameState): void {
  const meta = state.meta;
  // Gemmes : Multi-tir, Visée auto, armes, puis le reste.
  const gemOrder: (() => boolean)[] = [
    () => meta.abilities.multishot === 0 && buyAbility(state, 'multishot'),
    () => meta.abilities.autoAim === 0 && buyAbility(state, 'autoAim'),
    () => meta.weapons.orbs === 0 && buyWeapon(state, 'orbs'),
    () => meta.abilities.shield === 0 && buyAbility(state, 'shield'),
    () => meta.weapons.laser === 0 && buyWeapon(state, 'laser'),
    () => meta.abilities.multishot === 1 && buyAbility(state, 'multishot'),
    () => meta.abilities.shockwave === 0 && buyAbility(state, 'shockwave'),
    () => meta.weapons.lightning === 0 && buyWeapon(state, 'lightning'),
  ];
  for (const f of gemOrder) f();
  for (;;) {
    const id = ABILITIES.filter((a) => meta.abilities[a] > 0 && meta.abilities[a] < BALANCE.abilities[a].maxLevel).sort(
      (a, b) => abilityPrice(a, meta.abilities[a]) - abilityPrice(b, meta.abilities[b]),
    )[0];
    if (!id || !buyAbility(state, id)) break;
  }
  // Diamants : l'amélioration la moins chère (atelier ou arme équipée).
  for (;;) {
    let bestCost = Infinity;
    let buy: (() => boolean) | null = null;
    for (const id of WORKSHOP_PRIORITY) {
      if (workshopMaxed(state, id)) continue;
      const c = cost(BALANCE.workshop[id], meta.workshop[id]) * (id === 'startCoins' || id === 'repair' ? 1.5 : 1);
      if (c < bestCost) {
        bestCost = c;
        buy = () => buyWorkshop(state, id);
      }
    }
    for (const id of WEAPONS) {
      const lvl = meta.weapons[id];
      if (lvl === 0 || !meta.equipped.includes(id) || lvl >= BALANCE.weapons[id].maxLevel) continue;
      const c = weaponUpgradeCost(id, lvl) * 1.2;
      if (c < bestCost) {
        bestCost = c;
        buy = () => buyWeapon(state, id);
      }
    }
    if (!buy || !buy()) break;
  }
}
