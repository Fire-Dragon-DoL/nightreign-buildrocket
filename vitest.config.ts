import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    environment: 'node',
    // Parsing a real 19 MB save takes a moment on slow machines.
    testTimeout: 30_000,
  },
});
