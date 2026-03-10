import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        'src/config/index.ts': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'src/utils/date.ts': { statements: 95, branches: 70, functions: 95, lines: 95 },
        'src/utils/format.ts': { statements: 95, branches: 95, functions: 95, lines: 95 },
        'src/services/scoring.ts': { statements: 95, branches: 95, functions: 95, lines: 95 },
        'src/middleware/error-handler.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        'src/middleware/request-id.ts': { statements: 95, branches: 95, functions: 95, lines: 95 },
        'src/middleware/auth.ts': { statements: 90, branches: 85, functions: 95, lines: 90 },
      },
    },
  },
});
