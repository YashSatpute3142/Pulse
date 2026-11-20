import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/helpers/globalSetup.js'],
    setupFiles: ['./tests/helpers/setupEnv.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // One real MongoDB, separate database per test file. Files run in parallel safely.
    fileParallelism: true,
  },
});
