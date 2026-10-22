export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Plus petite différence d'angle signée de a vers b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Retire les éléments ne vérifiant pas `keep`, sans créer de nouveau tableau. */
export function compact<T>(items: T[], keep: (item: T) => boolean): void {
  let w = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (keep(it)) items[w++] = it;
  }
  items.length = w;
}
