import { BALANCE } from '../game/formulas';
import type { Vec } from '../game/geometry';
import type { GameState } from '../game/state';
import type { ControlMode } from '../storage/save';

/** Sensibilité du glisser relatif (mode « glisser + visée auto »). */
const DRAG_GAIN = 1.4;

/**
 * Traduit le toucher en commandes abstraites (`state.input`) selon le mode choisi.
 * - drag : glisser n'importe où déplace le canon (relatif), visée auto.
 * - dragAim : le canon suit le doigt et vise le point touché.
 * - fixedAim : canon au centre, visée au point touché.
 * Sans toucher : visée automatique (jeu hybride).
 */
export class TouchInput {
  private pointerId: number | null = null;
  private startWorldX = 0;
  private startCannonX = 0;

  constructor(
    target: HTMLElement,
    private readonly state: () => GameState,
    private readonly mode: () => ControlMode,
    private readonly toWorld: (px: number, py: number) => Vec,
    private readonly onFirstTouch: () => void,
  ) {
    target.addEventListener('pointerdown', (e) => this.down(e));
    target.addEventListener('pointermove', (e) => this.move(e));
    target.addEventListener('pointerup', (e) => this.up(e));
    target.addEventListener('pointercancel', (e) => this.up(e));
  }

  /** À appeler à chaque image : maintient le canon au centre en mode fixe. */
  sync(): void {
    if (this.mode() === 'fixedAim') this.state().input.moveX = 0;
  }

  private down(e: PointerEvent): void {
    if (this.pointerId !== null) return;
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
    const input = this.state().input;
    input.aim = null;
    input.moveX = null;
  }

  private apply(w: Vec): void {
    const input = this.state().input;
    const mode = this.mode();
    if (mode === 'drag') {
      input.moveX = this.startCannonX + (w.x - this.startWorldX) * DRAG_GAIN;
      input.aim = null;
    } else {
      input.moveX = mode === 'dragAim' ? w.x : 0;
      // Viser au-dessus du canon (un point trop bas donnerait un angle plat).
      input.aim = { x: w.x, y: Math.min(w.y, BALANCE.world.cannonY - 0.15) };
    }
  }
}
