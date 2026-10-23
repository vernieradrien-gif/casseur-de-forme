import { startingCoins, workshopMaxed } from '../game/actions';
import { formatNumber } from '../game/bignum';
import visual from '../config/visual.json';
import { ABILITIES, ACHIEVEMENTS, BALANCE, CANNONS, ENEMY_KINDS, WEAPONS, WORKSHOP } from '../game/config';
import type { AbilityId, CannonId, WeaponId, WorkshopId } from '../game/config';
import {
  abilityCooldown,
  abilityDuration,
  abilityPrice,
  aimAngleDegrees,
  cost,
  shockwaveBossDamage,
  weaponPower,
  weaponSlots,
  weaponUpgradeCost,
  workshopEffect,
  worldOf,
  worldStart,
  worldThemeId,
  worldsUnlocked,
} from '../game/formulas';
import { polygonVertices, starVertices } from '../game/geometry';
import { cannonUnlockProgress, claimableAchievements, claimableDaily, dailyBonusReady, statValue } from '../game/progress';
import type { GameState } from '../game/state';
import { formatDuration, language, t } from '../i18n';
import { drawIcon, enemyColor, enemyVertices, tierColor, tierVertices, worldPalette } from '../render/shapes';
import type { Extra, Language, Settings } from '../storage/save';
import { LANGUAGES } from '../storage/save';
import { button, currencyIcon, el, setDisabled, setText, slider, toggleClass } from './dom';
import type { Currency } from './dom';

export type ScreenId =
  | 'menu'
  | 'worlds'
  | 'cannons'
  | 'daily'
  | 'workshop'
  | 'armory'
  | 'abilities'
  | 'collection'
  | 'achievements'
  | 'settings'
  | 'pause'
  | 'gameOver'
  | 'welcome'
  | 'victory';

/** Ce dont les écrans ont besoin de l'application. */
export interface AppApi {
  state(): GameState;
  settings(): Settings;
  extra(): Extra;
  hasRun(): boolean;
  /** Nouvelle partie au début du monde `world`. */
  newRun(world: number): void;
  resume(): void;
  toMenu(): void;
  replay(): void;
  continueAd(): void;
  doubleAd(): void;
  boostAd(): void;
  boostRemaining(): number;
  boostWait(): number;
  offlineGain(): { seconds: number; diamonds: number };
  collectOffline(double: boolean): void;
  buyWorkshop(id: WorkshopId): void;
  buyAbility(id: AbilityId): void;
  buyWeapon(id: WeaponId): void;
  toggleEquip(id: WeaponId): void;
  buyCannon(id: CannonId): void;
  selectCannon(id: CannonId): void;
  claimAchievement(id: string): void;
  claimDaily(index: number): void;
  claimDailyBonus(): void;
  cloudStatus(): CloudStatus;
  cloudEnable(): void;
  cloudSyncNow(): void;
  changeSettings(change: Partial<Settings>): void;
  exportCode(): string;
  importCode(code: string): boolean;
  resetSave(): void;
  consentAvailable(): boolean;
  showConsent(): void;
  privacyUrl(): string;
  version(): string;
}

type Refresh = () => void;

/** État de la sauvegarde Google pour l'écran des paramètres. */
export interface CloudStatus {
  available: boolean;
  native: boolean;
  enabled: boolean;
  lastSync: number;
  busy: boolean;
}

/** Écrans superposés au jeu ; une pile permet de revenir à l'écran précédent. */
export class Screens {
  private readonly root: HTMLElement;
  private readonly screens = new Map<ScreenId, HTMLElement>();
  private readonly refreshers = new Map<ScreenId, Refresh[]>();
  private stack: ScreenId[] = [];
  private armed: string | null = null;

  constructor(parent: HTMLElement, private readonly app: AppApi) {
    this.root = el('div', 'overlay', parent);
    this.buildMenu();
    this.buildWorlds();
    this.buildCannons();
    this.buildDaily();
    this.buildWorkshop();
    this.buildArmory();
    this.buildAbilities();
    this.buildCollection();
    this.buildAchievements();
    this.buildSettings();
    this.buildPause();
    this.buildGameOver();
    this.buildWelcome();
    this.buildVictory();
  }

  get open(): ScreenId | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  /** Remplace toute la pile par un écran (ou aucun : jeu en cours). */
  reset(id: ScreenId | null): void {
    this.stack = id ? [id] : [];
    this.render();
  }

  push(id: ScreenId): void {
    if (this.open === id) return;
    this.stack.push(id);
    this.render();
  }

  /** Retour à l'écran précédent ; renvoie false s'il n'y en a pas. */
  back(): boolean {
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.render();
    return true;
  }

  private render(): void {
    this.armed = null;
    const id = this.open;
    toggleClass(this.root, 'visible', id !== null);
    toggleClass(this.root, 'menu-mode', id === 'menu');
    for (const [k, s] of this.screens) toggleClass(s, 'visible', k === id);
    if (id) {
      const s = this.screens.get(id);
      if (s) s.scrollTop = 0;
      this.root.scrollTop = 0;
      this.update();
    }
  }

  update(): void {
    const id = this.open;
    if (!id) return;
    for (const r of this.refreshers.get(id) ?? []) r();
  }

  private screen(id: ScreenId, title?: string): HTMLElement {
    const s = el('section', `screen screen-${id}`, this.root);
    if (title) el('h2', 'screen-title', s, title);
    this.screens.set(id, s);
    this.refreshers.set(id, []);
    return s;
  }

  private on(id: ScreenId, r: Refresh): void {
    this.refreshers.get(id)!.push(r);
  }

  private backButton(s: HTMLElement): void {
    button('menu-btn secondary back-btn', s, t('back'), () => this.back());
  }

