import visual from '../config/visual.json';
import { formatNumber } from '../game/bignum';
import { BALANCE, tierOf } from '../game/formulas';
import { polygonVertices } from '../game/geometry';
import type { Vec } from '../game/geometry';
import { cannonPosition, STEP } from '../game/simulation';
import type { GameState } from '../game/state';
import { t } from '../i18n';
import type { Effects } from './effects';

export function tierColor(level: number): string {
  const colors = visual.tierColors;
  return colors[tierOf(level) % colors.length];
}

/** Zone de jeu disponible dans le canvas (en pixels CSS), au-dessus du panneau d'améliorations. */
export interface PlayArea {
  top: number;
  bottom: number;
}

const WORLD_TOP = -0.6;
const WORLD_BOTTOM = 0.92;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private scale = 1;
  private cx = 0;
  private cy = 0;
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
    const span = WORLD_BOTTOM - WORLD_TOP;
    this.scale = Math.min(this.width * 0.95, playH / span);
    this.cx = this.width / 2;
    this.cy = area.top + (playH - span * this.scale) / 2 - WORLD_TOP * this.scale;
  }

  onShot(): void {
    this.recoil = 1;
  }

  private sx(x: number): number {
    return this.cx + x * this.scale;
  }

  private sy(y: number): number {
    return this.cy + y * this.scale;
  }

  /** `alpha` : fraction du pas de simulation écoulée, pour interpoler le mouvement. */
  draw(state: GameState, fx: Effects, alpha: number, frameDt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#07070f';
    ctx.fillRect(0, 0, this.width, this.height);

    this.recoil = Math.max(0, this.recoil - frameDt * 8);

    ctx.save();
    if (fx.shake > 0) {
      ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    }

    const color = tierColor(state.level);
    this.drawShape(state, color, alpha);
    this.drawProjectiles(state, color, alpha);
    this.drawCannon(color);
    this.drawParticles(fx);
    this.drawTexts(fx);
    ctx.restore();

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(fx.flash / visual.flashOnDestroy) * 0.18})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private path(points: Vec[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(this.sx(p.x), this.sy(p.y)) : ctx.lineTo(this.sx(p.x), this.sy(p.y))));
    ctx.closePath();
  }

  private drawShape(state: GameState, color: string, alpha: number): void {
    const shape = state.shape;
    if (!shape) return;
    const ctx = this.ctx;
    const r = BALANCE.shape.radius;
    const rot = shape.rotation + BALANCE.shape.rotationSpeed * STEP * alpha;
    const pts = polygonVertices(shape.sides, r, rot);

    this.path(pts);
    ctx.fillStyle = color + '22';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffffaa';
    ctx.stroke();

    // Barre de PV au-dessus de la forme.
    const barW = r * 1.6 * this.scale;
    const barH = 10;
    const x = this.cx - barW / 2;
    const y = this.sy(-r - 0.16);
    const ratio = Math.max(0, Math.min(1, shape.hp / shape.maxHp));
    ctx.fillStyle = '#ffffff1a';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = ratio > 0.3 ? '#4cff8a' : '#ff5a5a';
    ctx.fillRect(x, y, barW * ratio, barH);
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);

    ctx.fillStyle = '#ffffffcc';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(t('hp', { hp: formatNumber(Math.max(0, Math.ceil(shape.hp))), max: formatNumber(Math.ceil(shape.maxHp)) }), this.cx, y - 4);
  }

  private drawProjectiles(state: GameState, color: string, alpha: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    for (const p of state.projectiles) {
      const x = this.sx(p.x + p.vx * STEP * alpha);
      const y = this.sy(p.y + p.vy * STEP * alpha);
      ctx.beginPath();
      ctx.arc(x, y, 0.016 * this.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private drawCannon(color: string): void {
    const ctx = this.ctx;
    const c = cannonPosition();
    const x = this.sx(c.x);
    const y = this.sy(c.y) + this.recoil * 0.015 * this.scale;
    const s = this.scale;
    ctx.fillStyle = '#12121f';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    // Fût orienté vers le centre (vers le haut).
    ctx.beginPath();
    ctx.rect(x - 0.022 * s, y - 0.09 * s, 0.044 * s, 0.09 * s);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 0.05 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawParticles(fx: Effects): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      const x = this.sx(p.x);
      const y = this.sy(p.y);
      const size = p.size * this.scale;
      if (p.kind === 1) {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const ang = p.rot + (i * Math.PI * 2) / 3;
          const px = x + Math.cos(ang) * size;
          const py = y + Math.sin(ang) * size;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else {
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
      const a = Math.min(1, f.life / (visual.floatingTextLife * 0.5));
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(18 * f.scale)}px system-ui, sans-serif`;
      const x = this.sx(f.x);
      const y = this.sy(f.y);
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** Sommets en coordonnées monde de la forme (pour les éclats). */
  static shapeVertices(sides: number, rotation: number): Vec[] {
    return polygonVertices(sides, BALANCE.shape.radius, rotation);
  }
}
