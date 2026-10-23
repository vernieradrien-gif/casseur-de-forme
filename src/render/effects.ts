import visual from '../config/visual.json';
import type { Vec } from '../game/geometry';

/** Effets purement visuels (n'influencent jamais la simulation). Coordonnées en unités monde. */

export interface Particle {
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
  /** 0 = étincelle (trait), 1 = éclat (triangle), 2 = point lumineux. */
  kind: 0 | 1 | 2;
  /** Ralentissement (0 = aucun). */
  drag: number;
  gravity: number;
}

export interface Ring {
  x: number;
  y: number;
  radius: number;
  grow: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

export interface Bolt {
  points: Vec[];
  life: number;
  color: string;
}

export interface Banner {
  text: string;
  sub: string;
  color: string;
  life: number;
  maxLife: number;
}

const MAX_TEXTS = 40;

export class Effects {
  readonly particles: Particle[] = [];
  readonly rings: Ring[] = [];
  readonly texts: FloatingText[] = [];
  readonly bolts: Bolt[] = [];
  /** Plafond de particules (abaissé quand le téléphone peine). */
  maxParticles = visual.maxParticles;
  readonly banners: Banner[] = [];
  shake = 0;
  flash = 0;
  flashMax = 1;
  flashColor = '255,255,255';

  clear(): void {
    this.particles.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.bolts.length = 0;
    this.banners.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  private add(p: Particle): void {
    if (this.particles.length >= this.maxParticles) {
      // Remplace la particule la plus ancienne (plafond de 300).
      this.particles.shift();
    }
    this.particles.push(p);
  }

  sparks(x: number, y: number, color: string, count = visual.sparksOnHit, speed = 1, dir?: number): void {
    for (let i = 0; i < count; i++) {
      const a = dir === undefined ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.6;
      const s = (0.3 + Math.random() * 0.6) * speed;
      const life = 0.18 + Math.random() * 0.2;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: a, vrot: 0, size: 0.012, life, maxLife: life, color, kind: 0, drag: 3, gravity: 0 });
    }
  }

  /** Points lumineux qui flottent (gemmes, pièces, régénération). */
  glitter(x: number, y: number, color: string, count: number, spread = 0.04): void {
    for (let i = 0; i < count; i++) {
      const life = 0.5 + Math.random() * 0.5;
      this.add({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -0.1 - Math.random() * 0.2,
        rot: 0,
        vrot: 0,
        size: 0.006 + Math.random() * 0.006,
        life,
        maxLife: life,
        color,
        kind: 2,
        drag: 1,
        gravity: 0,
      });
    }
  }

  /** Éclats projetés depuis le contour `vertices` autour de `center`. */
  shards(vertices: Vec[], center: Vec, color: string, count: number, size = 1, speed = 1): void {
    for (let i = 0; i < count; i++) {
      const a = vertices[i % vertices.length];
      const b = vertices[(i + 1) % vertices.length];
      const t = Math.random();
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const dx = x - center.x;
      const dy = y - center.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = (0.3 + Math.random() * 0.9) * (0.5 + size * 0.5) * speed;
      const life = 0.6 + Math.random() * 0.7;
      this.add({
        x,
        y,
        vx: (dx / d) * s + (Math.random() - 0.5) * 0.3,
        vy: (dy / d) * s + (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 14,
        size: (0.008 + Math.random() * 0.02) * size,
        life,
        maxLife: life,
        color,
        kind: 1,
        drag: 1.4,
        gravity: 0.25,
      });
    }
  }

  ring(x: number, y: number, color: string, radius = 0.02, grow = 0.6, life = 0.4, width = 3): void {
    if (this.rings.length >= visual.maxRings) this.rings.shift();
    this.rings.push({ x, y, radius, grow, life, maxLife: life, color, width });
  }

  bolt(points: Vec[], color = visual.lightningColor): void {
    // Trajet en zigzag entre les points (calculé une fois).
    const jagged: Vec[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const n = 6;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const off = k === 0 ? 0 : (Math.random() - 0.5) * 0.05;
        jagged.push({ x: a.x + (b.x - a.x) * t + off, y: a.y + (b.y - a.y) * t + off * 0.5 });
      }
    }
    jagged.push(points[points.length - 1]);
    this.bolts.push({ points: jagged, life: 0.18, color });
  }

  floatText(x: number, y: number, text: string, color = '#ffffff', scale = 1, life = visual.floatingTextLife): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.05, y, text, life, maxLife: life, color, scale });
  }

  banner(text: string, sub = '', color = '#ffffff', life = visual.bannerLife): void {
    // Un seul bandeau à la fois : le nouveau remplace l'ancien s'il est déjà bien entamé.
    if (this.banners.length > 0 && this.banners[0].life < this.banners[0].maxLife * 0.6) this.banners.shift();
    if (this.banners.length >= 3) this.banners.shift();
    this.banners.push({ text, sub, color, life, maxLife: life });
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  addFlash(rgb: string, amount = visual.flashOnDestroy): void {
    this.flashColor = rgb;
    this.flash = amount;
    this.flashMax = amount;
  }

  /** `dt` : temps réel ; `scale` : ralenti de la scène (explosion du canon). */
  update(dt: number, scale = 1): void {
    const sdt = dt * scale;
    let w = 0;
    for (const p of this.particles) {
      p.life -= sdt;
      if (p.life <= 0) continue;
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      p.vy += p.gravity * sdt;
      const k = Math.max(0, 1 - p.drag * sdt);
      p.vx *= k;
      p.vy *= k;
      p.rot += p.vrot * sdt;
      this.particles[w++] = p;
    }
    this.particles.length = w;

    w = 0;
    for (const r of this.rings) {
      r.life -= sdt;
      if (r.life <= 0) continue;
      r.radius += r.grow * sdt;
      this.rings[w++] = r;
    }
    this.rings.length = w;

    w = 0;
    for (const f of this.texts) {
      f.life -= dt;
      if (f.life <= 0) continue;
      f.y -= 0.2 * dt;
      this.texts[w++] = f;
    }
    this.texts.length = w;

    w = 0;
    for (const b of this.bolts) {
      b.life -= dt;
      if (b.life > 0) this.bolts[w++] = b;
    }
    this.bolts.length = w;

    if (this.banners.length > 0) {
      this.banners[0].life -= dt;
      if (this.banners[0].life <= 0) this.banners.shift();
    }

    this.shake = Math.max(0, this.shake - visual.shakeDecay * this.shake * dt - dt);
    this.flash = Math.max(0, this.flash - dt);
  }
}
