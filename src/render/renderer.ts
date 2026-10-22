import visual from '../config/visual.json';
import { formatNumber } from '../game/bignum';
import { BALANCE, tierOf } from '../game/formulas';
import type { EnemyKind } from '../game/formulas';
import { polygonVertices, shapeVertices, starVertices } from '../game/geometry';
import type { Vec } from '../game/geometry';
import { STEP, bossPosition } from '../game/simulation';
import type { Enemy, GameState } from '../game/state';
import { t } from '../i18n';
import type { Effects } from './effects';

export function tierColor(level: number): string {
  const colors = visual.tierColors;
  return colors[tierOf(level) % colors.length];
}

export function enemyColor(kind: EnemyKind): string {
  return visual.enemyColors[kind];
}

/** Silhouette d'un ennemi (coordonnées monde), orientée selon `angle`. */
export function enemyVertices(e: Pick<Enemy, 'kind' | 'radius' | 'x' | 'y'>, angle: number): Vec[] {
  switch (e.kind) {
    case 'tank':
      return polygonVertices(4, e.radius, angle + Math.PI / 4, e.x, e.y);
    case 'hunter':
      return shapeVertices({ sides: 4, scaleX: 0.6 }, e.radius, angle + Math.PI / 2, e.x, e.y);
    case 'rare':
      return starVertices(5, e.radius, e.radius * 0.45, angle, e.x, e.y);
    default:
      // Triangle pointé dans le sens de la marche.
      return polygonVertices(3, e.radius, angle + Math.PI / 2, e.x, e.y);
  }
}

/** Zone de jeu disponible dans le canvas (pixels CSS), entre la barre du haut et le panneau du bas. */
export interface PlayArea {
  top: number;
  bottom: number;
}

const W = BALANCE.world;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private recoil = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
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

  /** `alpha` : fraction du pas de simulation écoulée, pour interpoler le mouvement. */
  draw(state: GameState, fx: Effects, alpha: number, frameDt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#07070f';
    ctx.fillRect(0, 0, this.width, this.height);
    // Bords du terrain (visibles sur écrans larges).
    ctx.fillStyle = '#0b0b18';
    ctx.fillRect(this.sx(-W.width / 2), this.sy(0), W.width * this.scale, W.height * this.scale);

    this.recoil = Math.max(0, this.recoil - frameDt * 8);

    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);

    const color = tierColor(state.run.level);
    this.drawBoss(state, color, alpha);
    this.drawEnemies(state, alpha);
    this.drawProjectiles(state, color, alpha);
    this.drawCannon(state);
    this.drawParticles(fx);
    this.drawTexts(fx);
    ctx.restore();

    this.drawBossBar(state, color);
    this.drawLevelClear(state);

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(${fx.flashColor},${(fx.flash / visual.flashOnDestroy) * 0.2})`;
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

  private glowShape(points: Vec[], color: string, lineWidth: number, blur: number): void {
    const ctx = this.ctx;
    this.path(points);
    ctx.fillStyle = color + '26';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (blur > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private drawBoss(state: GameState, color: string, alpha: number): void {
    const boss = state.run.boss;
    if (!boss) return;
    const p = bossPosition();
    const rot = boss.rotation + BALANCE.boss.rotationSpeed * STEP * alpha;
    const pts = shapeVertices(boss.shape, BALANCE.boss.radius, rot, p.x, p.y);
    this.glowShape(pts, color, 4, 18);
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeStyle = '#ffffffaa';
    this.ctx.stroke();
  }

  private drawBossBar(state: GameState, color: string): void {
    const boss = state.run.boss;
    if (!boss) return;
    const ctx = this.ctx;
    const barW = Math.min(this.width - 32, W.width * this.scale * 0.8);
    const x = this.ox - barW / 2;
    const y = this.sy(0.06);
    const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(x, y, barW, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW * ratio, 8);
    ctx.fillStyle = '#ffffffcc';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      t('bossHp', { hp: formatNumber(Math.max(0, Math.ceil(boss.hp))), max: formatNumber(Math.ceil(boss.maxHp)) }),
      this.ox,
      y - 3,
    );
  }

  private drawEnemies(state: GameState, alpha: number): void {
    const ctx = this.ctx;
    for (const e of state.run.enemies) {
      const x = e.x + e.vx * STEP * alpha;
      const y = e.y + e.vy * STEP * alpha;
      const color = enemyColor(e.kind);
      const angle = e.kind === 'rare' ? e.age * 3 : Math.atan2(e.vy, e.vx);
      this.glowShape(enemyVertices({ ...e, x, y }, angle), color, 2.5, e.kind === 'rare' ? 14 : 0);
      if (e.hp < e.maxHp && e.maxHp > 0) {
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

  private drawProjectiles(state: GameState, color: string, alpha: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    const r = BALANCE.cannon.projectileRadius * this.scale;
    for (const p of state.run.projectiles) {
      ctx.beginPath();
      ctx.arc(this.sx(p.x + p.vx * STEP * alpha), this.sy(p.y + p.vy * STEP * alpha), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private drawCannon(state: GameState): void {
    const ctx = this.ctx;
    const c = state.run.cannon;
    if (state.run.phase === 'gameOver') return;
    const color = visual.cannonColor;
    const s = this.scale;
    const r = BALANCE.cannon.radius;
    const x = this.sx(c.x);
    const y = this.sy(W.cannonY);

    // Fût orienté, avec recul.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.angle);
    const back = this.recoil * 0.012 * s;
    ctx.fillStyle = '#12121f';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(r * 0.3 * s - back, -r * 0.38 * s, r * 1.35 * s, r * 0.76 * s);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Tourelle.
    ctx.beginPath();
    ctx.arc(x, y, r * s, 0, Math.PI * 2);
    ctx.fillStyle = '#12121f';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Bouclier.
    if (c.shieldTime > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(state.time * 12);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.9 * s, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(62,230,255,${0.08 + 0.06 * pulse})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(62,230,255,${0.5 + 0.4 * pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Barre de vie sous le canon.
    const barW = Math.min(W.width * s * 0.5, 180);
    const bx = this.ox - barW / 2;
    const by = this.sy(W.cannonY + r * 1.5);
    const ratio = Math.max(0, Math.min(1, c.hp / c.maxHp));
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(bx, by, barW, 7);
    ctx.fillStyle = ratio > 0.3 ? '#4cff8a' : '#ff5a5a';
    ctx.fillRect(bx, by, barW * ratio, 7);
    ctx.fillStyle = '#ffffffb0';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(t('cannonHp', { hp: formatNumber(Math.ceil(c.hp)), max: formatNumber(Math.ceil(c.maxHp)) }), this.ox, by + 9);
  }

  private drawLevelClear(state: GameState): void {
    const run = state.run;
    if (run.phase !== 'levelClear') return;
    const ctx = this.ctx;
    const a = Math.min(1, run.phaseTimer * 3);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(t('levelClear', { level: run.level }), this.ox, this.sy(W.bossY));
    ctx.globalAlpha = 1;
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

  private drawTexts(fx: Effects): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000aa';
    for (const f of fx.texts) {
      ctx.globalAlpha = Math.min(1, f.life / (visual.floatingTextLife * 0.5));
      ctx.font = `800 ${Math.round(15 * f.scale)}px system-ui, sans-serif`;
      const x = this.sx(f.x);
      const y = this.sy(f.y);
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
