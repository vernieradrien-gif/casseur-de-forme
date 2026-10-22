import { defineConfig } from 'vitest/config';

// BASE_PATH est fourni par le workflow GitHub Pages (« /<nom-du-dépôt>/ »).
// En local et pour Android (Capacitor), un chemin relatif fonctionne partout.
const sim = process.env.npm_lifecycle_event === 'sim' || !!process.env.SIM;

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { target: 'es2022' },
  test: {
    // `npm run sim` lance la simulation d'équilibrage (exclue des tests normaux).
    include: sim ? ['tests/**/*.sim.ts'] : ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
