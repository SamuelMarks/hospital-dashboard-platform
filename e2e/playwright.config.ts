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
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env["CI"],
  /* Retry on CI only */
  retries: process.env["CI"] ? 2 : 0,
  /* Opt out of parallel tests on CI to ensure resource stability if using a shared DB file (DuckDB) */
  workers: process.env["CI"] ? 1 : undefined,

  /* Reporter to use. */
  reporter: "html",

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
    // We can enable others (firefox, webkit) but chrome is sufficient for this scope
  ],
});
