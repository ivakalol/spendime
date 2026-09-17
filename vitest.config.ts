import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
