import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import wasm from 'vite-plugin-wasm';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Relative paths so the built site works from any folder (static hosting, game portals).
  base: './',
  // The version shown on the menu is the one in package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Lets the physics engine's WebAssembly be loaded as its own file instead of
  // being embedded in the JavaScript as text.
  plugins: [wasm()],
  test: {
    // Many tests run whole levels of physics. On a slower or busy machine the default 5 s is
    // too tight for some of them; a real hang still fails, just later.
    testTimeout: 60000,
    // The physics package ships as ES modules with a .wasm import: run it through
    // the same build pipeline in tests instead of loading it with plain Node.
    server: { deps: { inline: [/@dimforge/] } },
  },
  resolve: {
    // The package has no "main" or "exports" entry, which Node-side resolution needs.
    alias: { '@dimforge/rapier3d': '@dimforge/rapier3d/rapier.js' },
  },
  build: {
    // The WebAssembly is awaited at module level, which needs a modern target.
    target: 'esnext',
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        // The physics engine and the renderer change rarely: keep them in their own files so
        // an update to the game does not make players download them again.
        manualChunks(id) {
          if (id.includes('@dimforge')) return 'physics';
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
