import { formatNumber } from '../game/bignum';
import { ABILITIES, BALANCE, RUN_UPGRADES, affordable, bulkCost, cannonStats } from '../game/formulas';
import type { AbilityId, RunUpgradeId } from '../game/formulas';
import { isActiveAbility } from '../game/simulation';
import type { GameState } from '../game/state';
import { t } from '../i18n';
import { button, currencyIcon, el, setDisabled, setText } from './dom';

const BULK_STEPS = [1, 10, 100, Infinity];

export interface HudCallbacks {
  onBuy(id: RunUpgradeId, count: number): void;
  onAbility(id: AbilityId): void;
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
  id: AbilityId;
  btn: HTMLButtonElement;
}

export class Hud {
  readonly topBar: HTMLElement;
  readonly panel: HTMLElement;
  private readonly level: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly diamonds: HTMLElement;
  private readonly gems: HTMLElement;
  private readonly upgrades: UpgradeButton[] = [];
  private readonly abilities: AbilityButton[] = [];
  private readonly bulkBtn: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private bulkIndex = 0;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.topBar = el('header', 'top-bar', root);
    this.level = el('div', 'level', this.topBar);
    const wallet = el('div', 'wallet', this.topBar);
    const money = (kind: 'coin' | 'diamond' | 'gem', label: string) => {
      const box = el('span', `money money-${kind}`, wallet);
      box.title = label;
      currencyIcon(kind, box);
      return el('span', 'money-value', box);
    };
    this.coins = money('coin', t('coins'));
    this.diamonds = money('diamond', t('diamonds'));
    this.gems = money('gem', t('gems'));
    const pause = button('icon-btn', this.topBar, 'II', () => cb.onPause());
    pause.setAttribute('aria-label', t('pause'));

    const abilityBar = el('div', 'ability-bar', root);
    for (const id of ABILITIES) {
      if (!isActiveAbility(id)) continue;
      const btn = button(`ability-btn ability-${id}`, abilityBar, undefined, () => cb.onAbility(id));
      btn.setAttribute('aria-label', t(`ability.${id}.name`));
      el('span', 'ability-label', btn, t(`ability.${id}.name`));
      this.abilities.push({ id, btn });
    }

    this.hint = el('div', 'control-hint', root, t('hintControls'));

    this.panel = el('section', 'panel', root);
    const row = el('div', 'upgrade-row', this.panel);
    for (const id of RUN_UPGRADES) {
      const btn = button('upgrade-btn', row, undefined, () => cb.onBuy(id, BULK_STEPS[this.bulkIndex]));
      el('span', 'upgrade-name', btn, t(`run.${id}.name`));
      const level = el('span', 'upgrade-level', btn);
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

  hideHint(): void {
    this.hint.classList.add('hidden');
  }

  update(state: GameState): void {
    const run = state.run;
    const meta = state.meta;
    setText(this.level, t('level', { level: run.level }));
    setText(this.coins, formatNumber(run.coins));
    setText(this.diamonds, formatNumber(meta.diamonds));
    setText(this.gems, formatNumber(meta.gems));

    const stats = cannonStats(run.upgrades, meta.upgrades);
    const step = BULK_STEPS[this.bulkIndex];
    for (const u of this.upgrades) {
      const def = BALANCE.runUpgrades[u.id];
      const owned = run.upgrades[u.id];
      const can = affordable(def, owned, run.coins);
      const count = step === Infinity ? Math.max(1, can) : step;
      setText(u.level, t('levelShort', { level: owned }));
      const value = u.id === 'damage' ? stats.damage : u.id === 'fireRate' ? stats.shotsPerSecond : stats.maxHp;
      setText(u.desc, t(`run.${u.id}.desc`, { value: formatNumber(value) }));
      setText(u.cost, formatNumber(bulkCost(def, owned, count)));
      setDisabled(u.btn, run.phase === 'gameOver' || can < 1 || (step !== Infinity && can < step));
    }
    setText(this.bulkBtn, step === Infinity ? t('bulkMax') : t('bulk', { n: step }));

    const c = run.cannon;
    for (const a of this.abilities) {
      const unlocked = meta.abilities[a.id];
      a.btn.classList.toggle('hidden', !unlocked);
      if (!unlocked) continue;
      const def = BALANCE.abilities[a.id];
      const total = 'cooldown' in def ? def.cooldown : 1;
      const ratio = c.cooldowns[a.id] / total;
      a.btn.style.setProperty('--cd', `${Math.round(ratio * 360)}deg`);
      setDisabled(a.btn, ratio > 0 || run.phase !== 'playing');
    }
  }
}
