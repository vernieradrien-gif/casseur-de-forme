import { el } from './dom';

/** Petites notifications en haut de l'écran (succès, objectif du jour…). */
export class Toasts {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'toasts', parent);
    this.root.setAttribute('aria-live', 'polite');
  }

  show(text: string, kind: 'gem' | 'info' = 'info', ms = 2600): void {
    const t = el('div', `toast toast-${kind}`, this.root, text);
    while (this.root.children.length > 3) this.root.firstElementChild?.remove();
    setTimeout(() => t.classList.add('leaving'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
}
