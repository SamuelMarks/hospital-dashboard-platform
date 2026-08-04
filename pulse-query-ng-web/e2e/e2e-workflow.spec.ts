import { test, expect } from './fixtures';

test.describe('End-to-End Workflow', () => {
  test('Complete user journey from login to creating a dashboard and adding a widget', async ({
    loggedInPage,
  }) => {
    // Navigate to home (already logged in)
    await loggedInPage.goto('/');

    // Create a new dashboard
    await loggedInPage.getByTestId('btn-create').click();
    const dashName = `E2E Workflow Dashboard ${Date.now()}`;
    await loggedInPage.getByTestId('input-name').pressSequentially(dashName, { delay: 50 });
    await loggedInPage.getByTestId('input-name').blur();
    const btnSubmit = loggedInPage.getByTestId('btn-submit');
    await expect(btnSubmit).toBeEnabled();
    await btnSubmit.click();

    // Wait for dashboard to load
    await expect(loggedInPage).toHaveURL(/\/dashboard\//);
    await expect(loggedInPage.locator('app-toolbar')).toBeVisible();

    // Enable Edit Mode
    await loggedInPage.getByTestId('toggle-edit-mode').click();

    // Add a widget using template
    await loggedInPage.getByTestId('btn-add-widget').click();

    // Switch to Custom Query -> Static Markdown to test TEXT widget quickly
    await loggedInPage.getByText('Custom Query').click();
    await loggedInPage.locator('.source-option').filter({ hasText: 'Static Markdown' }).click();
    await loggedInPage.getByRole('button', { name: 'Next: Configure' }).click();

    // Fill Content
    const editor = loggedInPage.locator('app-widget-builder app-text-editor');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await loggedInPage.getByLabel('Markdown Content').fill('# E2E Workflow\nTest');
    await loggedInPage.getByRole('button', { name: 'Save Content' }).click();

    // Finish
    await loggedInPage.getByRole('button', { name: 'Save & Finish' }).click();

    // Verify widget exists
    await expect(loggedInPage.locator('app-widget-builder')).not.toBeVisible();
    await expect(loggedInPage.locator('app-widget')).toHaveCount(1);
    await expect(loggedInPage.locator('app-widget')).toContainText('E2E Workflow');

    // Navigation (Optional)
    // Assuming there is no simulation page anymore since we don't see it in tests, or we can just leave it out.
  });
});
