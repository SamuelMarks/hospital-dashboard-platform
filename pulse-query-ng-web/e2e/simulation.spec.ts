import { test, expect } from './fixtures';

test.describe('Simulation Engine', () => {
  test.beforeEach(async ({ loggedInPage }) => {
    // Navigate to Simulation page
    await loggedInPage.goto('/simulation');

    // Ensure the page is fully loaded by waiting for the header
    await expect(loggedInPage.locator('h1')).toContainText('What-If Simulation');
  });

  test('should run simulation and display results in table', async ({ loggedInPage }) => {
    test.setTimeout(60000);

    // 1. Verify "Run Optimization" button exists
    const runBtn = loggedInPage.getByRole('button', { name: 'Run Optimization' });
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toBeEnabled();

    // 2. Click "Run Optimization"
    await runBtn.click();

    // 3. Verify it gets disabled while running (Optimizing...)
    await expect(runBtn).toBeDisabled({ timeout: 5000 });

    // 4. Verify Results Table appears
    // The results table is wrapped in a mat-card with class results-panel
    const resultsPanel = loggedInPage.locator('.results-panel');
    await expect(resultsPanel).toBeVisible({ timeout: 20000 });

    // 5. Verify viz-table is loaded
    const table = resultsPanel.locator('viz-table');
    await expect(table).toBeVisible();

    // Check that table has rows
    const rows = table.locator('tr');
    await expect(rows.count()).then((c) => expect(c).toBeGreaterThan(0));
  });
});
