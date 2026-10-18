import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so a production build can be served from any sub-path.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 6030,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
});
