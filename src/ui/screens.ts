import { formatNumber } from '../game/bignum';
import { ABILITIES, BALANCE, DIAMOND_UPGRADES, affordable, cost } from '../game/formulas';
import type { AbilityId, DiamondUpgradeId } from '../game/formulas';
import type { GameState } from '../game/state';
import { t } from '../i18n';
import { CONTROL_MODES } from '../storage/save';
import type { ControlMode, Settings } from '../storage/save';
import { button, currencyIcon, el, setDisabled, setText } from './dom';

export type ScreenId = 'pause' | 'gameOver' | 'workshop' | 'abilities' | 'settings';

export interface ScreenCallbacks {
  onResume(): void;
  onRestart(): void;
  onBuyDiamond(id: DiamondUpgradeId): void;
  onUnlock(id: AbilityId): void;
  onSettings(change: Partial<Settings>): void;
  onResetSave(): void;
}

/** Écrans superposés au jeu (un seul visible à la fois). */
export class Screens {
  private readonly root: HTMLElement;
  private readonly screens = new Map<ScreenId, HTMLElement>();
  private current: ScreenId | null = null;
  /** Écran à rouvrir avec « Retour » (pause ou défaite). */
  private home: ScreenId = 'pause';
  private readonly refreshers: Array<(s: GameState, settings: Settings) => void> = [];
  private resetArmed = false;

  constructor(parent: HTMLElement, private readonly cb: ScreenCallbacks, version: string) {
    this.root = el('div', 'overlay', parent);
    this.buildPause();
    this.buildGameOver();
    this.buildWorkshop();
    this.buildAbilities();
    this.buildSettings(version);
  }

  get open(): ScreenId | null {
    return this.current;
  }

  show(id: ScreenId | null): void {
    if (id === 'pause' || id === 'gameOver') this.home = id;
    this.current = id;
    this.resetArmed = false;
    this.root.classList.toggle('visible', id !== null);
    for (const [k, s] of this.screens) s.classList.toggle('visible', k === id);
  }

  update(state: GameState, settings: Settings): void {
    if (!this.current) return;
    for (const r of this.refreshers) r(state, settings);
  }

  private screen(id: ScreenId, title: string): HTMLElement {
    const s = el('section', 'screen', this.root);
    el('h2', 'screen-title', s, title);
    this.screens.set(id, s);
    return s;
  }

  private backButton(s: HTMLElement): void {
    button('menu-btn secondary', s, t('back'), () => this.show(this.home));
  }

  private navButtons(s: HTMLElement): void {
    const nav = el('div', 'menu-col', s);
    button('menu-btn', nav, t('workshop'), () => this.show('workshop'));
    button('menu-btn', nav, t('abilitiesTitle'), () => this.show('abilities'));
    button('menu-btn secondary', nav, t('settings'), () => this.show('settings'));
  }

  private buildPause(): void {
    const s = this.screen('pause', t('paused'));
    button('menu-btn primary', s, t('resume'), () => this.cb.onResume());
    this.navButtons(s);
  }

  private buildGameOver(): void {
    const s = this.screen('gameOver', t('gameOver'));
    const level = el('p', 'big-line', s);
    const best = el('p', 'line', s);
    const earned = el('p', 'line', s);
    el('p', 'hint', s, t('gameOverHint'));
    button('menu-btn primary', s, t('playAgain'), () => this.cb.onRestart());
    this.navButtons(s);
    this.refreshers.push((state) => {
      setText(level, t('gameOverLevel', { level: state.run.level }));
      setText(best, t('gameOverBest', { best: state.meta.bestLevel }));
      setText(
        earned,
        t('gameOverEarned', { diamonds: formatNumber(state.run.diamondsEarned), gems: formatNumber(state.run.gemsEarned) }),
      );
    });
  }

  private wallet(s: HTMLElement, kind: 'diamond' | 'gem', get: (state: GameState) => number): void {
    const w = el('div', 'screen-wallet', s);
    currencyIcon(kind, w);
    const v = el('span', '', w);
    this.refreshers.push((state) => setText(v, formatNumber(get(state))));
  }

