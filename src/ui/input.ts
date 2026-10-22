import type { Vec } from '../game/geometry';
import type { GameState } from '../game/state';

/** Sensibilité du glisser relatif. */
const DRAG_GAIN = 1.4;

/**
 * Contrôle unique : glisser le doigt n'importe où déplace le canon (déplacement relatif,
 * le doigt ne cache pas le canon). Le tir est automatique, droit vers le haut.
 * Traduit le toucher en commande abstraite (`state.input.moveX`).
 */
export class TouchInput {
  private pointerId: number | null = null;
  private startWorldX = 0;
  private startCannonX = 0;
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
    // Clavier (ordinateur) : flèches gauche / droite.
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  private keys = { left: false, right: false };

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'q') this.keys.left = down;
    else if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = down;
    else return;
    const input = this.state().input;
    const x = this.state().run.cannon.x;
    if (this.keys.left !== this.keys.right) input.moveX = x + (this.keys.left ? -1 : 1);
    else if (this.pointerId === null) input.moveX = null;
    if (down) this.onFirstTouch();
  }

  /** À appeler à chaque image : maintient le déplacement au clavier. */
  sync(): void {
    if (this.keys.left !== this.keys.right) {
      const s = this.state();
      s.input.moveX = s.run.cannon.x + (this.keys.left ? -1 : 1);
    }
  }

  reset(): void {
    this.pointerId = null;
    this.state().input.moveX = null;
  }

  private down(e: PointerEvent): void {
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const w = this.toWorld(e.clientX, e.clientY);
    this.startWorldX = w.x;
    this.startCannonX = this.state().run.cannon.x;
    this.onFirstTouch();
    this.apply(w);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.apply(this.toWorld(e.clientX, e.clientY));
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.state().input.moveX = null;
  }

  private apply(w: Vec): void {
    this.state().input.moveX = this.startCannonX + (w.x - this.startWorldX) * DRAG_GAIN;
  }
}
