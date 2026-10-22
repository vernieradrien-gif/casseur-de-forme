import { defineConfig } from 'vitest/config';

// BASE_PATH est fourni par le workflow GitHub Pages (« /<nom-du-dépôt>/ »).
// En local, un chemin relatif fonctionne partout.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
