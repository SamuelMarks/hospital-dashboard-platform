import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@material\/material-color-utilities(\/.*)?$/,
        replacement: resolve(__dirname, 'src/test-mocks/material-color-utilities.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    exclude: ['e2e/**', 'playwright-report/**', 'test-results/**'],
    pool: 'forks',
    fileParallelism: false,
    coverage: {
      enabled: true,
      provider: 'v8',
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/app/api-client/**',
        'src/test-mocks/**',
        'src/test-utils/**',
      ],
      reporter: ['text', 'html'],
      reportOnFailure: true,
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
        perFile: true,
      },
    },
  },
});
