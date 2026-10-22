import { STEP } from './simulation';

/**
 * Boucle à pas fixe : la simulation avance par pas de STEP (1/60 s),
 * le rendu est appelé à chaque image avec la fraction de pas restante.
 * `skipRender()` permet de ne dessiner qu'une image sur deux (économie d'énergie, 30 images/s)
 * sans ralentir la simulation.
 */
export function startLoop(
  update: () => void,
  render: (alpha: number, frameDt: number) => void,
  skipRender: () => boolean = () => false,
): void {
  const MAX_STEPS_PER_FRAME = 5;
  let last = performance.now();
  let acc = 0;
  let renderDt = 0;
  let frame = 0;
  const tick = (now: number) => {
    // Plafonné : après une mise en arrière-plan on ne rattrape pas le temps perdu.
    const frameDt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += frameDt;
    renderDt += frameDt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      update();
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    frame++;
    if (!(skipRender() && frame % 2 === 1)) {
      render(acc / STEP, Math.min(0.1, renderDt));
      renderDt = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