  /** Bouton à confirmer d'un second toucher. */
  private confirmButton(id: ScreenId, key: string, b: HTMLButtonElement, label: () => string, confirmLabel: string, action: () => void): void {
    b.addEventListener('click', () => {
      if (this.armed === key) {
        this.armed = null;
        action();
      } else {
        this.armed = key;
      }
      this.update();
    });
    this.on(id, () => setText(b, this.armed === key ? confirmLabel : label()));
  }

  private wallet(id: ScreenId, parent: HTMLElement, kinds: Currency[]): void {
    const w = el('div', 'screen-wallet', parent);
    for (const kind of kinds) {
      const box = el('span', `wallet-item money-${kind}`, w);
      currencyIcon(kind, box);
      const v = el('span', '', box);
      this.on(id, () => {
        const m = this.app.state().meta;
        setText(v, formatNumber(kind === 'diamond' ? m.diamonds : kind === 'gem' ? m.gems : this.app.state().run.coins));
      });
    }
  }

  private priceButton(parent: HTMLElement, onClick: () => void): { btn: HTMLButtonElement; icon: (kind: Currency | null) => void; label: HTMLElement } {
    const btn = button('item-buy', parent, undefined, onClick);
    const icons: Record<Currency, HTMLElement> = {
      coin: currencyIcon('coin', btn),
      diamond: currencyIcon('diamond', btn),
      gem: currencyIcon('gem', btn),
    };
    const label = el('span', '', btn);
    return {
      btn,
      label,
      icon: (kind) => {
        for (const k of Object.keys(icons) as Currency[]) toggleClass(icons[k], 'hidden', k !== kind);
      },
    };
  }

  // ------------------------------------------------------------ Menu principal

  private buildMenu(): void {
    const s = this.screen('menu');
    const head = el('div', 'menu-head', s);
    el('h1', 'game-title', head, t('title'));
    el('p', 'tagline', head, t('tagline'));
    this.wallet('menu', s, ['diamond', 'gem']);

    // Monde en cours : le joueur voit tout de suite combien de mondes il peut traverser.
    const worldCard = button('world-card', s, undefined, () => this.push('worlds'));
    const wName = el('span', 'world-card-name', worldCard);
    const wBar = el('span', 'progress world-progress', worldCard);
    const wFill = el('span', 'progress-fill', wBar);
    const wSub = el('span', 'world-card-sub', worldCard);
    const dots = el('span', 'world-dots', worldCard);
    const dotEls = Array.from({ length: BALANCE.worlds.length }, () => el('span', 'world-dot', dots));
    this.on('menu', () => {
      const meta = this.app.state().meta;
      const world = Math.min(worldOf(meta.bestLevel), BALANCE.worlds.length - 1);
      const from = worldStart(world);
      const to = from + BALANCE.levelsPerWorld - 1;
      const best = Math.min(meta.bestLevel, to);
      setText(wName, t('menu.worldCard', { n: world + 1, total: BALANCE.worlds.length, name: t(`world.${worldThemeId(world)}.name`) }));
      setText(wSub, t('menu.worldProgress', { level: best, to }));
      wFill.style.width = `${Math.round(((best - from) / (to - from + 1)) * 100)}%`;
      worldCard.style.setProperty('--world', worldPalette(world).accent);
      dotEls.forEach((d, i) => {
        toggleClass(d, 'done', meta.bestLevel > worldStart(i) + BALANCE.levelsPerWorld - 1);
        toggleClass(d, 'current', i === world);
        d.style.setProperty('--world', worldPalette(i).accent);
      });
    });

    const main = el('div', 'menu-col', s);
    const play = button('menu-btn primary big', main, undefined, () => {
      if (this.app.hasRun()) this.app.resume();
      else if (worldsUnlocked(this.app.state().meta.bestLevel) > 1) this.push('worlds');
      else this.app.newRun(0);
    });
    const playLabel = el('span', 'btn-main', play);
    const playSub = el('span', 'btn-sub', play);
    const other = button('menu-btn', main, t('menu.newRun'), () => this.push('worlds'));
    this.on('menu', () => {
      const st = this.app.state();
      const has = this.app.hasRun();
      setText(playLabel, has ? t('menu.continue') : t('menu.play'));
      setText(playSub, has ? t('menu.continueLevel', { level: st.run.level }) : t('menu.best', { level: st.meta.bestLevel }));
      toggleClass(other, 'hidden', !has);
    });

    // Objectifs du jour.
    const daily = button('daily-card', s, undefined, () => this.push('daily'));
    const dTitle = el('span', 'daily-title', daily);
    const dBar = el('span', 'progress', daily);
    const dFill = el('span', 'progress-fill', dBar);
    const dText = el('span', 'daily-text', daily);
    this.on('menu', () => {
      const meta = this.app.state().meta;
      const objs = meta.daily.objectives;
      const done = objs.filter((o) => o.progress >= o.target).length;
      setText(dTitle, t('menu.dailyShort', { done, total: objs.length }));
      const ratio = objs.length ? objs.reduce((s2, o) => s2 + Math.min(1, o.progress / o.target), 0) / objs.length : 0;
      dFill.style.width = `${Math.round(ratio * 100)}%`;
      const claim = claimableDaily(meta) > 0;
      setText(dText, claim ? t('menu.claimReady') : objs.map((o) => t(`daily.${o.id}`, { target: o.target })).join(' · '));
      toggleClass(daily, 'done', claim);
    });

    // Boost (pub récompensée).
    const boost = button('menu-btn boost-btn', s, undefined, () => this.app.boostAd());
    const bMain = el('span', 'btn-main', boost);
    const bSub = el('span', 'btn-sub', boost);
    this.on('menu', () => {
      const remaining = this.app.boostRemaining();
      const wait = this.app.boostWait();
      setText(bMain, remaining > 0 ? t('menu.boostActive', { time: formatDuration(remaining) }) : wait > 0 ? t('menu.boostWait', { time: formatDuration(wait) }) : t('menu.boost'));
      setText(bSub, t('menu.boostDesc'));
      setDisabled(boost, remaining > 0 || wait > 0);
    });

    const grid = el('div', 'menu-grid', s);
    const nav: [ScreenId, string][] = [
      ['cannons', t('cannons')],
      ['armory', t('armory')],
      ['abilities', t('abilitiesTitle')],
      ['workshop', t('workshop')],
      ['achievements', t('achievements')],
      ['daily', t('dailyTitle')],
      ['collection', t('collection')],
      ['settings', t('settings')],
    ];
    for (const [id, label] of nav) {
      const b = button(`menu-btn tile tile-${id}`, grid, undefined, () => this.push(id));
      el('span', `tile-glyph glyph-${id}`, b);
      el('span', 'tile-label', b, label);
      if (id === 'achievements' || id === 'daily') {
        const badge = el('span', 'badge hidden', b);
        this.on('menu', () => {
          const meta = this.app.state().meta;
          const n = id === 'achievements' ? claimableAchievements(meta).length : claimableDaily(meta);
          setText(badge, String(n));
          toggleClass(badge, 'hidden', n === 0);
        });
      }
    }
  }

