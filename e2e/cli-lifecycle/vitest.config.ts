import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    globals: true,
  },
});
