import type { Vec } from '../game/geometry';
import type { GameState } from '../game/state';

/** Sensibilité du glisser relatif. */
const DRAG_GAIN = 1.35;

/**
 * Contrôle unique : le canon suit le doigt, de gauche à droite et de haut en bas
 * (déplacement relatif : on glisse n'importe où, le doigt ne cache pas le canon).
 * Le tir est automatique. Traduit le toucher en commande abstraite (`state.input`).
 */
export class TouchInput {
  private pointerId: number | null = null;
  private start: Vec = { x: 0, y: 0 };
  private startCannon: Vec = { x: 0, y: 0 };
  private readonly keys = { left: false, right: false, up: false, down: false };
  enabled = true;

  constructor(
    target: HTMLElement,
    private readonly state: () => GameState,
    private readonly toWorld: (px: number, py: number) => Vec,
    private readonly onFirstTouch: () => void,
  ) {
    target.addEventListener('pointerdown', (e) => this.down(e));
    target.addEventListener('pointermove', (e) => this.move(e));
    target.addEventListener('pointerup', (e) => this.up(e));
    target.addEventListener('pointercancel', (e) => this.up(e));
    // Clavier (ordinateur) : flèches.
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const map: Record<string, keyof TouchInput['keys']> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      q: 'left',
      a: 'left',
      d: 'right',
      z: 'up',
      w: 'up',
      s: 'down',
    };
    const k = map[e.key];
    if (!k) return;
    this.keys[k] = down;
    if (down) this.onFirstTouch();
    this.sync();
  }

  /** À appeler à chaque image : maintient le déplacement au clavier. */
  sync(): void {
    const k = this.keys;
    const dx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    if (dx === 0 && dy === 0) {
      if (this.pointerId === null && (this.keysWereDown || false)) this.reset();
      this.keysWereDown = false;
      return;
    }
    this.keysWereDown = true;
    const s = this.state();
    s.input.moveX = s.run.cannon.x + dx;
    s.input.moveY = s.run.cannon.y + dy;
  }

  private keysWereDown = false;

  reset(): void {
    this.pointerId = null;
    const input = this.state().input;
    input.moveX = null;
    input.moveY = null;
  }

  private down(e: PointerEvent): void {
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.start = this.toWorld(e.clientX, e.clientY);
    const c = this.state().run.cannon;
    this.startCannon = { x: c.x, y: c.y };
    this.onFirstTouch();
    this.apply(this.start);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.apply(this.toWorld(e.clientX, e.clientY));
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.reset();
  }

  private apply(w: Vec): void {
    const input = this.state().input;
    input.moveX = this.startCannon.x + (w.x - this.start.x) * DRAG_GAIN;
    input.moveY = this.startCannon.y + (w.y - this.start.y) * DRAG_GAIN;
  }
}
