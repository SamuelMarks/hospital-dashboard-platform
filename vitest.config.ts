import { defineConfig } from "vitest/config";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "pulse-query-ng-web",
  resolve: {
    alias: [
      {
        find: /^@material\/material-color-utilities$/,
        replacement: resolve(
          __dirname,
          "pulse-query-ng-web/node_modules/@material/material-color-utilities/index.js",
        ),
      },
      {
        find: /^typescript$/,
        replacement: resolve(
          __dirname,
          "pulse-query-ng-web/node_modules/typescript/lib/typescript.js",
        ),
      },
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/app/api-client/**",
        "src/setup-storage.ts",
        "src/test-setup.ts",
        "src/test-utils/**",
        "src/main.server.ts",
        "src/app/app.config.server.ts",
        "src/app/app.routes.server.ts",
        "**/*.d.ts",
      ],
      reporter: ["text", "html"],
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