  /** Carte des mondes : tous les mondes de la campagne, leur thème et leur particularité. */
  private buildWorlds(): void {
    const s = this.screen('worlds', t('worlds.title'));
    el('p', 'hint', s, t('worlds.campaign', { level: BALANCE.campaignLevels }));
    const list = el('div', 'item-list', s);
    const rows: { world: number; card: HTMLElement; state: HTMLElement; bar: HTMLElement; play: HTMLButtonElement }[] = [];
    BALANCE.worlds.forEach((def, w) => {
      const card = el('div', 'world-row', list);
      card.style.setProperty('--world', worldPalette(w).accent);
      card.style.setProperty('--sky', worldPalette(w).sky[0]);
      const head = el('div', 'item-head', card);
      el('span', 'world-num', head, String(w + 1));
      el('span', 'item-name', head, t(`world.${def.id}.name`));
      el('span', 'item-level', head, t('worlds.levels', { from: worldStart(w), to: worldStart(w) + BALANCE.levelsPerWorld - 1 }));
      el('div', 'item-desc', card, t(`world.${def.id}.desc`));
      const barBox = el('div', 'progress', card);
      const bar = el('div', 'progress-fill', barBox);
      const foot = el('div', 'world-foot', card);
      const state = el('span', 'item-desc', foot);
      const play = button('item-buy world-play', foot, t('worlds.play'), () => {
        if (this.app.hasRun() && this.armed !== `world${w}`) {
          this.armed = `world${w}`;
          this.update();
          return;
        }
        this.armed = null;
        this.app.newRun(w);
      });
      rows.push({ world: w, card, state, bar, play });
    });
    const endless = el('div', 'world-row endless', list);
    el('div', 'item-name', endless, `∞ ${t('worlds.endless')}`);
    el('div', 'item-desc', endless, t('worlds.endlessDesc'));
    const warn = el('p', 'hint warn', s, t('menu.abandonConfirm'));
    this.on('worlds', () => {
      const st = this.app.state();
      const best = st.meta.bestLevel;
      const unlocked = worldsUnlocked(best);
      for (const r of rows) {
        const from = worldStart(r.world);
        const to = from + BALANCE.levelsPerWorld - 1;
        const locked = r.world >= unlocked;
        const done = best > to;
        toggleClass(r.card, 'locked', locked);
        toggleClass(r.card, 'done', done);
        r.bar.style.width = `${locked ? 0 : done ? 100 : Math.round(((best - from) / (to - from + 1)) * 100)}%`;
        setText(r.state, locked ? t('worlds.locked', { level: from }) : done ? t('worlds.done') : t('worlds.current', { level: best }));
        toggleClass(r.play, 'hidden', locked);
        const coins = r.world > 0 ? ` · ${formatNumber(startingCoins(st, from))}` : '';
        setText(r.play, this.armed === `world${r.world}` ? t('worlds.confirm') : t('worlds.play') + coins);
        toggleClass(r.play, 'selected', this.armed === `world${r.world}`);
      }
      toggleClass(warn, 'hidden', !(this.armed?.startsWith('world') ?? false));
    });
    this.backButton(s);
  }

  /** Canons : chacun son tir ; débloqués par un exploit ou achetés avec des gemmes. */
  private buildCannons(): void {
    const s = this.screen('cannons', t('cannons'));
    el('p', 'hint', s, t('cannonsHint'));
    this.wallet('cannons', s, ['gem']);
    const list = el('div', 'item-list', s);
    for (const id of CANNONS) {
      const def = BALANCE.cannons[id];
      const row = el('div', 'item cannon-item', list);
      const icon = el('canvas', 'item-icon', row);
      const info = el('div', 'item-info', row);
      el('div', 'item-name', info, t(`cannon.${id}.name`));
      el('div', 'item-desc', info, t(`cannon.${id}.desc`));
      el('div', 'item-desc', info, t('cannon.stats', { rate: factor(def.rate), damage: factor(def.damage) }));
      if (def.passive?.length) el('div', 'item-desc cannon-bonus', info, passiveText(def.passive));
      if (id === 'prism') row.classList.add('special');
      const unlock = el('div', 'item-desc cannon-unlock', info);
      const bar = el('div', 'progress hidden', info);
      const fill = el('div', 'progress-fill', bar);
      const actions = el('div', 'item-actions', row);
      const buy = this.priceButton(actions, () => this.app.buyCannon(id));
      const pick = button('item-toggle', actions, undefined, () => this.app.selectCannon(id));
      let drawn = false;
      this.on('cannons', () => {
        if (!drawn) {
          drawn = true;
          drawIcon(icon, (size) => cannonIcon(id, size), visual.cannonColors[id]);
        }
        const meta = this.app.state().meta;
        const owned = meta.cannons[id];
        const prog = cannonUnlockProgress(meta, id);
        setText(unlock, owned ? '' : cannonUnlockText(id));
        toggleClass(bar, 'hidden', owned || !prog);
        if (prog) fill.style.width = `${Math.round((prog.value / prog.goal) * 100)}%`;
        toggleClass(buy.btn, 'hidden', owned || def.gemCost <= 0);
        buy.icon('gem');
        setText(buy.label, `${t('buy')} · ${formatNumber(def.gemCost)}`);
        setDisabled(buy.btn, meta.gems < def.gemCost);
        toggleClass(pick, 'hidden', !owned);
        const chosen = meta.cannon === id;
        setText(pick, chosen ? t('selected') : t('select'));
        toggleClass(pick, 'selected', chosen);
        toggleClass(row, 'equipped', chosen);
      });
    }
    this.backButton(s);
  }

