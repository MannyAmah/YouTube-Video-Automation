import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['../../tools/load-env.ts'],
    testTimeout: 60_000,
    pool: 'forks',
  },
});
