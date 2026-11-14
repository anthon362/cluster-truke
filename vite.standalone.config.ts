import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * The stand-alone build: the whole game in one HTML file that runs when it is
 * opened straight from disk (double-click), on Windows and macOS, with no
 * server and no install. Run: npm run standalone
 */
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      '@dimforge/rapier3d': fileURLToPath(
        new URL('./src/physics/rapierEmbedded.ts', import.meta.url),
      ),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'release/standalone',
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
  },
});