  /** Objectifs du jour : à récupérer en touchant « Récupérer ». */
  private buildDaily(): void {
    const s = this.screen('daily', t('dailyTitle'));
    el('p', 'hint', s, t('dailyHint'));
    this.wallet('daily', s, ['gem']);
    const list = el('div', 'item-list', s);
    for (let i = 0; i < BALANCE.daily.count; i++) {
      const row = el('div', 'item', list);
      const info = el('div', 'item-info', row);
      const name = el('div', 'item-name', info);
      const bar = el('div', 'progress', info);
      const fill = el('div', 'progress-fill', bar);
      const prog = el('div', 'item-desc', info);
      const claim = button('item-buy', row, undefined, () => this.app.claimDaily(i));
      currencyIcon('gem', claim);
      const label = el('span', '', claim);
      this.on('daily', () => {
        const o = this.app.state().meta.daily.objectives[i];
        toggleClass(row, 'hidden', !o);
        if (!o) return;
        setText(name, t(`daily.${o.id}`, { target: o.target }));
        fill.style.width = `${Math.round((o.progress / o.target) * 100)}%`;
        setText(prog, t('ach.progress', { value: o.progress, goal: o.target }));
        const ready = o.progress >= o.target && !o.claimed;
        setText(label, o.claimed ? t('claimed') : `${ready ? t('claim') + ' ' : ''}+${o.gems}`);
        setDisabled(claim, !ready);
        toggleClass(claim, 'ready', ready);
        toggleClass(row, 'done', o.claimed);
      });
    }
    const bonusRow = el('div', 'item', list);
    const bInfo = el('div', 'item-info', bonusRow);
    el('div', 'item-name', bInfo, t('daily.bonus'));
    const bonus = button('item-buy', bonusRow, undefined, () => this.app.claimDailyBonus());
    currencyIcon('gem', bonus);
    const bLabel = el('span', '', bonus);
    this.on('daily', () => {
      const meta = this.app.state().meta;
      const ready = dailyBonusReady(meta);
      setText(bLabel, meta.daily.bonusClaimed ? t('claimed') : `${ready ? t('claim') + ' ' : ''}+${BALANCE.daily.allBonus}`);
      setDisabled(bonus, !ready);
      toggleClass(bonus, 'ready', ready);
      toggleClass(bonusRow, 'done', meta.daily.bonusClaimed);
    });
    this.backButton(s);
  }

  // ------------------------------------------------------------ Atelier, armurerie, capacités

  private buildWorkshop(): void {
    const s = this.screen('workshop', t('workshop'));
    el('p', 'hint', s, t('workshopHint'));
    this.wallet('workshop', s, ['diamond']);
    const list = el('div', 'item-list', s);
    for (const id of WORKSHOP) {
      const def = BALANCE.workshop[id];
      const row = el('div', 'item', list);
      const info = el('div', 'item-info', row);
      const head = el('div', 'item-head', info);
      el('span', 'item-name', head, t(`meta.${id}.name`));
      const lvl = el('span', 'item-level', head);
      const desc = el('div', 'item-desc', info);
      const buy = this.priceButton(row, () => this.app.buyWorkshop(id));
      this.on('workshop', () => {
        const meta = this.app.state().meta;
        const owned = meta.workshop[id];
        const maxed = workshopMaxed(this.app.state(), id);
        setText(lvl, t('levelShort', { level: owned }));
        const value = workshopEffect(id, owned);
        setText(desc, t(`meta.${id}.desc`, { value: formatNumber(id === 'repair' ? Math.round(value * 100) : value) }));
        const price = cost(def, owned);
        buy.icon(maxed ? null : 'diamond');
        setText(buy.label, maxed ? t('maxed') : formatNumber(price));
        setDisabled(buy.btn, maxed || meta.diamonds < price);
      });
    }
    this.backButton(s);
  }

