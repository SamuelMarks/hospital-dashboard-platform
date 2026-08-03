import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://localhost:4200",

    /* Collect trace when retrying the failed test. */
    trace: "on-first-retry",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run local dev servers before starting the tests */
  webServer: [
    {
      command: 'cd ../pulse-query-backend && uv run uvicorn app.main:app --port 8000',
      url: 'http://localhost:8000/api/v1/openapi.json',
      reuseExistingServer: !process.env["CI"],
      timeout: 120000,
      env: { USE_SQLITE_ALEMBIC: "1" }
    },
    {
      command: 'cd ../pulse-query-ng-web && npm start',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env["CI"],
      timeout: 120000,
      env: { NG_CLI_ANALYTICS: "false" }
    }
  ],
});
