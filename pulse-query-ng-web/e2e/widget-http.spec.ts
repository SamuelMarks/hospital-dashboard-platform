import { test, expect } from './fixtures';

test.describe('Widget Wizard - HTTP Flow', () => {
  test.beforeEach(async ({ loggedInPage }) => {
    await loggedInPage.goto('/');
    await loggedInPage.getByTestId('btn-create').click();

    const input = loggedInPage.getByTestId('input-name');
    const dashName = `HTTP Test ${Date.now()}`;
    await input.pressSequentially(dashName, { delay: 50 });
    await input.blur();

    const submitBtn = loggedInPage.getByTestId('btn-submit');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(loggedInPage).toHaveURL(/\/dashboard\//);
    await expect(loggedInPage.locator('app-toolbar')).toBeVisible();
  });

  test('should create HTTP API widget successfully', async ({ loggedInPage }) => {
    // 1. Toggle "Edit Mode"
    await loggedInPage.getByTestId('toggle-edit-mode').click();

    // 2. Click "Add Widget"
    await loggedInPage.getByTestId('btn-add-widget').click();

    // 3. Switch to "Custom Query" Tab
    await loggedInPage.getByText('Custom Query').click();

    // 4. Select "HTTP API" Source Card
    const httpOption = loggedInPage.locator('.source-option').filter({ hasText: 'HTTP API' });
    await expect(httpOption).toBeVisible();
    await httpOption.click();

    // 5. Click "Next: Configure"
    const nextBtn = loggedInPage.getByRole('button', { name: 'Next: Configure' });
    await nextBtn.click();

    // 6. Verify transition to Step 2
    const editor = loggedInPage.locator('app-widget-builder app-http-config');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // 7. Config HTTP
    // Fill the URL
    await loggedInPage
      .getByLabel('URL Endpoint')
      .fill('https://jsonplaceholder.typicode.com/todos/1');

    // Save and Test
    await loggedInPage.getByRole('button', { name: 'Save & Test' }).click();

    // Wait for the result preview
    await expect(loggedInPage.locator('.json-code')).toContainText('userId', { timeout: 15000 });

    // 8. Go to Visualization Step
    await loggedInPage.getByRole('button', { name: 'Next: Visualize' }).click();

    // 9. Select Visualization (Metric Card)
    // Wait for visualizer tab to load
    const metricCardOption = loggedInPage.locator('.viz-option').filter({ hasText: 'Metric Card' });
    await expect(metricCardOption).toBeVisible();
    await metricCardOption.click();

    // 10. Save Widget
    await loggedInPage.getByRole('button', { name: 'Save Widget' }).click();

    // 11. Final Verification
    await expect(loggedInPage.locator('app-widget-builder')).not.toBeVisible();

    const widget = loggedInPage.locator('app-widget');
    await expect(widget).toBeVisible();
    // In Metric Card, it shows the first available string/number value, we just check if it's there.
    // Or we check the widget container
  });
});