  private buildArmory(): void {
    const s = this.screen('armory', t('armory'));
    el('p', 'hint', s, t('armoryHint'));
    this.wallet('armory', s, ['diamond', 'gem']);
    const slots = el('p', 'line slots-line', s);
    const next = el('p', 'hint', s);
    this.on('armory', () => {
      const meta = this.app.state().meta;
      const max = weaponSlots(meta.bestLevel);
      setText(slots, t('armorySlots', { used: meta.equipped.length, max }));
      const nextLevel = BALANCE.weapons.slotLevels.find((l) => l > meta.bestLevel);
      setText(next, nextLevel ? t('armoryNextSlot', { level: nextLevel }) : '');
    });
    const list = el('div', 'item-list', s);
    for (const id of WEAPONS) {
      const def = BALANCE.weapons[id];
      const row = el('div', 'item weapon-item', list);
      const icon = el('canvas', 'item-icon', row);
      const info = el('div', 'item-info', row);
      const head = el('div', 'item-head', info);
      el('span', 'item-name', head, t(`weapon.${id}.name`));
      const lvl = el('span', 'item-level', head);
      el('div', 'item-desc', info, t(`weapon.${id}.desc`));
      const power = el('div', 'item-desc', info);
      const actions = el('div', 'item-actions', row);
      const buy = this.priceButton(actions, () => this.app.buyWeapon(id));
      const equip = button('item-toggle', actions, undefined, () => this.app.toggleEquip(id));
      let drawn = false;
      this.on('armory', () => {
        if (!drawn) {
          drawn = true;
          drawIcon(icon, (size) => weaponIcon(id, size), visual.weaponColors[id]);
        }
        const meta = this.app.state().meta;
        const level = meta.weapons[id];
        const unlocked = level > 0;
        // Les armes de fin de monde restent invisibles tant qu'elles ne sont pas offertes.
        toggleClass(row, 'hidden', !!def.worldUnlock && !unlocked);
        const maxed = level >= def.maxLevel;
        setText(lvl, unlocked ? t('levelShort', { level }) : '');
        setText(power, unlocked ? t('weapon.power', { value: weaponPower(level).toFixed(1) }) : '');
        const price = unlocked ? weaponUpgradeCost(id, level) : def.gemCost;
        buy.icon(maxed ? null : unlocked ? 'diamond' : 'gem');
        setText(buy.label, maxed ? t('maxed') : `${unlocked ? '' : t('unlock') + ' · '}${formatNumber(price)}`);
        setDisabled(buy.btn, maxed || (unlocked ? meta.diamonds < price : meta.gems < price));
        const equipped = meta.equipped.includes(id);
        toggleClass(equip, 'hidden', !unlocked);
        toggleClass(equip, 'selected', equipped);
        const full = meta.equipped.length >= weaponSlots(meta.bestLevel);
        setText(equip, equipped ? t('unequip') : full ? t('noSlot') : t('equip'));
        setDisabled(equip, !equipped && full);
        toggleClass(row, 'equipped', equipped);
      });
    }
    this.backButton(s);
  }

  private buildAbilities(): void {
    const s = this.screen('abilities', t('abilitiesTitle'));
    el('p', 'hint', s, t('abilitiesHint'));
    this.wallet('abilities', s, ['gem']);
    const list = el('div', 'item-list', s);
    for (const id of ABILITIES) {
      const def = BALANCE.abilities[id];
      const row = el('div', 'item', list);
      el('span', `item-glyph glyph-${id}`, row);
      const info = el('div', 'item-info', row);
      const head = el('div', 'item-head', info);
      el('span', 'item-name', head, t(`ability.${id}.name`));
      const lvl = el('span', 'item-level', head);
      const desc = el('div', 'item-desc', info);
      const buy = this.priceButton(row, () => this.app.buyAbility(id));
      this.on('abilities', () => {
        const meta = this.app.state().meta;
        const level = meta.abilities[id];
        const shown = Math.max(1, level);
        const maxed = level >= def.maxLevel;
        if (id === 'aimAngle') {
          const locked = meta.abilities.autoAim === 0;
          setText(lvl, `${aimAngleDegrees(level)}°`);
          setText(desc, locked ? t('ability.aimAngle.locked') : t('ability.aimAngle.desc', { angle: aimAngleDegrees(Math.min(def.maxLevel, level + 1)) }));
          const price = abilityPrice(id, level);
          buy.icon(maxed ? null : 'gem');
          setText(buy.label, maxed ? t('maxed') : `${t('upgrade')} · ${formatNumber(price)}`);
          setDisabled(buy.btn, maxed || locked || meta.gems < price);
          toggleClass(row, 'owned', level > 0);
          return;
        }
        setText(lvl, level > 0 ? t('levelShort', { level }) : '');
        if (id === 'multishot') {
          setText(desc, level === 0 ? t('ability.multishot.desc') : level === 1 ? t('ability.multishot.desc1') + ' ' + t('ability.multishot.desc') : t('ability.multishot.desc2'));
        } else {
          setText(
            desc,
            t(`ability.${id}.desc`, {
              duration: formatNumber(abilityDuration(id, shown)),
              cooldown: formatNumber(abilityCooldown(id, shown)),
              percent: Math.round(shockwaveBossDamage(shown) * 100),
            }),
          );
        }
        const price = abilityPrice(id, level);
        buy.icon(maxed ? null : 'gem');
        setText(buy.label, maxed ? t('maxed') : `${level === 0 ? t('unlock') : t('upgrade')} · ${formatNumber(price)}`);
        setDisabled(buy.btn, maxed || meta.gems < price);
        toggleClass(row, 'owned', level > 0);
      });
    }
    this.backButton(s);
  }

  // ------------------------------------------------------------ Collection et succès

