import { startingCoins, workshopMaxed } from '../game/actions';
import { formatNumber } from '../game/bignum';
import { ABILITIES, ACHIEVEMENTS, BALANCE, ENEMY_KINDS, WEAPONS, WORKSHOP } from '../game/config';
import type { AbilityId, WeaponId, WorkshopId } from '../game/config';
import {
  abilityCooldown,
  abilityDuration,
  abilityPrice,
  cost,
  shockwaveBossDamage,
  weaponPower,
  weaponSlots,
  weaponUpgradeCost,
  workshopEffect,
  worldStart,
  worldsUnlocked,
} from '../game/formulas';
import { polygonVertices } from '../game/geometry';
import { statValue } from '../game/progress';
import type { GameState } from '../game/state';
import { formatDuration, t } from '../i18n';
import { drawIcon, enemyColor, enemyVertices, tierColor, tierVertices } from '../render/shapes';
import type { Extra, Language, Settings } from '../storage/save';
import { LANGUAGES } from '../storage/save';
import { button, currencyIcon, el, setDisabled, setText, slider, toggleClass } from './dom';
import type { Currency } from './dom';

export type ScreenId =
  | 'menu'
  | 'worlds'
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

  private backButton(id: ScreenId, s: HTMLElement): void {
    button('menu-btn secondary back-btn', s, t('back'), () => this.back());
    void id;
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
    const best = el('p', 'menu-best', head);
    this.wallet('menu', s, ['diamond', 'gem']);

    const main = el('div', 'menu-col', s);
    const play = button('menu-btn primary big', main, undefined, () => {
      if (this.app.hasRun()) this.app.resume();
      else if (worldsUnlocked(this.app.state().meta.bestLevel) > 1) this.push('worlds');
      else this.app.newRun(0);
    });
    const playLabel = el('span', 'btn-main', play);
    const playSub = el('span', 'btn-sub', play);
    const other = button('menu-btn', main, t('menu.chooseWorld'), () => this.push('worlds'));
    this.on('menu', () => {
      const st = this.app.state();
      const has = this.app.hasRun();
      setText(best, t('menu.best', { level: st.meta.bestLevel }));
      setText(playLabel, has ? t('menu.continue') : t('menu.play'));
      setText(playSub, has ? t('menu.continueLevel', { level: st.run.level }) : '');
      setText(other, has ? t('menu.newRun') : t('menu.chooseWorld'));
      toggleClass(other, 'hidden', !has && worldsUnlocked(st.meta.bestLevel) <= 1);
    });

    // Objectif du jour.
    const daily = el('div', 'daily-card', s);
    const dTitle = el('div', 'daily-title', daily);
    const dBar = el('div', 'progress', daily);
    const dFill = el('div', 'progress-fill', dBar);
    const dText = el('div', 'daily-text', daily);
    this.on('menu', () => {
      const d = this.app.state().meta.daily;
      const goal = BALANCE.daily.kills;
      setText(dTitle, t('menu.daily', { goal }));
      dFill.style.width = `${Math.min(100, (d.kills / goal) * 100)}%`;
      setText(dText, d.done ? t('menu.dailyDone') : t('menu.dailyProgress', { n: Math.min(d.kills, goal), goal, gems: BALANCE.daily.gems }));
      toggleClass(daily, 'done', d.done);
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
      ['workshop', t('workshop')],
      ['armory', t('armory')],
      ['abilities', t('abilitiesTitle')],
      ['collection', t('collection')],
      ['achievements', t('achievements')],
      ['settings', t('settings')],
    ];
    for (const [id, label] of nav) {
      const b = button(`menu-btn tile tile-${id}`, grid, undefined, () => this.push(id));
      el('span', `tile-glyph glyph-${id}`, b);
      el('span', 'tile-label', b, label);
    }
  }

  private buildWorlds(): void {
    const s = this.screen('worlds', t('menu.chooseWorld'));
    const list = el('div', 'item-list', s);
    const rows: { world: number; btn: HTMLButtonElement; range: HTMLElement; sub: HTMLElement; name: HTMLElement }[] = [];
    const maxWorlds = 6;
    for (let w = 0; w < maxWorlds; w++) {
      const btn = button('choice world-choice', list, undefined, () => {
        const unlocked = worldsUnlocked(this.app.state().meta.bestLevel);
        if (w >= unlocked) return;
        if (this.app.hasRun() && this.armed !== `world${w}`) {
          this.armed = `world${w}`;
          this.update();
          return;
        }
        this.armed = null;
        this.app.newRun(w);
      });
      const name = el('span', 'choice-name', btn);
      const range = el('span', 'choice-desc', btn);
      const sub = el('span', 'choice-desc', btn);
      rows.push({ world: w, btn, range, sub, name });
    }
    const warn = el('p', 'hint warn', s, t('menu.abandonConfirm'));
    this.on('worlds', () => {
      const st = this.app.state();
      const unlocked = worldsUnlocked(st.meta.bestLevel);
      for (const r of rows) {
        const from = worldStart(r.world);
        const visible = r.world <= unlocked;
        toggleClass(r.btn, 'hidden', !visible);
        if (!visible) continue;
        const locked = r.world >= unlocked;
        setText(r.name, t('menu.world', { n: r.world + 1 }));
        setText(r.range, t('menu.worldRange', { from, to: from + BALANCE.levelsPerWorld - 1 }));
        setText(
          r.sub,
          locked ? t('menu.worldLocked', { level: from }) : r.world > 0 ? t('menu.worldCoins', { coins: formatNumber(startingCoins(st, from)) }) : '',
        );
        setDisabled(r.btn, locked);
        toggleClass(r.btn, 'selected', this.armed === `world${r.world}`);
      }
      toggleClass(warn, 'hidden', !(this.armed?.startsWith('world') ?? false));
    });
    this.backButton('worlds', s);
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
    this.backButton('workshop', s);
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
          drawIcon(icon, (size) => weaponIcon(id, size), id === 'orbs' ? '#a9c4ff' : id === 'laser' ? '#ff6bd6' : '#d6ecff');
        }
        const meta = this.app.state().meta;
        const level = meta.weapons[id];
        const unlocked = level > 0;
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
    this.backButton('armory', s);
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
    this.backButton('abilities', s);
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
    this.backButton('collection', s);
  }

  private buildAchievements(): void {
    const s = this.screen('achievements', t('achievements'));
    const count = el('p', 'line', s);
    const list = el('div', 'item-list', s);
    for (const a of ACHIEVEMENTS) {
      const row = el('div', 'item ach-item', list);
      const info = el('div', 'item-info', row);
      el('div', 'item-name', info, t(`ach.${a.stat}`, { goal: formatNumber(a.goal) }));
      const bar = el('div', 'progress', info);
      const fill = el('div', 'progress-fill', bar);
      const prog = el('div', 'item-desc', info);
      const reward = el('span', 'ach-reward money-gem', row);
      currencyIcon('gem', reward);
      el('span', '', reward, `+${a.gems}`);
      this.on('achievements', () => {
        const meta = this.app.state().meta;
        const done = meta.achievements.includes(a.id);
        const v = Math.min(a.goal, statValue(meta, a.stat));
        fill.style.width = `${(done ? 1 : v / a.goal) * 100}%`;
        setText(prog, t('ach.progress', { value: formatNumber(done ? a.goal : v), goal: formatNumber(a.goal) }));
        toggleClass(row, 'done', done);
      });
    }
    this.on('achievements', () => {
      setText(count, t('achievementsCount', { n: this.app.state().meta.achievements.length, total: ACHIEVEMENTS.length }));
    });
    this.backButton('achievements', s);
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

    el('h3', 'section-title', s, t('adsConsent'));
    const consent = button('menu-btn', s, t('adsConsent'), () => this.app.showConsent());
    const consentHint = el('p', 'hint', s, t('adsConsentWeb'));
    this.on('settings', () => {
      toggleClass(consent, 'hidden', !this.app.consentAvailable());
      toggleClass(consentHint, 'hidden', this.app.consentAvailable());
    });

    // Export / import de la sauvegarde.
    const io = el('div', 'save-io', s);
    const area = el('textarea', 'save-code hidden', io);
    area.setAttribute('aria-label', t('exportSave'));
    area.spellcheck = false;
    const ioHint = el('p', 'hint hidden', io);
    const row = el('div', 'row-2', io);
    const exp = button('menu-btn', row, t('exportSave'), () => {
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
    void exp;
    this.on('settings', () => setText(imp, mode === 'import' ? t('importOk') : t('importSave')));

    const reset = button('menu-btn danger', s, t('resetSave'), () => {});
    this.confirmButton('settings', 'reset', reset, () => t('resetSave'), t('resetConfirm'), () => this.app.resetSave());

    const about = el('p', 'hint', s);
    const privacy = el('a', 'link', s, t('privacy'));
    privacy.target = '_blank';
    privacy.rel = 'noopener';
    this.on('settings', () => {
      setText(about, t('about', { version: this.app.version() }));
      privacy.href = this.app.privacyUrl();
    });
    this.backButton('settings', s);
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
    el('p', 'line', s, t('victoryText'));
    const reward = el('p', 'big-line money-gem', s);
    currencyIcon('gem', reward);
    el('span', '', reward, t('victoryReward', { gems: BALANCE.gems.campaignComplete }));
    button('menu-btn primary', s, t('keepPlaying'), () => this.back() || this.reset(null));
  }
}

function weaponIcon(id: WeaponId, size: number): { x: number; y: number }[] {
  const c = size / 2;
  if (id === 'orbs') return polygonVertices(16, size * 0.22, 0, c, c);
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
