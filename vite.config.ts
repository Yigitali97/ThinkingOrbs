import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5318 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        watching: resolve(__dirname, 'watching.html'),
        bubble: resolve(__dirname, 'bubble.html'),
        voice: resolve(__dirname, 'voice.html'),
        ask: resolve(__dirname, 'ask.html'),
      },
    },
  },
});