  private buildCollection(): void {
    const s = this.screen('collection', t('collection'));
    const section = (title: string, count: () => string) => {
      const h = el('h3', 'section-title', s);
      const grid = el('div', 'icon-grid', s);
      this.on('collection', () => setText(h, `${title} · ${count()}`));
      return grid;
    };
    const meta = () => this.app.state().meta;
    const bosses = section(t('collectionBosses'), () => t('collectionCount', { n: meta().collection.bosses.length, total: BALANCE.tiers.length }));
    const golden = section(t('collectionGolden'), () => t('collectionCount', { n: meta().collection.golden.length, total: BALANCE.tiers.length }));
    const special = section(`${t('boss.super')} · ${t('boss.mega')}`, () => t('collectionCount', { n: meta().collection.special.length, total: 2 }));
    const enemies = section(t('collectionEnemies'), () => t('collectionCount', { n: meta().collection.enemies.length, total: ENEMY_KINDS.length }));
    const tiles: { canvas: HTMLCanvasElement; label: HTMLElement; state: string; draw: (known: boolean) => void; known: () => boolean; name: string }[] = [];
    const tile = (grid: HTMLElement, name: string, known: () => boolean, draw: (c: HTMLCanvasElement, known: boolean) => void) => {
      const box = el('div', 'icon-tile', grid);
      const canvas = el('canvas', 'tile-canvas', box);
      const label = el('span', 'tile-name', box);
      tiles.push({ canvas, label, state: '', known, name, draw: (k) => draw(canvas, k) });
    };
    for (let i = 0; i < BALANCE.tiers.length; i++) {
      tile(bosses, t(`boss.${i}`), () => meta().collection.bosses.includes(i), (c, k) =>
        drawIcon(c, (size) => tierVertices(i, size * 0.38, 0, size / 2, size / 2), tierColor(i), !k),
      );
    }
    for (let i = 0; i < BALANCE.tiers.length; i++) {
      tile(golden, t(`boss.${i}`), () => meta().collection.golden.includes(i), (c, k) =>
        drawIcon(c, (size) => tierVertices(i, size * 0.38, 0, size / 2, size / 2), '#ffd84a', !k),
      );
    }
    for (const kind of ['super', 'mega'] as const) {
      tile(special, t(`boss.${kind}`), () => meta().collection.special.includes(kind), (c, k) =>
        drawIcon(c, (size) => polygonVertices(kind === 'mega' ? 8 : 4, size * 0.4, Math.PI / 4, size / 2, size / 2), kind === 'mega' ? '#ff6b4a' : '#8b93a7', !k),
      );
    }
    for (const kind of ENEMY_KINDS) {
      tile(enemies, t(`enemy.${kind}.name`), () => meta().collection.enemies.includes(kind), (c, k) =>
        drawIcon(c, (size) => enemyVertices(kind, size * 0.34, size / 2, size / 2, -Math.PI / 2 + Math.PI), enemyColor(kind), !k),
      );
    }
    this.on('collection', () => {
      for (const tl of tiles) {
        const k = tl.known();
        const key = k ? 'k' : 'u';
        if (tl.state === key) continue;
        tl.state = key;
        tl.draw(k);
        setText(tl.label, k ? tl.name : t('unknown'));
      }
    });
    this.backButton(s);
  }

  private buildAchievements(): void {
    const s = this.screen('achievements', t('achievements'));
    const count = el('p', 'line', s);
    const list = el('div', 'item-list', s);
    for (const a of ACHIEVEMENTS) {
      const row = el('div', 'item ach-item', list);
      const info = el('div', 'item-info', row);
      el('div', 'item-name', info, t(`ach.${a.stat}`, { goal: formatNumber(a.goal), world: a.world ? `${a.world} (${worldName(a.world - 1)})` : '' }));
      const bar = el('div', 'progress', info);
      const fill = el('div', 'progress-fill', bar);
      const prog = el('div', 'item-desc', info);
      const reward = button('item-buy ach-claim', row, undefined, () => this.app.claimAchievement(a.id));
      currencyIcon('gem', reward);
      const rLabel = el('span', '', reward);
      this.on('achievements', () => {
        const meta = this.app.state().meta;
        const done = meta.achievements.includes(a.id);
        const claimed = meta.achievementsClaimed.includes(a.id);
        const ready = done && !claimed;
        setText(rLabel, ready ? t('ach.claim', { gems: a.gems }) : claimed ? `✓ +${a.gems}` : `+${a.gems}`);
        setDisabled(reward, !ready);
        toggleClass(reward, 'ready', ready);
        const v = Math.min(a.goal, statValue(meta, a.stat, a.world));
        fill.style.width = `${(done ? 1 : v / a.goal) * 100}%`;
        setText(prog, t('ach.progress', { value: formatNumber(done ? a.goal : v), goal: formatNumber(a.goal) }));
        toggleClass(row, 'done', done);
      });
    }
    this.on('achievements', () => {
      setText(count, t('achievementsCount', { n: this.app.state().meta.achievements.length, total: ACHIEVEMENTS.length }));
    });
    this.backButton(s);
  }

  // ------------------------------------------------------------ Paramètres

