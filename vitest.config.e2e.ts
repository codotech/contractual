import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    // Run serially — each test creates temp dirs, parallel risks port/path conflicts
    fileParallelism: false,
    globals: true,
    server: {
      deps: {
        inline: ['yaml'],
      },
    },
  },
});
