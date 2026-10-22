export interface Vec {
  x: number;
  y: number;
}

/**
 * Sommets d'un polygone régulier. Rotation 0 : premier sommet vers le haut
 * (repère écran, y vers le bas).
 */
export function polygonVertices(sides: number, radius: number, rotation: number, cx = 0, cy = 0): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation - Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
}

/** Étoile : polygone alternant rayon extérieur et rayon intérieur. */
export function starVertices(points: number, outer: number, inner: number, rotation: number, cx = 0, cy = 0): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / points;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** Test point dans polygone (lancer de rayon). */
export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