  private buildWorkshop(): void {
    const s = this.screen('workshop', t('workshop'));
    el('p', 'hint', s, t('workshopHint'));
    this.wallet(s, 'diamond', (st) => st.meta.diamonds);
    const list = el('div', 'item-list', s);
    for (const id of DIAMOND_UPGRADES) {
      const def = BALANCE.diamondUpgrades[id];
      const row = el('div', 'item', list);
      const info = el('div', 'item-info', row);
      const head = el('div', 'item-head', info);
      el('span', 'item-name', head, t(`meta.${id}.name`));
      const lvl = el('span', 'item-level', head);
      const desc = el('div', 'item-desc', info);
      const buy = button('item-buy', row, undefined, () => this.cb.onBuyDiamond(id));
      currencyIcon('diamond', buy);
      const price = el('span', '', buy);
      this.refreshers.push((state) => {
        const owned = state.meta.upgrades[id];
        setText(lvl, t('levelShort', { level: owned }));
        setText(desc, t(`meta.${id}.desc`, { value: formatNumber(Math.pow(1 + def.effectPerLevel, owned)) }));
        setText(price, formatNumber(cost(def, owned)));
        setDisabled(buy, affordable(def, owned, state.meta.diamonds) < 1);
      });
    }
    this.backButton(s);
  }

  private buildAbilities(): void {
    const s = this.screen('abilities', t('abilitiesTitle'));
    el('p', 'hint', s, t('abilitiesHint'));
    this.wallet(s, 'gem', (st) => st.meta.gems);
    const list = el('div', 'item-list', s);
    for (const id of ABILITIES) {
      const def = BALANCE.abilities[id];
      const row = el('div', 'item', list);
      const info = el('div', 'item-info', row);
      el('div', 'item-name', info, t(`ability.${id}.name`));
      const params: Record<string, number> = {};
      if ('duration' in def) params.duration = def.duration;
      if ('cooldown' in def) params.cooldown = def.cooldown;
      if ('bossDamageFraction' in def) params.percent = Math.round(def.bossDamageFraction * 100);
      el('div', 'item-desc', info, t(`ability.${id}.desc`, params));
      const buy = button('item-buy', row, undefined, () => this.cb.onUnlock(id));
      const icon = currencyIcon('gem', buy);
      const price = el('span', '', buy);
      this.refreshers.push((state) => {
        const owned = state.meta.abilities[id];
        icon.classList.toggle('hidden', owned);
        setText(price, owned ? t('owned') : formatNumber(def.gemCost));
        setDisabled(buy, owned || state.meta.gems < def.gemCost);
        buy.classList.toggle('owned', owned);
      });
    }
    this.backButton(s);
  }

  private buildSettings(version: string): void {
    const s = this.screen('settings', t('settings'));
    el('h3', 'section-title', s, t('controlMode'));
    const modes = el('div', 'item-list', s);
    for (const mode of CONTROL_MODES) {
      const b = button('choice', modes, undefined, () => this.cb.onSettings({ controlMode: mode as ControlMode }));
      el('span', 'choice-name', b, t(`control.${mode}`));
      el('span', 'choice-desc', b, t(`control.${mode}.desc`));
      this.refreshers.push((_, settings) => b.classList.toggle('selected', settings.controlMode === mode));
    }

    el('h3', 'section-title', s, t('vibration'));
    const vib = button('choice', s, undefined, () => this.cb.onSettings({ vibration: !this.lastSettings?.vibration }));
    this.refreshers.push((_, settings) => {
      this.lastSettings = settings;
      setText(vib, settings.vibration ? t('on') : t('off'));
      vib.classList.toggle('selected', settings.vibration);
    });

    const reset = button('menu-btn danger', s, t('resetSave'), () => {
      if (this.resetArmed) {
        this.resetArmed = false;
        this.cb.onResetSave();
      } else {
        this.resetArmed = true;
      }
    });
    this.refreshers.push(() => setText(reset, this.resetArmed ? t('resetConfirm') : t('resetSave')));
    el('p', 'hint', s, t('about', { version }));
    this.backButton(s);
  }

  private lastSettings: Settings | null = null;
}