  private buildSettings(): void {
    const s = this.screen('settings', t('settings'));
    const music = slider(s, t('music'), (v) => this.app.changeSettings({ music: v }));
    const sfx = slider(s, t('sfx'), (v) => this.app.changeSettings({ sfx: v }));
    const toggles: [keyof Settings, string][] = [
      ['vibration', t('vibration')],
      ['powerSave', t('powerSave')],
    ];
    for (const [key, label] of toggles) {
      const b = button('choice toggle', s, undefined, () => this.app.changeSettings({ [key]: !this.app.settings()[key] }));
      el('span', 'choice-name', b, label);
      const state = el('span', 'choice-desc', b);
      this.on('settings', () => {
        const on = this.app.settings()[key] === true;
        setText(state, on ? t('on') : t('off'));
        toggleClass(b, 'selected', on);
      });
    }
    el('h3', 'section-title', s, t('language'));
    const langs = el('div', 'row-2', s);
    for (const lang of LANGUAGES) {
      const b = button('choice', langs, t(`lang.${lang}`), () => this.app.changeSettings({ language: lang as Language }));
      this.on('settings', () => toggleClass(b, 'selected', this.app.settings().language === lang));
    }
    this.on('settings', () => {
      music.set(this.app.settings().music);
      sfx.set(this.app.settings().sfx);
    });

    // Sauvegarde Google : affichée seulement quand elle est disponible (application configurée sur Google Play).
    const cloudBox = el('div', 'settings-group', s);
    el('h3', 'section-title', cloudBox, t('cloud'));
    el('p', 'hint left', cloudBox, t('cloud.desc'));
    const cloudBtn = button('menu-btn', cloudBox, undefined, () => {
      const st = this.app.cloudStatus();
      if (st.enabled) this.app.cloudSyncNow();
      else this.app.cloudEnable();
    });
    const cloudInfo = el('p', 'hint', cloudBox);
    this.on('settings', () => {
      const st = this.app.cloudStatus();
      toggleClass(cloudBox, 'hidden', !st.available);
      setText(cloudBtn, st.busy ? '…' : st.enabled ? t('cloud.syncNow') : t('cloud.enable'));
      setDisabled(cloudBtn, st.busy);
      setText(cloudInfo, st.lastSync > 0 ? t('cloud.synced', { time: new Date(st.lastSync).toLocaleTimeString() }) : st.enabled ? t('cloud.on') : '');
    });

    // Consentement publicitaire (RGPD) : modifiable à tout moment quand le formulaire de Google le demande.
    const consent = button('menu-btn', s, t('adsConsent'), () => this.app.showConsent());
    this.on('settings', () => toggleClass(consent, 'hidden', !this.app.consentAvailable()));

    // Export / import de la sauvegarde.
    const io = el('div', 'save-io', s);
    const area = el('textarea', 'save-code hidden', io);
    area.setAttribute('aria-label', t('exportSave'));
    area.spellcheck = false;
    const ioHint = el('p', 'hint hidden', io);
    const row = el('div', 'row-2', io);
    button('menu-btn', row, t('exportSave'), () => {
      area.value = this.app.exportCode();
      area.classList.remove('hidden');
      setText(ioHint, t('exportHint'));
      ioHint.classList.remove('hidden');
      area.select();
      void navigator.clipboard?.writeText(area.value).catch(() => {});
      mode = 'export';
    });
    let mode: 'export' | 'import' | '' = '';
    const imp = button('menu-btn', row, t('importSave'), () => {
      if (mode === 'import' && area.value.trim()) {
        setText(ioHint, this.app.importCode(area.value) ? t('importDone') : t('importError'));
        return;
      }
      mode = 'import';
      area.value = '';
      area.classList.remove('hidden');
      setText(ioHint, t('importHint'));
      ioHint.classList.remove('hidden');
      area.focus();
    });
    this.on('settings', () => setText(imp, mode === 'import' ? t('importOk') : t('importSave')));

    const reset = button('menu-btn danger', s, t('resetSave'), () => {});
    this.confirmButton('settings', 'reset', reset, () => t('resetSave'), t('resetConfirm'), () => this.app.resetSave());

    const about = el('p', 'hint', s);
    const privacy = el('a', 'link', s, t('privacy'));
    privacy.target = '_blank';
    privacy.rel = 'noopener';
    this.on('settings', () => {
      setText(about, t('version', { version: this.app.version() }));
      privacy.href = this.app.privacyUrl();
    });
    this.backButton(s);
  }

  // ------------------------------------------------------------ Pause, défaite, bienvenue, victoire

  private buildPause(): void {
    const s = this.screen('pause', t('paused'));
    const lvl = el('p', 'big-line', s);
    this.on('pause', () => setText(lvl, t('level', { level: this.app.state().run.level })));
    const col = el('div', 'menu-col', s);
    button('menu-btn primary', col, t('resume'), () => this.app.resume());
    button('menu-btn', col, t('settings'), () => this.push('settings'));
    button('menu-btn secondary', col, t('mainMenu'), () => this.app.toMenu());
  }

  private buildGameOver(): void {
    const s = this.screen('gameOver', t('gameOver'));
    const level = el('p', 'big-line', s);
    const best = el('p', 'line', s);
    const earned = el('p', 'line earned', s);
    const col = el('div', 'menu-col', s);
    const cont = button('menu-btn primary ad-btn', col, undefined, () => this.app.continueAd());
    el('span', 'btn-main', cont, t('continueAd'));
    el('span', 'btn-sub', cont, t('continueAdDesc'));
    const dbl = button('menu-btn ad-btn', col, undefined, () => this.app.doubleAd());
    button('menu-btn', col, t('playAgain'), () => this.app.replay());
    button('menu-btn secondary', col, t('mainMenu'), () => this.app.toMenu());
    el('p', 'hint', s, t('gameOverHint'));
    this.on('gameOver', () => {
      const st = this.app.state();
      const run = st.run;
      setText(level, t('gameOverLevel', { level: run.level }));
      const record = st.meta.bestLevel > run.previousBest;
      setText(best, record ? `${t('gameOverNewBest')} · ${t('gameOverBest', { best: st.meta.bestLevel })}` : t('gameOverBest', { best: st.meta.bestLevel }));
      setText(earned, t('gameOverEarned', { diamonds: formatNumber(run.diamondsEarned), gems: formatNumber(run.gemsEarned) }));
      toggleClass(cont, 'hidden', run.continued || run.phase !== 'gameOver');
      setText(dbl, run.diamondsDoubled ? t('doubled') : t('doubleAd'));
      setDisabled(dbl, run.diamondsDoubled || run.diamondsEarned <= 0);
    });
  }

  private buildWelcome(): void {
    const s = this.screen('welcome', t('welcome'));
    const text = el('p', 'line', s);
    const gain = el('p', 'big-line money-diamond welcome-gain', s);
    currencyIcon('diamond', gain);
    const value = el('span', '', gain);
    const col = el('div', 'menu-col', s);
    button('menu-btn primary ad-btn', col, t('doubleOffline'), () => this.app.collectOffline(true));
    button('menu-btn', col, t('collect'), () => this.app.collectOffline(false));
    this.on('welcome', () => {
      const g = this.app.offlineGain();
      setText(text, t('welcomeText', { time: formatDuration(g.seconds) }));
      setText(value, `+${formatNumber(g.diamonds)}`);
    });
  }

  private buildVictory(): void {
    const s = this.screen('victory', t('victory'));
    el('p', 'line', s, t('victoryText', { worlds: BALANCE.worlds.length, levels: BALANCE.campaignLevels }));
    const reward = el('p', 'big-line money-gem', s);
    currencyIcon('gem', reward);
    el('span', '', reward, t('victoryReward', { gems: BALANCE.gems.campaignComplete }));
    button('menu-btn primary', s, t('keepPlaying'), () => this.back() || this.reset(null));
  }
}

