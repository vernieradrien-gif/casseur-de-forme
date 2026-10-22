import visual from '../config/visual.json';
import type { Vec } from '../game/geometry';

/** Effets purement visuels (n'influencent jamais la simulation). Coordonnées en unités monde. */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  /** 0 = étincelle (trait), 1 = éclat (triangle). */
  kind: 0 | 1;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  scale: number;
}

const MAX_TEXTS = 40;

export class Effects {
  readonly particles: Particle[] = [];
  readonly texts: FloatingText[] = [];
  shake = 0;
  flash = 0;
  flashColor = '255,255,255';

  private add(p: Particle): void {
    if (this.particles.length >= visual.maxParticles) this.particles.shift();
    this.particles.push(p);
  }

  sparks(x: number, y: number, color: string, count = visual.sparksOnHit): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.3 + Math.random() * 0.5;
      const life = 0.2 + Math.random() * 0.2;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: a, vrot: 0, size: 0.012, life, maxLife: life, color, kind: 0 });
    }
  }

  /** Éclats projetés depuis le contour `vertices` autour de `center`. */
  shards(vertices: Vec[], center: Vec, color: string, count: number, size = 1): void {
    for (let i = 0; i < count; i++) {
      const a = vertices[i % vertices.length];
      const b = vertices[(i + 1) % vertices.length];
      const t = Math.random();
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const dx = x - center.x;
      const dy = y - center.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = (0.3 + Math.random() * 0.8) * (0.5 + size * 0.5);
      const life = 0.6 + Math.random() * 0.6;
      this.add({
        x,
        y,
        vx: (dx / d) * s + (Math.random() - 0.5) * 0.3,
        vy: (dy / d) * s + (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 12,
        size: (0.008 + Math.random() * 0.02) * size,
        life,
        maxLife: life,
        color,
        kind: 1,
      });
    }
  }

  floatText(x: number, y: number, text: string, color = '#ffffff', scale = 1): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.06, y, text, life: visual.floatingTextLife, color, scale });
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  addFlash(rgb: string, amount = visual.flashOnDestroy): void {
    this.flashColor = rgb;
    this.flash = amount;
  }

  update(dt: number): void {
    let w = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.rot += p.vrot * dt;
      this.particles[w++] = p;
    }
    this.particles.length = w;

    w = 0;
    for (const f of this.texts) {
      f.life -= dt;
      if (f.life <= 0) continue;
      f.y -= 0.22 * dt;
      this.texts[w++] = f;
    }
    this.texts.length = w;

    this.shake = Math.max(0, this.shake - visual.shakeDecay * this.shake * dt - dt);
    this.flash = Math.max(0, this.flash - dt);
  }
}
