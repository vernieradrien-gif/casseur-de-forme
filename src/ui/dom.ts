export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Son de clic commun à tous les boutons (branché par l'application). */
let clickSound: () => void = () => {};

export function setClickSound(f: () => void): void {
  clickSound = f;
}

export function button(className: string, parent: HTMLElement, text: string | undefined, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, parent, text);
  b.type = 'button';
  b.addEventListener('click', () => {
    clickSound();
    onClick();
  });
  return b;
}

/** Remplace le texte seulement s'il a changé (évite de toucher le DOM à chaque image). */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function setDisabled(b: HTMLButtonElement, disabled: boolean): void {
  if (b.disabled !== disabled) b.disabled = disabled;
}

export function toggleClass(e: HTMLElement, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}

export type Currency = 'coin' | 'diamond' | 'gem';

/** Petite icône de monnaie (dessinée en CSS). */
export function currencyIcon(kind: Currency, parent: HTMLElement): HTMLElement {
  const i = el('span', `icon icon-${kind}`, parent);
  i.setAttribute('aria-hidden', 'true');
  return i;
}

/** Curseur de volume (0 à 1). */
export function slider(parent: HTMLElement, label: string, onInput: (v: number) => void): { input: HTMLInputElement; set(v: number): void } {
  const row = el('label', 'slider-row', parent);
  el('span', 'slider-label', row, label);
  const input = el('input', 'slider', row);
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.addEventListener('input', () => onInput(Number(input.value) / 100));
  return {
    input,
    set(v: number) {
      const s = String(Math.round(v * 100));
      if (input.value !== s && document.activeElement !== input) input.value = s;
    },
  };
}
