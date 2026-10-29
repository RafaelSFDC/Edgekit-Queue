import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    alias: {
      'cloudflare:workers': new URL('./test/mocks/cloudflare-workers.ts', import.meta.url).pathname,
    },
  },
});
