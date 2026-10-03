import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    // The migration test tears the test database down and rebuilds it, so test
    // files must not run concurrently.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});