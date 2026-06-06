import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: 'default',
    env: {
      LOG_LEVEL: 'error',
      LOG_FORMAT: 'json',
      NO_COLOR: '1',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**',
        'src/logger.ts',
        'src/prompts.ts',
        'src/types.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
  },
});
