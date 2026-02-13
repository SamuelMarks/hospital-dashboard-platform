import { test, expect } from './fixtures';

test.describe('Widget Wizard - Template Flow', () => {
  // Setup: Create a fresh dashboard
  test.beforeEach(async ({ loggedInPage }) => {
    await loggedInPage.goto('/');
    await loggedInPage.getByTestId('btn-create').click();

    // FIX: Use pressSequentially for robust form value binding in Angular.
    // .fill() sometimes sets the value too quickly for Validators to trigger 'valid' status before we check the button.
    const input = loggedInPage.getByTestId('input-name');
    const dashName = `Template Test ${Date.now()}`;
    await input.pressSequentially(dashName, { delay: 50 });
    await input.blur();

    const btnSubmit = loggedInPage.getByTestId('btn-submit');
    await expect(btnSubmit).toBeEnabled();
    await btnSubmit.click();

    await expect(loggedInPage).toHaveURL(/\/dashboard\//);
    // Wait for the layout to fully hydrate before interacting with toolbar
    await expect(loggedInPage.locator('app-toolbar')).toBeVisible();

    // FIX: Wait for any dialogs (created dashboard success or previous) to be fully gone
    // This prevents backdrop interception
    await expect(loggedInPage.locator('mat-dialog-container')).not.toBeVisible();
  });

  test('should provision a widget from a marketplace template', async ({ loggedInPage }) => {
    // 1. Enter Edit Mode
    // Use the robust testid selector
    await loggedInPage.getByTestId('toggle-edit-mode').click();

    // 2. Open Widget Builder
    await loggedInPage.getByTestId('btn-add-widget').click();

    // 3. Select First Template
    // Wait for grid to load (spinner disappears)
    await expect(loggedInPage.locator('mat-spinner')).not.toBeVisible();

    // Ensure animation of dialog entry is complete
    await expect(loggedInPage.locator('app-widget-builder')).toBeVisible();

    // FIX: Scope locator to the Wizard Dialog to avoid finding cards in the background Sidebar (which have cdk-drag)
    const firstTemplate = loggedInPage.locator('app-widget-builder .template-card').first();
    await expect(firstTemplate).toBeVisible();

    // Capture title to verify later
    const templateTitle = await firstTemplate.locator('.font-medium').innerText();

    // FIX: Use force click to bypass any transient overlay issues during animation
    await firstTemplate.click({ force: true });
    // Explicitly wait for selection state to register visually
    await expect(firstTemplate).toHaveClass(/selected/, { timeout: 5000 });

    // 4. Navigate to Configuration
    // FIX: Wait for button enabling state specifically to avoid flaky clicks
    const nextBtn = loggedInPage.getByRole('button', { name: 'Next: Configure' });
    await expect(nextBtn).toBeEnabled({ timeout: 5000 });
    await nextBtn.click({ force: true });

    // 5. Verify Dynamic Form
    const dynamicForm = loggedInPage.locator('app-dynamic-form');
    await expect(dynamicForm).toBeVisible();

    // 6. Fill Inputs
    // We target any input inside the dynamic form.
    const inputs = dynamicForm.locator('input');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      // Only fill if empty and visible
      if ((await input.isVisible()) && (await input.inputValue()) === '') {
        const type = await input.getAttribute('type');
        if (type === 'number') {
          await input.fill('10');
        } else {
          await input.fill('Test Value');
        }
      }
    }

    // 7. Run & Preview
    const runBtn = loggedInPage.getByRole('button', { name: 'Run & Preview' });
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // 8. Verify Preview Loads
    // The wizard executes the query and renders the widget preview inside the sidebar or main area
    // 'app-widget' is instantiated in the preview div inside the Wizrd
    // We target app-widget inside widget-builder to be sure
    const previewWidget = loggedInPage.locator('app-widget-builder app-widget');
    await expect(previewWidget).toBeVisible({ timeout: 20000 });

    // 9. Finalize
    const saveBtn = loggedInPage
      .getByRole('button', { name: 'Add Widget' })
      .or(loggedInPage.getByRole('button', { name: 'Save Widget' }));
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // 11. Verify Result on Dashboard
    await expect(loggedInPage.locator('app-widget-builder')).not.toBeVisible();

    // Explicitly check inside the dashboard grid to ensure we found the NEW widget, not a lingering element
    const dashboardWidget = loggedInPage.locator('app-dashboard-layout .dashboard-grid app-widget');
    await expect(dashboardWidget).toBeVisible();
    await expect(dashboardWidget).toContainText(templateTitle);
  });
});
