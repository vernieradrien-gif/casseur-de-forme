import { abilityReady } from '../game/actions';
import { formatNumber } from '../game/bignum';
import { isFighting } from '../game/cannon';
import { ACTIVE_ABILITIES, BALANCE, RUN_UPGRADES } from '../game/config';
import type { ActiveAbilityId, RunUpgradeId } from '../game/config';
import { abilityCooldown, affordable, bulkCost, cannonStats } from '../game/formulas';
import type { GameState } from '../game/state';
import { formatDuration, t } from '../i18n';
import { button, currencyIcon, el, setDisabled, setText, toggleClass } from './dom';

const BULK_STEPS = [1, 10, 100, Infinity];

export interface HudCallbacks {
  onBuy(id: RunUpgradeId, count: number): void;
  onAbility(id: ActiveAbilityId): void;
  onPause(): void;
}

interface UpgradeButton {
  id: RunUpgradeId;
  btn: HTMLButtonElement;
  level: HTMLElement;
  desc: HTMLElement;
  cost: HTMLElement;
}

interface AbilityButton {
  id: ActiveAbilityId;
  btn: HTMLButtonElement;
  timer: HTMLElement;
}

/** Interface de jeu : niveau, pièces, pause en haut ; améliorations en bas ; capacités à droite. */
export class Hud {
  readonly root: HTMLElement;
  readonly topBar: HTMLElement;
  readonly panel: HTMLElement;
  private readonly level: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly boost: HTMLElement;
  private readonly upgrades: UpgradeButton[] = [];
  private readonly abilities: AbilityButton[] = [];
  private readonly bulkBtn: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private bulkIndex = 0;

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.root = el('div', 'hud', parent);
    this.topBar = el('header', 'top-bar', this.root);
    this.level = el('div', 'level', this.topBar);
    const money = el('span', 'money money-coin', this.topBar);
    money.title = t('coins');
    currencyIcon('coin', money);
    this.coins = el('span', 'money-value', money);
    this.boost = el('span', 'boost-chip hidden', this.topBar);
    const pause = button('icon-btn pause-btn', this.topBar, undefined, () => cb.onPause());
    pause.setAttribute('aria-label', t('pause'));
    el('span', 'pause-icon', pause);

    const abilityBar = el('div', 'ability-bar', this.root);
    for (const id of ACTIVE_ABILITIES) {
      const btn = button(`ability-btn ability-${id}`, abilityBar, undefined, () => cb.onAbility(id));
      btn.setAttribute('aria-label', t(`ability.${id}.name`));
      el('span', `ability-glyph glyph-${id}`, btn);
      el('span', 'ability-label', btn, t(`ability.short.${id}`));
      const timer = el('span', 'ability-timer', btn);
      this.abilities.push({ id, btn, timer });
    }

    this.hint = el('div', 'control-hint', this.root, t('hintControls'));

    this.panel = el('section', 'panel', this.root);
    const row = el('div', 'upgrade-row', this.panel);
    for (const id of RUN_UPGRADES) {
      const btn = button('upgrade-btn', row, undefined, () => cb.onBuy(id, BULK_STEPS[this.bulkIndex]));
      const head = el('span', 'upgrade-head', btn);
      el('span', 'upgrade-name', head, t(`run.${id}.name`));
      const level = el('span', 'upgrade-level', head);
      const desc = el('span', 'upgrade-desc', btn);
      const costBox = el('span', 'upgrade-cost', btn);
      currencyIcon('coin', costBox);
      const cost = el('span', '', costBox);
      this.upgrades.push({ id, btn, level, desc, cost });
    }
    this.bulkBtn = button('bulk-btn', row, undefined, () => {
      this.bulkIndex = (this.bulkIndex + 1) % BULK_STEPS.length;
    });
  }

  show(visible: boolean): void {
    toggleClass(this.root, 'hidden', !visible);
  }

  hideHint(): void {
    this.hint.classList.add('hidden');
  }

  showHint(): void {
    this.hint.classList.remove('hidden');
  }

  update(state: GameState): void {
    const run = state.run;
    const meta = state.meta;
    setText(this.level, t('level', { level: run.level }));
    setText(this.coins, formatNumber(run.coins));
    toggleClass(this.boost, 'hidden', meta.boostTime <= 0);
    if (meta.boostTime > 0) setText(this.boost, `×2 · ${formatDuration(meta.boostTime)}`);

    const stats = cannonStats(run.upgrades, meta.workshop);
    const step = BULK_STEPS[this.bulkIndex];
    const over = run.phase === 'gameOver' || run.phase === 'dying';
    for (const u of this.upgrades) {
      const def = BALANCE.runUpgrades[u.id];
      const owned = run.upgrades[u.id];
      const can = affordable(def, owned, run.coins);
      const count = step === Infinity ? Math.max(1, can) : step;
      setText(u.level, String(owned));
      const value = u.id === 'damage' ? stats.damage : u.id === 'fireRate' ? stats.shotsPerSecond : stats.maxHp;
      setText(u.desc, t(`run.${u.id}.desc`, { value: formatNumber(value) }));
      setText(u.cost, formatNumber(bulkCost(def, owned, count)));
      setDisabled(u.btn, over || can < 1 || (step !== Infinity && can < step));
    }
    setText(this.bulkBtn, step === Infinity ? t('bulkMax') : t('bulk', { n: step }));

    const c = run.cannon;
    for (const a of this.abilities) {
      const level = meta.abilities[a.id];
      toggleClass(a.btn, 'hidden', level === 0);
      if (level === 0) continue;
      const cd = c.cooldowns[a.id];
      const ratio = cd / abilityCooldown(a.id, level);
      const active = (a.id === 'autoAim' && c.autoAimTime > 0) || (a.id === 'shield' && c.shieldTime > 0);
      a.btn.style.setProperty('--cd', `${Math.round(ratio * 360)}deg`);
      toggleClass(a.btn, 'active', active);
      toggleClass(a.btn, 'ready', abilityReady(state, a.id));
      setText(a.timer, cd > 0 ? String(Math.ceil(cd)) : '');
      setDisabled(a.btn, !abilityReady(state, a.id) || !isFighting(run.phase));
    }
  }
}
