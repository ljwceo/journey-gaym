import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Keep the standalone PerfTest reachable at /journey-gaym/experiments/perftest/
// after the Pages deploy switched to GitHub Actions (only dist/ is published).
function copyPerfTest(): Plugin {
  return {
    name: 'copy-perftest',
    apply: 'build',
    closeBundle() {
      const root = import.meta.dirname;
      // The PerfTest reads ../../docs/art-style/tokens.{css,json}, so ship those too.
      const paths = [
        'experiments/perftest',
        'docs/art-style/tokens.css',
        'docs/art-style/tokens.json',
      ];
      for (const path of paths) {
        const from = resolve(root, path);
        if (existsSync(from)) {
          cpSync(from, resolve(root, 'dist', path), { recursive: true });
        }
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the project at https://ljwceo.github.io/journey-gaym/
  base: '/journey-gaym/',
  build: {
    target: 'es2022',
    sourcemap: true,
    // Three.js alone is ~530 kB minified; code splitting comes when the game grows.
    chunkSizeWarningLimit: 800,
  },
  plugins: [copyPerfTest()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
