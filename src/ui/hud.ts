import { formatNumber } from '../game/bignum';
import { cannonDamage, upgradeBulkCost, upgradeMaxAffordable } from '../game/formulas';
import type { GameState } from '../game/state';
import { t } from '../i18n';

const BULK_STEPS = [1, 10, 100, Infinity];

export interface HudCallbacks {
  onBuyDamage(count: number): void;
  onTogglePause(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent?.appendChild(e);
  return e;
}

/** Remplace le texte seulement s'il a changé (évite de toucher le DOM à chaque image). */
function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export class Hud {
  readonly panel: HTMLElement;
  readonly topBar: HTMLElement;
  private readonly level: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly buyBtn: HTMLButtonElement;
  private readonly buyLevel: HTMLElement;
  private readonly buyDesc: HTMLElement;
  private readonly buyCost: HTMLElement;
  private readonly bulkBtn: HTMLButtonElement;
  private readonly pauseOverlay: HTMLElement;
  private bulkIndex = 0;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.topBar = el('header', 'top-bar', root);
    this.level = el('div', 'level', this.topBar);
    const coinBox = el('div', 'coins', this.topBar);
    el('span', 'coin-icon', coinBox).setAttribute('aria-hidden', 'true');
    this.coins = el('span', 'coin-value', coinBox);
    coinBox.title = t('coinsLabel');
    const pauseBtn = el('button', 'pause-btn', this.topBar);
    pauseBtn.type = 'button';
    pauseBtn.setAttribute('aria-label', t('pause'));
    pauseBtn.textContent = 'II';
    pauseBtn.addEventListener('click', () => cb.onTogglePause());

    this.panel = el('section', 'panel', root);
    const row = el('div', 'upgrade-row', this.panel);
    this.buyBtn = el('button', 'upgrade-btn', row);
    this.buyBtn.type = 'button';
    const info = el('span', 'upgrade-info', this.buyBtn);
    const head = el('span', 'upgrade-head', info);
    el('span', 'upgrade-name', head).textContent = t('upgrade.damage.name');
    this.buyLevel = el('span', 'upgrade-level', head);
    this.buyDesc = el('span', 'upgrade-desc', info);
    this.buyCost = el('span', 'upgrade-cost', this.buyBtn);
    this.buyBtn.addEventListener('click', () => cb.onBuyDamage(BULK_STEPS[this.bulkIndex]));

    this.bulkBtn = el('button', 'bulk-btn', row);
    this.bulkBtn.type = 'button';
    this.bulkBtn.addEventListener('click', () => {
      this.bulkIndex = (this.bulkIndex + 1) % BULK_STEPS.length;
    });

    this.pauseOverlay = el('div', 'pause-overlay', root);
    el('div', 'pause-title', this.pauseOverlay).textContent = t('paused');
    el('div', 'pause-hint', this.pauseOverlay).textContent = t('resume');
    this.pauseOverlay.addEventListener('click', () => cb.onTogglePause());
  }

  update(state: GameState, paused: boolean): void {
    setText(this.level, t('level', { level: state.level }));
    setText(this.coins, formatNumber(state.coins));

    const owned = state.upgrades.damage;
    const step = BULK_STEPS[this.bulkIndex];
    const affordable = upgradeMaxAffordable('damage', owned, state.coins);
    const count = step === Infinity ? Math.max(1, affordable) : step;
    const cost = upgradeBulkCost('damage', owned, count);
    const canBuy = affordable >= 1 && (step === Infinity || affordable >= step);

    setText(this.buyLevel, t('upgrade.level', { level: owned }));
    setText(this.buyDesc, t('upgrade.damage.desc', { value: formatNumber(cannonDamage(owned)) }));
    setText(this.buyCost, t('upgrade.cost', { cost: formatNumber(cost) }));
    if (this.buyBtn.disabled === canBuy) this.buyBtn.disabled = !canBuy;
    setText(this.bulkBtn, step === Infinity ? t('bulkMax') : t('bulk', { n: step }));

    this.pauseOverlay.classList.toggle('visible', paused);
  }
}
