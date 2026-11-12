import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  // Relative paths so the built site works from any folder (static hosting, game portals).
  base: './',
  // Lets the physics engine's WebAssembly be loaded as its own file instead of
  // being embedded in the JavaScript as text.
  plugins: [wasm()],
  test: {
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
