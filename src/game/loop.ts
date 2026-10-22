import { STEP } from './simulation';

/**
 * Boucle à pas fixe : la simulation avance par pas de STEP (1/60 s),
 * le rendu est appelé à chaque image avec la fraction de pas restante.
 */
export function startLoop(update: () => void, render: (alpha: number, frameDt: number) => void): void {
  const MAX_STEPS_PER_FRAME = 5;
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    // Plafonné : après une mise en arrière-plan on ne rattrape pas le temps perdu.
    const frameDt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += frameDt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      update();
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    render(acc / STEP, frameDt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
