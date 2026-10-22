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

export function button(className: string, parent: HTMLElement, text: string | undefined, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, parent, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Remplace le texte seulement s'il a changé (évite de toucher le DOM à chaque image). */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function setDisabled(b: HTMLButtonElement, disabled: boolean): void {
  if (b.disabled !== disabled) b.disabled = disabled;
}

/** Petite icône de monnaie (dessinée en CSS). */
export function currencyIcon(kind: 'coin' | 'diamond' | 'gem', parent: HTMLElement): HTMLElement {
  const i = el('span', `icon icon-${kind}`, parent);
  i.setAttribute('aria-hidden', 'true');
  return i;
}
