import visual from '../config/visual.json';
import { formatNumber } from '../game/bignum';
import { bossHealthRatio, bossVertices, outerRingRadius, waveShieldRadius, weakPointPositions } from '../game/boss';
import { autoAimTarget } from '../game/cannon';
import { BALANCE } from '../game/config';
import type { Vec } from '../game/geometry';
import { STEP } from '../game/simulation';
import { W } from '../game/state';
import type { Boss, Enemy, GameState } from '../game/state';
import { waveProgress } from '../game/waves';
import { activeWeapons, orbPositions } from '../game/weapons';
import { t } from '../i18n';
import type { Effects } from './effects';
import { enemyColor, enemyVertices, tierColor, tierVertices } from './shapes';

/** Zone de jeu disponible dans le canvas (pixels CSS), entre la barre du haut et le panneau du bas. */
export interface PlayArea {
  top: number;
  bottom: number;
}

interface Star {
  x: number;
  y: number;
  z: number;
  tw: number;
}

const HALF = W.width / 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  scale = 1;
  private ox = 0;
  private oy = 0;
  private recoil = 0;
  private readonly stars: Star[] = [];
  private starSpeed = 1;
  private clock = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    for (let i = 0; i < visual.stars; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * Math.PI * 2 });
    }
  }

  resize(area: PlayArea): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    const playH = Math.max(100, area.bottom - area.top);
    this.scale = Math.min(this.width / W.width, playH / W.height);
    this.ox = this.width / 2;
    this.oy = area.top + (playH - W.height * this.scale) / 2;
  }

  /** Pixels CSS → coordonnées monde. */
  toWorld(px: number, py: number): Vec {
    return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
  }

  onShot(): void {
    this.recoil = 1;
  }

  private sx(x: number): number {
    return this.ox + x * this.scale;
  }

  private sy(y: number): number {
    return this.oy + y * this.scale;
  }

  // ------------------------------------------------------------ Fond

  private background(dt: number, speed: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#0a0718');
    g.addColorStop(0.55, '#07070f');
    g.addColorStop(1, '#050a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
    this.starSpeed += (speed - this.starSpeed) * Math.min(1, dt * 2);
    for (const s of this.stars) {
      s.y += s.z * s.z * 0.05 * this.starSpeed * dt;
      if (s.y > 1) {
        s.y -= 1;
        s.x = Math.random();
      }
      const a = 0.35 + 0.45 * s.z * (0.75 + 0.25 * Math.sin(this.clock * 2 + s.tw));
      const size = s.z * 1.8;
      ctx.fillStyle = `rgba(200,220,255,${a.toFixed(3)})`;
      ctx.fillRect(s.x * this.width, s.y * this.height, size, size * (1 + this.starSpeed * 0.6 * s.z));
    }
  }

  // ------------------------------------------------------------ Menu

  /** Fond du menu : étoiles et une grande forme néon qui tourne. */
  drawMenu(dt: number, fx: Effects): void {
    this.clock += dt;
    this.background(dt, 0.6);
    const ctx = this.ctx;
    const tier = Math.floor(this.clock / 6) % BALANCE.tiers.length;
    const fade = Math.min(1, (this.clock % 6) * 2, (6 - (this.clock % 6)) * 2);
    const color = tierColor(tier);
    const r = Math.min(this.width, this.height) * 0.28;
    const cx = this.width / 2;
    const cy = this.height * 0.3;
    const pts = tierVertices(tier, 1, this.clock * 0.35, 0, 0).map((p) => ({ x: cx + p.x * r, y: cy + p.y * r }));
    ctx.globalAlpha = 0.55 * fade;
    this.neonScreen(pts, color, 3);
    const inner = tierVertices(tier, 1, -this.clock * 0.5, 0, 0).map((p) => ({ x: cx + p.x * r * 0.55, y: cy + p.y * r * 0.55 }));
    ctx.globalAlpha = 0.3 * fade;
    this.neonScreen(inner, color, 2);
    ctx.globalAlpha = 1;
    this.drawParticles(fx);
    this.drawRings(fx);
  }

  private neonScreen(pts: Vec[], color: string, width: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.fillStyle = color + '14';
    ctx.fill();
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = width * 4;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // ------------------------------------------------------------ Jeu

  /** `alpha` : fraction du pas de simulation écoulée, pour interpoler le mouvement. */
  draw(state: GameState, fx: Effects, alpha: number, dt: number): void {
    this.clock += dt;
    const run = state.run;
    const boss = run.phase === 'boss';
    this.background(dt * run.timeScale, boss ? 2.2 : 1.2);
    const ctx = this.ctx;
    // Bords du terrain (visibles sur écrans larges).
    ctx.fillStyle = '#ffffff06';
    ctx.fillRect(this.sx(-HALF), this.sy(0), W.width * this.scale, W.height * this.scale);

    this.recoil = Math.max(0, this.recoil - dt * 10);
    const a = alpha * run.timeScale;

    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    for (const b of run.bosses) this.drawBoss(state, b, a);
    this.drawEnemies(state, a);
    this.drawLaser(state);
    this.drawProjectiles(state, a);
    this.drawBullets(state, a);
    this.drawOrbs(state);
    this.drawCannon(state);
    this.drawRings(fx);
    this.drawParticles(fx);
    this.drawBolts(fx);
    this.drawTexts(fx);
    ctx.restore();

    this.drawTopBar(state);
    this.drawBanner(fx);
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(${fx.flashColor},${((fx.flash / fx.flashMax) * 0.28).toFixed(3)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private path(points: Vec[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(this.sx(p.x), this.sy(p.y));
      else ctx.lineTo(this.sx(p.x), this.sy(p.y));
    }
    ctx.closePath();
  }

  /** Forme néon : remplissage translucide, halo large, trait fin lumineux ; blanche si elle vient d'être touchée. */
  private neon(points: Vec[], color: string, width: number, flash = 0, fillAlpha = '22'): void {
    const ctx = this.ctx;
    this.path(points);
    ctx.lineJoin = 'round';
    ctx.fillStyle = flash > 0 ? '#ffffffcc' : color + fillAlpha;
    ctx.fill();
    ctx.strokeStyle = color + '38';
    ctx.lineWidth = width * 3.2;
    ctx.stroke();
    ctx.strokeStyle = flash > 0 ? '#ffffff' : color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private circle(x: number, y: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.arc(this.sx(x), this.sy(y), Math.max(0.5, r * this.scale), 0, Math.PI * 2);
  }

  private drawBoss(state: GameState, boss: Boss, a: number): void {
    const ctx = this.ctx;
    const run = state.run;
    const color = boss.golden ? visual.goldColor : tierColor(boss.tier);
    const moving = run.phase === 'boss';
    const x = boss.x + (moving ? boss.vx * STEP * a : 0);
    const rot = boss.rotation;
    const pts = bossVertices({ ...boss, x });

    // Anneaux à briser (palier « cercle à anneaux »).
    for (let k = boss.rings; k >= 1; k--) {
      const r = boss.radius + BALANCE.boss.ringGap * k;
      const outer = k === boss.rings;
      const life = outer ? boss.ringHp / boss.ringMaxHp : 1;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = (this.clock * 40 * (k % 2 ? 1 : -1)) % 16;
      this.circle(x, boss.y, r);
      ctx.strokeStyle = color + (outer ? 'ee' : '77');
      ctx.lineWidth = outer ? 2 + 3 * life : 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Corps : contour lumineux (halo flou une seule fois par image), plaque intérieure si blindé.
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    this.neon(pts, color, boss.grand ? 4 : 3, boss.flash, '1c');
    ctx.shadowBlur = 0;
    const inner = bossVertices({ ...boss, x, radius: boss.radius * 0.62, rotation: -rot * 1.5 });
    this.path(inner);
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (boss.armor > 0) {
      const plate = bossVertices({ ...boss, x, radius: boss.radius * 0.86 });
      this.path(plate);
      ctx.strokeStyle = '#ffffff55';
      ctx.lineWidth = 2 + boss.armor * 6;
      ctx.stroke();
    }

    // Furie : pulsation rouge.
    if (boss.enraged && moving) {
      const p = 0.5 + 0.5 * Math.sin(this.clock * 10);
      this.path(pts);
      ctx.strokeStyle = `rgba(255,70,90,${(0.35 + 0.4 * p).toFixed(2)})`;
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // Régénération : halo vert quand la forme récupère.
    if (moving && boss.regen > 0 && boss.sinceHit > BALANCE.boss.regenDelay && boss.hp < boss.maxHp) {
      this.circle(x, boss.y, boss.radius * (1.05 + 0.05 * Math.sin(this.clock * 6)));
      ctx.strokeStyle = '#4cff8a88';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Zones faibles : points lumineux pulsants sur les sommets.
    if (moving && boss.rings === 0) {
      const pulse = 0.75 + 0.25 * Math.sin(this.clock * 8);
      ctx.globalCompositeOperation = 'lighter';
      for (const w of weakPointPositions({ ...boss, x }, pts)) {
        this.circle(w.x, w.y, BALANCE.boss.weakPointRadius * 1.25 * pulse);
        ctx.fillStyle = visual.weakColor + '40';
        ctx.fill();
        this.circle(w.x, w.y, BALANCE.boss.weakPointRadius * 0.5);
        ctx.fillStyle = visual.weakColor;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Bouclier de propriété : un segment par coup absorbable.
    if (boss.shieldMax > 0 && moving) {
      const n = boss.shieldMax;
      const r = boss.radius * 1.18;
      for (let i = 0; i < n; i++) {
        const a0 = rot * 0.7 + (i * Math.PI * 2) / n + 0.12;
        const a1 = a0 + (Math.PI * 2) / n - 0.24;
        ctx.beginPath();
        ctx.arc(this.sx(x), this.sy(boss.y), r * this.scale, a0, a1);
        ctx.strokeStyle = i < boss.shieldHits ? visual.shieldColor : '#ffffff18';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    // Bouclier des vagues : bulle qui protège la forme, puis se brise.
    if (run.phase === 'waves' || run.phase === 'bossIntro') {
      const intro = run.phase === 'bossIntro' ? run.phaseTimer / BALANCE.level.bossIntroTime : 1;
      const flicker = run.phase === 'bossIntro' ? (Math.sin(this.clock * 40) > 0 ? 1 : 0.4) : 1;
      const r = waveShieldRadius(boss) * (0.9 + 0.1 * intro);
      ctx.globalAlpha = intro * flicker;
      this.circle(x, boss.y, r);
      const g = ctx.createRadialGradient(this.sx(x), this.sy(boss.y), r * this.scale * 0.6, this.sx(x), this.sy(boss.y), r * this.scale);
      g.addColorStop(0, visual.shieldColor + '00');
      g.addColorStop(1, visual.shieldColor + '40');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.setLineDash([14, 8]);
      ctx.lineDashOffset = -this.clock * 30;
      ctx.strokeStyle = visual.shieldColor + 'aa';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (boss.rings > 0 && moving) {
      this.circle(x, boss.y, outerRingRadius(boss) + 0.01);
      ctx.strokeStyle = '#ffffff10';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawEnemies(state: GameState, a: number): void {
    const ctx = this.ctx;
    for (const e of state.run.enemies) {
      const x = e.x + e.vx * STEP * a;
      const y = e.y + e.vy * STEP * a;
      const color = enemyColor(e.kind);
      const moving = Math.hypot(e.vx, e.vy) > 0.01;
      const angle = e.kind === 'rare' ? e.age * 3 : moving ? Math.atan2(e.vy, e.vx) : Math.PI / 2;
      if (e.kind === 'dasher' && e.mode === 1) this.drawTelegraph(e);
      if (e.kind === 'rare') {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
      }
      this.neon(enemyVertices(e.kind, e.radius, x, y, angle), color, 2.2, e.flash);
      ctx.shadowBlur = 0;
      if (e.kind === 'shooter' && e.mode === 1) {
        this.circle(x, y, e.radius * (0.4 + 0.3 * (1 - Math.max(0, e.timer) / 1.4)));
        ctx.fillStyle = color + '99';
        ctx.fill();
      }
      if (e.kind === 'armored' && e.shieldHits > 0) {
        ctx.beginPath();
        ctx.arc(this.sx(x), this.sy(y), e.radius * 1.35 * this.scale, Math.PI * 0.15, Math.PI * 0.85);
        ctx.strokeStyle = visual.shieldColor;
        ctx.lineWidth = 1.5 + e.shieldHits * 1.2;
        ctx.stroke();
      }
      if (e.hp < e.maxHp && e.maxHp > 0 && e.kind !== 'rare') {
        const w = e.radius * 2 * this.scale;
        const bx = this.sx(x) - w / 2;
        const by = this.sy(y - e.radius) - 7;
        ctx.fillStyle = '#ffffff22';
        ctx.fillRect(bx, by, w, 3);
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, (w * Math.max(0, e.hp)) / e.maxHp, 3);
      }
    }
  }

  private drawTelegraph(e: Enemy): void {
    const ctx = this.ctx;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -this.clock * 60;
    ctx.beginPath();
    ctx.moveTo(this.sx(e.x), this.sy(e.y));
    ctx.lineTo(this.sx(e.tx), this.sy(e.ty));
    ctx.strokeStyle = visual.dangerColor + 'aa';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawProjectiles(state: GameState, a: number): void {
    const ctx = this.ctx;
    const color = state.meta.boostTime > 0 ? visual.goldColor : visual.cannonColor;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = BALANCE.cannon.projectileRadius * this.scale * 1.5;
    ctx.beginPath();
    for (const p of state.run.projectiles) {
      const x = p.x + p.vx * STEP * a;
      const y = p.y + p.vy * STEP * a;
      ctx.moveTo(this.sx(x), this.sy(y));
      ctx.lineTo(this.sx(x - p.vx * 0.022), this.sy(y - p.vy * 0.022));
    }
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = BALANCE.cannon.projectileRadius * this.scale * 0.55;
    ctx.beginPath();
    for (const p of state.run.projectiles) {
      const x = p.x + p.vx * STEP * a;
      const y = p.y + p.vy * STEP * a;
      ctx.moveTo(this.sx(x), this.sy(y));
      ctx.lineTo(this.sx(x - p.vx * 0.015), this.sy(y - p.vy * 0.015));
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawBullets(state: GameState, a: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.run.bullets) {
      const x = b.x + b.vx * STEP * a;
      const y = b.y + b.vy * STEP * a;
      // Traînée.
      ctx.beginPath();
      ctx.moveTo(this.sx(x), this.sy(y));
      ctx.lineTo(this.sx(x - b.vx * 0.08), this.sy(y - b.vy * 0.08));
      ctx.strokeStyle = visual.bulletColor + '55';
      ctx.lineWidth = b.radius * this.scale * 1.4;
      ctx.stroke();
      this.circle(x, y, b.radius * 1.9);
      ctx.fillStyle = visual.bulletColor + '40';
      ctx.fill();
      this.circle(x, y, b.radius);
      ctx.fillStyle = '#ffd0f4';
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawLaser(state: GameState): void {
    const run = state.run;
    if (run.weapons.laserActive <= 0 || !activeWeapons(state).includes('laser')) return;
    const ctx = this.ctx;
    const x = this.sx(run.cannon.x);
    const top = this.sy(-0.05);
    const bottom = this.sy(W.cannonY - BALANCE.cannon.radius);
    const w = (BALANCE.weapons.laser.width ?? 0.04) * this.scale;
    const flick = 0.8 + 0.2 * Math.sin(this.clock * 60);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = visual.laserColor + '40';
    ctx.fillRect(x - w * 1.4, top, w * 2.8, bottom - top);
    ctx.fillStyle = visual.laserColor + 'aa';
    ctx.fillRect(x - (w / 2) * flick, top, w * flick, bottom - top);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w * 0.15, top, w * 0.3, bottom - top);
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawOrbs(state: GameState): void {
    if (!activeWeapons(state).includes('orbs') || state.run.phase === 'gameOver' || state.run.phase === 'dying') return;
    const ctx = this.ctx;
    const r = BALANCE.weapons.orbs.orbRadius ?? 0.02;
    ctx.globalCompositeOperation = 'lighter';
    for (const o of orbPositions(state)) {
      this.circle(o.x, o.y, r * 1.8);
      ctx.fillStyle = visual.orbColor + '33';
      ctx.fill();
      this.circle(o.x, o.y, r);
      ctx.fillStyle = visual.orbColor;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawCannon(state: GameState): void {
    const ctx = this.ctx;
    const run = state.run;
    const c = run.cannon;
    if (run.phase === 'gameOver') return;
    const dying = run.phase === 'dying';
    if (dying && run.phaseTimer >= BALANCE.level.dyingDuration * 0.75) return;
    const color = dying ? (Math.sin(this.clock * 30) > 0 ? '#ff5a5a' : '#ffffff') : visual.cannonColor;
    const s = this.scale;
    const r = BALANCE.cannon.radius;
    const x = this.sx(c.x);
    const y = this.sy(W.cannonY);
    if (c.invulnerable > 0 && !dying && Math.sin(this.clock * 40) > 0.3) ctx.globalAlpha = 0.45;

    // Socle.
    ctx.beginPath();
    ctx.moveTo(x - r * 1.5 * s, y + r * 0.95 * s);
    ctx.lineTo(x + r * 1.5 * s, y + r * 0.95 * s);
    ctx.lineTo(x + r * 1.05 * s, y + r * 0.35 * s);
    ctx.lineTo(x - r * 1.05 * s, y + r * 0.35 * s);
    ctx.closePath();
    ctx.fillStyle = '#10142a';
    ctx.fill();
    ctx.strokeStyle = color + '99';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fût orienté, avec recul.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.angle);
    const back = this.recoil * 0.012 * s;
    const barrels = state.meta.abilities.multishot >= 1 ? [-0.22, 0.22] : [0];
    for (const off of barrels) {
      ctx.beginPath();
      ctx.rect(r * 0.2 * s - back, (off - 0.2) * r * s, r * 1.45 * s, r * 0.4 * s);
      ctx.fillStyle = '#10142a';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // Tourelle.
    ctx.beginPath();
    ctx.arc(x, y, r * s, 0, Math.PI * 2);
    ctx.fillStyle = '#10142a';
    ctx.fill();
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38 * s, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Bouclier (capacité).
    if (c.shieldTime > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(this.clock * 12);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.9 * s, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(107,224,255,${(0.08 + 0.06 * pulse).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(107,224,255,${(0.5 + 0.4 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Visée automatique : réticule sur la cible.
    if (c.autoAimTime > 0 && !dying) {
      const target = autoAimTarget(state);
      if (target) {
        const tx = this.sx(target.x);
        const ty = this.sy(target.y);
        const rr = 14 + 3 * Math.sin(this.clock * 10);
        ctx.strokeStyle = visual.cannonColor + 'cc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, rr, 0, Math.PI * 2);
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2 + this.clock * 2;
          ctx.moveTo(tx + Math.cos(ang) * (rr - 5), ty + Math.sin(ang) * (rr - 5));
          ctx.lineTo(tx + Math.cos(ang) * (rr + 5), ty + Math.sin(ang) * (rr + 5));
        }
        ctx.stroke();
      }
    }

    // Barre de vie sous le canon.
    if (dying) return;
    const barW = Math.min(W.width * s * 0.42, 170);
    const bx = this.ox - barW / 2;
    const by = this.sy(W.cannonY + r * 1.45);
    const ratio = Math.max(0, Math.min(1, c.hp / c.maxHp));
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(bx, by, barW, 6);
    ctx.fillStyle = ratio > 0.3 ? '#4cff8a' : '#ff5a5a';
    ctx.fillRect(bx, by, barW * ratio, 6);
    ctx.fillStyle = '#ffffffb0';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${formatNumber(Math.ceil(c.hp))} / ${formatNumber(Math.ceil(c.maxHp))}`, this.ox, by + 8);
  }

  /** Barre en haut du terrain : progression des vagues, puis PV du boss. */
  private drawTopBar(state: GameState): void {
    const run = state.run;
    if (run.phase === 'gameOver') return;
    const ctx = this.ctx;
    const barW = Math.min(this.width - 32, W.width * this.scale * 0.86);
    const x = this.ox - barW / 2;
    const y = this.sy(0) + 22;
    const h = 8;
    ctx.font = `700 12px ${FONT}`;
    ctx.textBaseline = 'bottom';
    const fighting = run.phase === 'boss' || run.phase === 'dying' || run.phase === 'levelClear';
    const living = run.bosses.filter((b) => b.hp > 0);
    if (run.phase === 'boss' || (run.phase === 'dying' && run.resumePhase === 'boss')) {
      const color = run.golden ? visual.goldColor : tierColor(living[0]?.tier ?? 0);
      const hp = living.reduce((s, b) => s + b.hp + (b.rings > 0 ? b.ringMaxHp * (b.rings - 1) + b.ringHp : 0), 0);
      const ratio = living.length === 0 ? 0 : living.reduce((s, b) => s + bossHealthRatio(b), 0) / Math.max(1, living.length);
      ctx.fillStyle = '#ffffff14';
      ctx.fillRect(x, y, barW, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW * Math.min(1, ratio), h);
      ctx.fillStyle = '#ffffffd0';
      ctx.textAlign = 'left';
      ctx.fillText(`${t('bossPhase')} · ${t(`boss.${living[0]?.tier ?? 0}`)}`, x, y - 3);
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber(Math.ceil(hp)), x + barW, y - 3);
      return;
    }
    if (fighting) return;
    const total = Math.max(1, run.waves.total);
    const progress = waveProgress(state);
    const gap = 4;
    const segW = (barW - gap * total) / (total + 1);
    for (let i = 0; i <= total; i++) {
      const sx = x + i * (segW + gap);
      const fill = i < total ? Math.max(0, Math.min(1, progress * total - i)) : run.phase === 'bossIntro' ? 1 : 0;
      ctx.fillStyle = '#ffffff14';
      ctx.fillRect(sx, y, segW, h);
      ctx.fillStyle = i < total ? visual.cannonColor : visual.dangerColor;
      ctx.fillRect(sx, y, segW * fill, h);
    }
    ctx.fillStyle = '#ffffffd0';
    ctx.textAlign = 'left';
    ctx.fillText(t('wave', { n: Math.min(total, run.waves.index + 1), total }), x, y - 3);
    ctx.textAlign = 'right';
    ctx.fillStyle = visual.dangerColor;
    ctx.fillText(t('bossPhase'), x + barW, y - 3);
  }

  private drawRings(fx: Effects): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of fx.rings) {
      const k = r.life / r.maxLife;
      ctx.globalAlpha = k;
      this.circle(r.x, r.y, r.radius);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (0.4 + k);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawParticles(fx: Effects): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      const x = this.sx(p.x);
      const y = this.sy(p.y);
      if (p.kind === 1) {
        const size = p.size * this.scale;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const ang = p.rot + (i * Math.PI * 2) / 3;
          if (i === 0) ctx.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
          else ctx.lineTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 2) {
        const size = p.size * this.scale;
        ctx.fillStyle = p.color;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * 0.05 * this.scale, y - p.vy * 0.05 * this.scale);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawBolts(fx: Effects): void {
    if (fx.bolts.length === 0) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (const b of fx.bolts) {
      ctx.globalAlpha = Math.min(1, b.life / 0.1);
      for (const [w, c] of [
        [7, visual.lightningColor + '40'],
        [2, '#ffffff'],
      ] as const) {
        ctx.beginPath();
        b.points.forEach((p, i) => (i === 0 ? ctx.moveTo(this.sx(p.x), this.sy(p.y)) : ctx.lineTo(this.sx(p.x), this.sy(p.y))));
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawTexts(fx: Effects): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000aa';
    for (const f of fx.texts) {
      ctx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.5));
      ctx.font = `800 ${Math.round(14 * f.scale)}px ${FONT}`;
      const x = this.sx(f.x);
      const y = this.sy(f.y);
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawBanner(fx: Effects): void {
    const b = fx.banners[0];
    if (!b) return;
    const ctx = this.ctx;
    const k = b.life / b.maxLife;
    const appear = Math.min(1, (1 - k) * 8);
    ctx.globalAlpha = Math.min(1, k * 4) * appear;
    const y = this.sy(W.height * 0.55);
    const scale = 0.8 + 0.2 * appear;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(30 * scale)}px ${FONT}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000000aa';
    ctx.strokeText(b.text, this.ox, y);
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, this.ox, y);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = `700 15px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeText(b.sub, this.ox, y + 30);
      ctx.fillStyle = '#ffffffdd';
      ctx.fillText(b.sub, this.ox, y + 30);
    }
    ctx.globalAlpha = 1;
  }
}
