import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built site works from any folder (static hosting, game portals).
  base: './',
  build: {
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