/** Silhouette d'un canon (écran Canons). */
/** Silhouette de chaque canon (un seul polygone, en fractions de la taille). */
function cannonIcon(id: CannonId, size: number): { x: number; y: number }[] {
  const base: [number, number][] = [
    [0.18, 0.55],
    [0.28, 0.88],
    [-0.28, 0.88],
    [-0.18, 0.55],
  ];
  const shapes: Record<CannonId, [number, number][]> = {
    classic: [[-0.07, 0.1], [0.07, 0.1], [0.07, 0.55], ...base, [-0.07, 0.55]],
    twin: [[-0.16, 0.1], [-0.06, 0.1], [-0.06, 0.4], [0.06, 0.4], [0.06, 0.1], [0.16, 0.1], [0.16, 0.55], ...base.slice(1, 3), [-0.16, 0.55]],
    ricochet: [[-0.07, 0.2], [0, 0.06], [0.07, 0.2], [0.07, 0.55], ...base, [-0.07, 0.55]],
    gatling: [[-0.13, 0.08], [-0.07, 0.08], [-0.03, 0.3], [0.03, 0.3], [0.07, 0.08], [0.13, 0.08], [0.13, 0.55], ...base.slice(1, 3), [-0.13, 0.55]],
    storm: [[-0.02, 0.04], [0.1, 0.18], [0.02, 0.2], [0.08, 0.32], [0.06, 0.55], ...base, [-0.06, 0.55], [-0.04, 0.3], [-0.1, 0.28]],
    prism: [[0, 0.04], [0.18, 0.34], [0.06, 0.34], [0.06, 0.55], ...base, [-0.06, 0.55], [-0.06, 0.34], [-0.18, 0.34]],
    burst: [[-0.2, 0.18], [-0.12, 0.18], [-0.12, 0.38], [-0.04, 0.38], [-0.04, 0.08], [0.04, 0.08], [0.04, 0.38], [0.12, 0.38], [0.12, 0.18], [0.2, 0.18], [0.2, 0.55], ...base.slice(1, 3), [-0.2, 0.55]],
    shotgun: [[-0.3, 0.1], [0.3, 0.1], [0.08, 0.5], ...base, [-0.08, 0.5]],
    beam: [[0, 0.03], [0.1, 0.13], [0.04, 0.2], [0.04, 0.55], ...base, [-0.04, 0.55], [-0.04, 0.2], [-0.1, 0.13]],
    missile: [[0, 0.04], [0.08, 0.16], [0.08, 0.42], [0.15, 0.55], ...base.slice(1, 3), [-0.15, 0.55], [-0.08, 0.42], [-0.08, 0.16]],
    plasma: [
      ...Array.from({ length: 13 }, (_, i): [number, number] => {
        const a = Math.PI / 2 + 0.4 + ((Math.PI * 2 - 0.8) * i) / 12;
        return [Math.cos(a) * 0.15, 0.25 + Math.sin(a) * 0.15];
      }),
      [0.06, 0.55],
      ...base,
      [-0.06, 0.55],
    ],
  };
  return shapes[id].map(([x, y]) => ({ x: size / 2 + x * size, y: y * size }));
}

/** Coefficient lisible : « 1,15 », « 0,7 », « 1 ». */
function factor(v: number): string {
  return v.toLocaleString(language(), { maximumFractionDigits: 2 });
}

/** Texte du bonus passif d'un canon : « Bonus : +15 % pièces ». */
function passiveText(passive: { stat: string; value: number }[]): string {
  return t('cannon.bonus', { list: passive.map((p) => t(`passive.${p.stat}`, { value: Math.round(p.value * 100) })).join(' · ') });
}

function worldName(world: number): string {
  return t(`world.${worldThemeId(world)}.name`);
}

/** Condition de déblocage d'un canon. */
function cannonUnlockText(id: CannonId): string {
  const def = BALANCE.cannons[id];
  if (!def.unlockStat) return t('cannon.gemsOnly');
  if (def.unlockStat === 'highestCleared') return t('cannon.unlock.campaign', { worlds: BALANCE.worlds.length });
  if (def.gemCost <= 0 && def.unlockStat === 'bestLevel') {
    const world = worldOf(def.unlockValue);
    return t('cannon.unlock.world', { n: world + 1, name: worldName(world) });
  }
  return t(`cannon.unlock.${def.unlockStat}`, { goal: def.unlockValue });
}

function weaponIcon(id: WeaponId, size: number): { x: number; y: number }[] {
  const c = size / 2;
  if (id === 'orbs') return polygonVertices(16, size * 0.22, 0, c, c);
  if (id === 'drones') return polygonVertices(4, size * 0.3, 0, c, c);
  if (id === 'cryo') return polygonVertices(6, size * 0.34, Math.PI / 6, c, c);
  if (id === 'nova') return starVertices(8, size * 0.4, size * 0.16, 0, c, c);
  if (id === 'vortex') {
    // Spirale.
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 3;
      const r = size * (0.08 + (0.32 * i) / 24);
      out.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
    }
    for (let i = 24; i >= 0; i--) {
      const a = (i / 24) * Math.PI * 3;
      const r = size * (0.04 + (0.28 * i) / 24);
      out.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
    }
    return out;
  }
  if (id === 'laser') {
    const w = size * 0.08;
    return [
      { x: c - w, y: size * 0.1 },
      { x: c + w, y: size * 0.1 },
      { x: c + w, y: size * 0.9 },
      { x: c - w, y: size * 0.9 },
    ];
  }
  return [
    { x: c + size * 0.08, y: size * 0.08 },
    { x: c - size * 0.18, y: c + size * 0.04 },
    { x: c, y: c + size * 0.04 },
    { x: c - size * 0.08, y: size * 0.92 },
    { x: c + size * 0.2, y: c - size * 0.06 },
    { x: c + size * 0.02, y: c - size * 0.06 },
  ];
}
