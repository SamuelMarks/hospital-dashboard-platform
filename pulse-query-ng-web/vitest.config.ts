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
      provider: 'istanbul',
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/app/api-client/**',
        'src/test-mocks/**',
        'src/test-utils/**',
        'src/app/core/storage.utils.ts',
        'src/setup-storage.ts',
        'src/test-setup.ts',
        'src/main.ts',
        'src/server.ts',
        'src/main.server.ts',
        'src/app/app.config.ts',
        'src/app/app.routes.ts',
        'src/app/app.config.server.ts',
        'src/app/app.routes.server.ts',
        'src/app/shared/components/dialogs/keyboard-shortcuts-dialog.component.ts',
        'src/app/shared/components/onboarding/onboarding.service.ts',
        'src/app/core/undo/undo-redo.service.ts',
        'src/app/shared/components/undo-redo-buttons.component.ts',
        'src/app/shared/components/theme-toggle.component.ts',
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
