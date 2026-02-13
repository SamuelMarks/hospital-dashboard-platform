import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

/**
 * Helper function to run AXE analysis on a page.
 * Checks for WCAG 2.0/2.1 Level A and AA violations.
 */
async function checkA11y(page: any, contextName: string) {
  // Wait for animations/stable state before scanning
  await page.waitForLoadState('domcontentloaded');

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Exclude CodeMirror which has known contrast issues in some themes that are out of our control
    // and mat-select-panel which might be hidden/floating
    .exclude('.cm-editor')
    .analyze();

  if (accessibilityScanResults.violations.length > 0) {
    console.error(`\n[${contextName}] Accessibility Violations:`);
    accessibilityScanResults.violations.forEach((violation: any) => {
      console.error(`- [${violation.id}] ${violation.help}`);
      console.error(`  Impact: ${violation.impact}`);
      console.error(`  Nodes: ${violation.nodes.length}`);
    });
  }

  expect(accessibilityScanResults.violations).toEqual([]);
}

test.describe('Accessibility Standards (WCAG AA)', () => {
  // 1. PUBLIC ROUTES
  test('Login Page should be accessible', async ({ page }) => {
    await page.goto('/login');
    // Wait for animations/loading to settle. Increased timeout for CI stability.
    await expect(page.locator('mat-card-title')).toBeVisible({ timeout: 15000 });
    await checkA11y(page, 'Login Page');
  });

  // 2. PROTECTED ROUTES
  test('Protected Views should be accessible', async ({ loggedInPage }) => {
    // FIX: Increase timeout significantly because AXE analysis is slow and we perform multiple scans + navigations in one test
    test.setTimeout(90000);

    // A. Home / Dashboard List
    await test.step('Home Page', async () => {
      await loggedInPage.goto('/');

      // FIX: Increase specific timeout and use a more structural locator
      // The header text "My Dashboards" is rendered immediately but might wait for hydration
      // Using 30s timeout to allow for cold start of the Angular application
      await expect(loggedInPage.locator('app-home')).toBeVisible({ timeout: 30000 });
      await expect(loggedInPage.getByText('My Dashboards')).toBeVisible({ timeout: 15000 });

      await checkA11y(loggedInPage, 'Home Page');
    });

    // B. Simulation Engine
    await test.step('Simulation Page', async () => {
      await loggedInPage.goto('/simulation');
      // Ensure the interactive element is ready
      await expect(loggedInPage.getByRole('button', { name: 'Start Simulation' })).toBeVisible({
        timeout: 15000,
      });
      await checkA11y(loggedInPage, 'Simulation Page');
    });

    // C. Dashboard Detail View
    // We create a dashboard dynamically to ensure we have a valid ID to test
    await test.step('Dashboard Detail View', async () => {
      await loggedInPage.goto('/');

      // Verify Home is ready before clicking (prevents hydration race condition)
      await expect(loggedInPage.locator('app-home')).toBeVisible();

      // NEW FIX: Wait for the main loading spinner to disappear.
      // Scoped to 'app-home' to resolve ambiguity with 'AskData' global spinner.
      await expect(loggedInPage.locator('app-home').getByTestId('loading-state')).not.toBeVisible();

      // FIX: Ensure the button is actually visible and interactive before clicking
      const createBtn = loggedInPage.getByTestId('btn-create');
      await expect(createBtn).toBeVisible({ timeout: 15000 });

      // Removed force: true to ensure standard event dispatch.
      // This ensures the element is not only visible but also hydrated and ready to receive events.
      await createBtn.click();

      // FIX: Explicitly wait for the Dialog to appear before filling
      // This ensures the input locator is attached and robustly actionable.
      // Increased timeout to 20s to account for animation sluggishness on CI.
      await expect(loggedInPage.getByRole('heading', { name: 'Create New Dashboard' })).toBeVisible(
        { timeout: 20000 },
      );

      await loggedInPage.getByTestId('input-name').fill(`A11y Test ${Date.now()}`);
      await loggedInPage.getByTestId('btn-submit').click();

      // Wait for navigation
      await expect(loggedInPage).toHaveURL(/\/dashboard\//, { timeout: 15000 });
      // Wait for layout to settle (Toolbar, Grid, or Empty State)
      await expect(loggedInPage.locator('app-toolbar')).toBeVisible({ timeout: 15000 });

      await checkA11y(loggedInPage, 'Dashboard Detail');
    });
  });
});
