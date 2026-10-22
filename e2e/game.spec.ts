import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Accès aux informations de débogage exposées par le jeu (`window.__game`). */
interface Debug {
  state: {
    run: {
      level: number;
      phase: string;
      cannon: { x: number; hp: number; maxHp: number; invulnerable: number };
      bullets: unknown[];
    };
    meta: { bestLevel: number };
  };
  effects: { particles: unknown[] };
  screen(): string | null;
  mode(): string;
  perf(): { avg: number; max: number; frames: number };
  resetPerf(): void;
}

const SHOTS = 'test-results/screens';
/** Seuil d'images par seconde : les serveurs d'intégration continue n'ont pas de carte graphique. */
const MIN_FPS = process.env.CI ? 20 : 55;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function debug<T>(page: Page, f: (g: Debug) => T): Promise<T> {
  return page.evaluate(`(${f.toString()})(window.__game)`) as Promise<T>;
}

async function fps(page: Page, ms = 3000): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          const dt = performance.now() - t0;
          if (dt < duration) requestAnimationFrame(tick);
          else resolve((frames * 1000) / dt);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** Détruit le canon : un tir ennemi sur le canon presque à court de PV. */
async function killCannon(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __game: Debug }).__game;
    const c = g.state.run.cannon;
    c.hp = 0.001;
    c.invulnerable = 0;
    (g.state.run.bullets as object[]).push({ x: c.x, y: 1.44, vx: 0, vy: 0, damage: 1, radius: 0.03 });
  });
  await page.waitForFunction(() => (window as unknown as { __game: Debug }).__game.screen() === 'gameOver', null, { timeout: 15_000 });
}

