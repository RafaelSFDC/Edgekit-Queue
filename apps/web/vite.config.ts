import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/publish': 'http://127.0.0.1:8787',
      '/v1': 'http://127.0.0.1:8787',
      '/v2': 'http://127.0.0.1:8787',
      '/process': 'http://127.0.0.1:8787',
      '/stats': 'http://127.0.0.1:8787',
      '/messages': 'http://127.0.0.1:8787',
      '/dlq': 'http://127.0.0.1:8787',
      '/purge': 'http://127.0.0.1:8787',
      '/get': 'http://127.0.0.1:8787',
      '/set': 'http://127.0.0.1:8787',
      '/del': 'http://127.0.0.1:8787',
      '/kv': 'http://127.0.0.1:8787',
      '/pipeline': 'http://127.0.0.1:8787',
      '/api': 'http://127.0.0.1:8787',
      '/health': 'http://127.0.0.1:8787',
    },
  },
});
