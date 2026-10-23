import visual from '../config/visual.json';
import { BALANCE } from '../game/config';
import { worldThemeId } from '../game/formulas';
import type { EnemyKind } from '../game/config';
import { polygonVertices, shapeVertices, starVertices } from '../game/geometry';
import type { Vec } from '../game/geometry';

/** Couleur d'un palier (forme de boss). */
export function tierColor(tier: number): string {
  const colors = visual.tierColors;
  return colors[((tier % colors.length) + colors.length) % colors.length];
}

/** Couleurs du monde (fond, étoiles, accents). */
export function worldPalette(world: number): { sky: string[]; star: string; accent: string; glow: string } {
  return visual.worlds[worldThemeId(world)];
}

export function enemyColor(kind: EnemyKind): string {
  return visual.enemyColors[kind];
}

/**
 * Silhouette d'un ennemi (coordonnées monde), `angle` = direction de déplacement.
 * Chaque type a une silhouette distincte (accessibilité : reconnaissable sans la couleur).
 */
export function enemyVertices(kind: EnemyKind, radius: number, x: number, y: number, angle: number): Vec[] {
  const point = angle + Math.PI / 2;
  switch (kind) {
    case 'weaver':
      return shapeVertices({ sides: 4, scaleX: 0.45 }, radius, point, x, y);
    case 'tank':
      return polygonVertices(4, radius, Math.PI / 4, x, y);
    case 'turret': {
      // Tourelle : socle carré à pans coupés.
      return polygonVertices(8, radius, Math.PI / 8, x, y).map((p, i) => (i % 2 === 0 ? p : { x: x + (p.x - x) * 0.72, y: y + (p.y - y) * 0.72 }));
    }
    case 'strafer': {
      // Mitrailleur : aile large, pointe vers le bas.
      const pts: Vec[] = [
        { x: -1.2, y: -0.45 },
        { x: 1.2, y: -0.45 },
        { x: 0.55, y: 0.25 },
        { x: 0, y: 0.95 },
        { x: -0.55, y: 0.25 },
      ];
      return transform(pts, radius, 0, x, y);
    }
    case 'hunter': {
      // Flèche (chevron) pointée vers l'avant.
      const pts: Vec[] = [
        { x: 0, y: -1 },
        { x: 0.75, y: 0.75 },
        { x: 0, y: 0.3 },
        { x: -0.75, y: 0.75 },
      ];
      return transform(pts, radius, point, x, y);
    }
    case 'shooter':
      return polygonVertices(6, radius, 0, x, y);
    case 'splitter':
      return polygonVertices(5, radius, Math.PI, x, y);
    case 'dasher':
      return shapeVertices({ sides: 3, scaleX: 0.55 }, radius * 1.15, point, x, y);
    case 'armored':
      return polygonVertices(8, radius, Math.PI / 8, x, y);
    case 'rare':
      return starVertices(5, radius, radius * 0.45, angle, x, y);
    default:
      return polygonVertices(3, radius, point, x, y);
  }
}

function transform(pts: Vec[], r: number, rot: number, x: number, y: number): Vec[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return pts.map((p) => ({ x: x + (p.x * c - p.y * s) * r, y: y + (p.x * s + p.y * c) * r }));
}

/** Silhouette d'une forme de boss (pour les icônes). */
export function tierVertices(tier: number, radius: number, rotation: number, x: number, y: number): Vec[] {
  return shapeVertices(BALANCE.tiers[tier % BALANCE.tiers.length].shape, radius, rotation, x, y);
}

/** Dessine une icône (collection, armurerie) dans un petit canvas. */
export function drawIcon(canvas: HTMLCanvasElement, points: (size: number) => Vec[], color: string, locked = false): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth || 48;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const pts = points(size);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  if (locked) {
    ctx.fillStyle = '#ffffff10';
    ctx.fill();
    ctx.strokeStyle = '#ffffff30';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = color + '30';
  ctx.fill();
  ctx.strokeStyle = color + '55';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}