test('menus : tous les écrans s’ouvrent, sans erreur', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?reset');
  await expect(page.getByRole('heading', { name: 'Casseur de forme' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/01-menu.png` });

  const screens: [string, string][] = [
    ['Atelier', 'Atelier'],
    ['Armurerie', 'Armurerie'],
    ['Capacités', 'Capacités'],
    ['Collection', 'Collection'],
    ['Succès', 'Succès'],
    ['Paramètres', 'Paramètres'],
  ];
  for (const [i, [label, title]] of screens.entries()) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.screen.visible .screen-title')).toHaveText(title);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/0${i + 2}-${label.toLowerCase()}.png` });
    await page.locator('.screen.visible .back-btn').click();
    await expect(page.getByRole('heading', { name: 'Casseur de forme' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('partie : vagues, boss, 60 images/s, défaite, rejouer, menu', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?reset&autoplay');
  await page.getByRole('button', { name: /Jouer/ }).click();
  expect(await debug(page, (g) => g.mode())).toBe('game');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOTS}/10-vagues.png` });

  // 60 images/s = 16,7 ms par image : le calcul (simulation + rendu) doit rester bien en dessous.
  await debug(page, (g) => g.resetPerf());
  const measured = await fps(page);
  const work = await debug(page, (g) => g.perf());
  console.log(`vagues : ${measured.toFixed(1)} images/s, calcul ${work.avg.toFixed(2)} ms par image (max ${work.max.toFixed(1)} ms)`);
  expect(measured).toBeGreaterThan(MIN_FPS);
  expect(work.avg).toBeLessThan(8);

  await page.waitForFunction(() => (window as unknown as { __game: Debug }).__game.state.run.phase === 'boss', null, { timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/11-boss.png` });
  await debug(page, (g) => g.resetPerf());
  const bossFps = await fps(page);
  const bossWork = await debug(page, (g) => g.perf());
  console.log(`boss : ${bossFps.toFixed(1)} images/s, calcul ${bossWork.avg.toFixed(2)} ms par image (max ${bossWork.max.toFixed(1)} ms)`);
  expect(bossFps).toBeGreaterThan(MIN_FPS);
  expect(bossWork.avg).toBeLessThan(8);

  // Charge maximale : 300 particules entretenues pendant la mesure.
  await page.evaluate(() => {
    type Fx = { shards(v: { x: number; y: number }[], c: { x: number; y: number }, color: string, n: number, size: number): void };
    const fx = (window as unknown as { __game: { effects: Fx } }).__game.effects;
    const burst = () => fx.shards([{ x: -0.3, y: 0.6 }, { x: 0.3, y: 0.6 }, { x: 0, y: 0.2 }], { x: 0, y: 0.45 }, '#ff6bd6', 100, 1);
    burst();
    (window as unknown as { __burst: number }).__burst = window.setInterval(burst, 150);
  });
  await debug(page, (g) => g.resetPerf());
  const heavyFps = await fps(page, 2000);
  const heavy = await debug(page, (g) => g.perf());
  const particles = await debug(page, (g) => g.effects.particles.length);
  await page.evaluate(() => clearInterval((window as unknown as { __burst: number }).__burst));
  console.log(`300 particules (${particles}) : ${heavyFps.toFixed(1)} images/s, calcul ${heavy.avg.toFixed(2)} ms par image`);
  expect(particles).toBeLessThanOrEqual(300);
  expect(particles).toBeGreaterThan(250);
  expect(heavyFps).toBeGreaterThan(MIN_FPS);
  expect(heavy.avg).toBeLessThan(10);

  // Explosion du canon (ralenti), puis écran de défaite.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: Debug }).__game;
    const c = g.state.run.cannon;
    c.hp = 0.001;
    c.invulnerable = 0;
    (g.state.run.bullets as object[]).push({ x: c.x, y: 1.44, vx: 0, vy: 0, damage: 1, radius: 0.03 });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/12-explosion.png` });
  expect(await debug(page, (g) => g.state.run.phase)).toBe('dying');
  await page.waitForFunction(() => (window as unknown as { __game: Debug }).__game.screen() === 'gameOver', null, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Canon détruit !' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/13-defaite.png` });

  // Rejouer : nouvelle partie au niveau 1.
  await page.getByRole('button', { name: 'Rejouer' }).click();
  expect(await debug(page, (g) => [g.mode(), g.state.run.level, g.state.run.phase])).toEqual(['game', 1, 'waves']);
  await page.waitForTimeout(1500);

  // Seconde défaite → menu principal.
  await killCannon(page);
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByRole('heading', { name: 'Casseur de forme' })).toBeVisible();
  expect(await debug(page, (g) => g.mode())).toBe('menu');
  expect(errors).toEqual([]);
});

test('pause, reprise depuis le menu et sauvegarde', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?reset&autoplay');
  await page.getByRole('button', { name: /Jouer/ }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Reprendre' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/20-pause.png` });
  await page.getByRole('button', { name: 'Reprendre' }).click();
  expect(await debug(page, (g) => g.screen())).toBeNull();

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByRole('button', { name: /Continuer/ })).toBeVisible();

  // La partie est sauvegardée : elle se reprend après rechargement.
  await page.reload();
  await expect(page.getByRole('button', { name: /Continuer/ })).toBeVisible();
  await page.getByRole('button', { name: /Continuer/ }).click();
  expect(await debug(page, (g) => g.mode())).toBe('game');
  expect(errors).toEqual([]);
});

test('paramètres : langue anglaise puis française', async ({ page }) => {
  await page.goto('./?reset');
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/30-menu-en.png` });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('button', { name: /Jouer/ })).toBeVisible();
});

test('PWA : manifeste, service worker et politique de confidentialité', async ({ page, request }) => {
  const manifest = await (await request.get('./manifest.webmanifest')).json();
  expect(manifest.name).toBe('Casseur de forme');
  expect(manifest.orientation).toBe('portrait');
  expect((await request.get('./sw.js')).ok()).toBe(true);
  expect((await request.get('./icon-512.png')).ok()).toBe(true);
  const privacy = await request.get('./privacy.html');
  expect(await privacy.text()).toContain('Politique de confidentialité');
  await page.goto('./');
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  expect(registered).toBe(true);
});
