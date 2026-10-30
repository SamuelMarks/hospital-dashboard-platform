import { defineConfig, devices } from "@playwright/test";

const frontendPort = process.env["E2E_FRONTEND_PORT"] ?? "4217";
const frontendUrl = `http://localhost:${frontendPort}`;

/**
 * Playwright Configuration.
 *
 * Defines the test environment, timeouts, and browser profiles.
 * We assume the frontend and backend are running locally.
 */
export default defineConfig({
  testDir: "./specs",
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env["CI"],
  /* Retry on CI only */
  retries: process.env["CI"] ? 2 : 0,
  /* Opt out of parallel tests on CI to ensure resource stability if using a shared DB file (DuckDB) */
  workers: 1,

  /* Reporter to use. */
  reporter: "list",

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: frontendUrl,

    /* Collect trace when retrying the failed test. */
    trace: "on-first-retry",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],

  /* Run local dev servers before starting the tests */
  webServer: [
    {
      command:
        "cd ../pulse-query-backend && uv run --active alembic upgrade head && uv run --active uvicorn --app-dir src app.main:app --port 8000",
      url: "http://127.0.0.1:8000/api/v1/openapi.json",
      reuseExistingServer: !process.env["CI"],
      timeout: 120000,
      env: {
        USE_SQLITE_ALEMBIC:
          process.env["USE_SQLITE_ALEMBIC"] ?? (process.env["CI"] ? "0" : "1"),
        DUCKDB_PATH: "e2e_test.duckdb",
        BACKEND_CORS_ORIGINS: `http://localhost:4200,http://127.0.0.1:4200,${frontendUrl},http://127.0.0.1:${frontendPort}`,
      },
    },
    {
      command: `cd ../pulse-query-ng-web && npm start -- --port ${frontendPort}`,
      url: frontendUrl,
      reuseExistingServer: !process.env["CI"],
      timeout: 120000,
      env: { NG_CLI_ANALYTICS: "false" },
    },
  ],
});
