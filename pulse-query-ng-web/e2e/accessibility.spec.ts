/**
 * @fileoverview Automated WCAG 2.0/2.1 Level A and AA accessibility verification suite
 * powered by Playwright and `@axe-core/playwright`.
 */

import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

/**
 * Runs an AXE accessibility scan against the active Playwright page and asserts zero WCAG AA violations.
 *
 * @param page - Playwright page instance under test.
 * @param contextName - Descriptive label for the view or modal being audited.
 */
async function checkA11y(page: Page, contextName: string): Promise<void> {
  // Wait for animations/stable state before scanning
  await page.waitForLoadState('domcontentloaded');

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (accessibilityScanResults.violations.length > 0) {
    console.error(`
[${contextName}] Accessibility Violations:`);
    accessibilityScanResults.violations.forEach((violation) => {
      console.error(`- [${violation.id}] ${violation.help}`);
      console.error(`  Impact: ${String(violation.impact)}`);
      console.error(`  Nodes: ${String(violation.nodes.length)}`);
    });
  }

  expect(accessibilityScanResults.violations).toEqual([]);
}

test.describe('Accessibility Standards (WCAG AA)', () => {
  // 1. PUBLIC ROUTES
  test('Login Page should be accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('mat-card-title')).toBeVisible({ timeout: 15000 });
    await checkA11y(page, 'Login Page');
  });

  test('Register Page should be accessible', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('mat-card-title')).toBeVisible({ timeout: 15000 });
    await checkA11y(page, 'Register Page');
  });

  // 2. PROTECTED ROUTES
  test('Protected Views should be accessible', async ({ loggedInPage }) => {
    test.setTimeout(120000);

    // A. Home / Dashboard List (Light & Dark Mode + Onboarding Overlay)
    await test.step('Home Page', async () => {
      await loggedInPage.goto('/');

      await expect(loggedInPage.locator('app-home')).toBeVisible({ timeout: 30000 });
      await expect(loggedInPage.getByText('My Dashboards')).toBeVisible({ timeout: 15000 });

      await checkA11y(loggedInPage, 'Home Page (Light Mode)');

      // Toggle Dark Mode and re-verify
      const themeToggle = loggedInPage.getByTestId('theme-toggle');
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        await checkA11y(loggedInPage, 'Home Page (Dark Mode)');
        await themeToggle.click();
      }
    });

    // B. Analytics & Alert Rules Views
    await test.step('Analytics & Alert Rules Pages', async () => {
      await loggedInPage.goto('/analytics');
      await expect(loggedInPage.locator('app-analytics')).toBeVisible({ timeout: 15000 });
      await checkA11y(loggedInPage, 'Analytics Page');

      await loggedInPage.goto('/analytics/alert-rules');
      await expect(loggedInPage.locator('app-alert-rules')).toBeVisible({ timeout: 15000 });
      await checkA11y(loggedInPage, 'Alert Rules Page');
    });

    // C. Benchmarks, MPAX Arena & Chat Views
    await test.step('Benchmarks, MPAX Arena & Chat Pages', async () => {
      await loggedInPage.goto('/benchmarks');
      await expect(loggedInPage.locator('app-benchmarks')).toBeVisible({ timeout: 15000 });
      await checkA11y(loggedInPage, 'Benchmarks Page');

      await loggedInPage.goto('/mpax-arena');
      await expect(loggedInPage.locator('app-mpax-arena')).toBeVisible({ timeout: 15000 });
      await checkA11y(loggedInPage, 'MPAX Arena Page');

      await loggedInPage.goto('/chat');
      await expect(loggedInPage.locator('app-chat-layout')).toBeVisible({ timeout: 15000 });
      await checkA11y(loggedInPage, 'Chat Page');
    });

    // D. Admin & User Management Views
    await test.step('Admin & User Management Pages', async () => {
      await loggedInPage.goto('/admin');
      await checkA11y(loggedInPage, 'Admin Page');

      const diagBtn = loggedInPage.getByRole('button', { name: 'Open Diagnostics' });
      if (await diagBtn.isVisible()) {
        await diagBtn.click();
        await expect(loggedInPage.locator('app-system-diagnostics-dialog')).toBeVisible({
          timeout: 10000,
        });
        await checkA11y(loggedInPage, 'System Diagnostics Dialog');
        await loggedInPage.keyboard.press('Escape');
      }

      await loggedInPage.goto('/admin/users');
      await checkA11y(loggedInPage, 'User Management Page');
    });

    // E. Simulation Engine
    await test.step('Simulation Page', async () => {
      await loggedInPage.goto('/simulation');
      await expect(loggedInPage.getByRole('button', { name: 'Run Optimization' })).toBeVisible({
        timeout: 15000,
      });
      await checkA11y(loggedInPage, 'Simulation Page');
    });

    // F. Dashboard Detail View & Modals (Share, Theme Picker, Query Cart, Template Wizard)
    await test.step('Dashboard Detail View & Dialogs', async () => {
      await loggedInPage.goto('/');

      await expect(loggedInPage.locator('app-home')).toBeVisible();
      await expect(loggedInPage.locator('app-home').getByTestId('loading-state')).not.toBeVisible();

      const createBtn = loggedInPage.getByTestId('btn-create');
      await expect(createBtn).toBeVisible({ timeout: 15000 });
      await createBtn.click();

      await expect(loggedInPage.getByRole('heading', { name: 'Create New Dashboard' })).toBeVisible(
        { timeout: 20000 },
      );

      const inputName = loggedInPage.getByTestId('input-name');
      await inputName.click();
      await inputName.clear();
      await inputName.pressSequentially(`A11y Test ${Date.now()}`, { delay: 10 });
      await loggedInPage.getByTestId('btn-submit').click();

      await expect(loggedInPage).toHaveURL(/\/dashboard\//, { timeout: 15000 });
      await expect(loggedInPage.locator('app-toolbar')).toBeVisible({ timeout: 15000 });
      await checkA11y(loggedInPage, 'Dashboard Detail View');

      // Share Dashboard Dialog
      const shareBtn = loggedInPage.getByTestId('btn-share-dashboard');
      if (await shareBtn.isVisible()) {
        await shareBtn.click();
        await expect(loggedInPage.locator('app-share-dashboard-dialog')).toBeVisible({
          timeout: 10000,
        });
        await checkA11y(loggedInPage, 'Share Dashboard Dialog');
        await loggedInPage.keyboard.press('Escape');
      }

      // Theme Color Picker Dialog
      const themeMenuBtn = loggedInPage.getByTestId('btn-theme-menu');
      if (await themeMenuBtn.isVisible()) {
        await themeMenuBtn.click();
        const openThemeDialogBtn = loggedInPage.getByTestId('btn-open-theme-dialog');
        if (await openThemeDialogBtn.isVisible()) {
          await openThemeDialogBtn.click();
          await expect(loggedInPage.locator('app-theme-color-picker-dialog')).toBeVisible({
            timeout: 10000,
          });
          await checkA11y(loggedInPage, 'Theme Color Picker Dialog');
          await loggedInPage.keyboard.press('Escape');
        }
      }
    });

    // G. Editor View (Query Cart, Widget Builder, Template Marketplace)
    await test.step('Editor View', async () => {
      // 1. Turn on Edit Mode (reveals QueryCartComponent & WidgetGalleryComponent)
      await loggedInPage.getByTestId('toggle-edit-mode').click();
      await checkA11y(loggedInPage, 'Dashboard Edit Mode & Query Cart');

      // 2. Click "Add Widget"
      await loggedInPage.getByTestId('btn-add-widget').click();
      await checkA11y(loggedInPage, 'Widget Builder Template Marketplace');

      // 3. Switch to "Custom Query" Tab
      await loggedInPage.getByText('Custom Query').click();

      // 4. Select "SQL Database" Source Card
      const sqlOption = loggedInPage.locator('.source-option').filter({ hasText: 'SQL Database' });
      await expect(sqlOption).toBeVisible();
      await sqlOption.click();

      // 5. Click "Next: Configure"
      const nextBtn = loggedInPage.getByRole('button', { name: 'Next: Configure' });
      await nextBtn.click();

      // 6. Verify transition to Step 2 (Editor View)
      const editor = loggedInPage.locator('app-widget-builder app-sql-builder');
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Wait for CodeMirror to be visible
      await expect(loggedInPage.locator('.cm-editor')).toBeVisible({ timeout: 15000 });

      // Check accessibility
      await checkA11y(loggedInPage, 'Editor View');
    });
  });
});
