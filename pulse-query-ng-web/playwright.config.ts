import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration.
 *
 * Defines the test environment, timeouts, and browser profiles.
 *
 * UPDATE:
 * 1. Orchestrates BOTH the Angular Frontend and Python Backend.
 * 2. Uses `uv run --active` to ensure the Backend picks up the active virtual environment
 *    from the shell (preventing ModuleNotFoundError for 'any_llm').
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],
  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,
  /* Opt out of parallel tests on CI to ensure resource stability */
  workers: process.env['CI'] ? 1 : undefined,

  /* Reporter to use. */
  reporter: 'html',

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4200',

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Semantic selector for data-testid attributes */
    testIdAttribute: 'data-testid',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * WebServer Configuration.
   * Ensures dependencies are running before tests start.
   *
   * 1. Backend (FastAPI): Port 8000.
   * 2. Frontend (Angular): Port 4200.
   */
  webServer: [
    {
      /*
       * Start Backend from sibling directory.
       * --active is CRITICAL: It forces uv to respect the VIRTUAL_ENV environment variable
       * set in the user's shell, ensuring it finds installed packages like 'any_llm'.
       */
      command: 'cd ../backend && uv run --active uvicorn --app-dir src app.main:app --port 8000',
      url: 'http://127.0.0.1:8000/api/v1/openapi.json', // Healthcheck endpoint to wait for
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120 * 1000,
    },
    {
      /* Start Frontend */
      command: 'npm start',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 120 * 1000,
    },
  ],
});
