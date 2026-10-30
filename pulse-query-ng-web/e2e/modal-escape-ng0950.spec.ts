/**
 * @fileoverview E2E Regression Test Suite in `pulse-query-ng-web/e2e` for `Application Error: NG0950`
 * and modal Escape key handling across the Default Dashboard ("Hospital Command Center") and dialogs.
 */

import { Page } from '@playwright/test';
import { test, expect } from './fixtures';

/**
 * Attaches listeners to capture any `NG0950` or `Application Error:` logs on `page`.
 *
 * @param page - Playwright Page instance to monitor.
 * @returns Array accumulating any matching error messages.
 */
function monitorNg0950(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('NG0950') || text.includes('Application Error:')) {
        errors.push(text);
      }
    }
  });
  page.on('pageerror', (err) => {
    if (err.message.includes('NG0950') || err.message.includes('Application Error:')) {
      errors.push(err.message);
    }
  });
  return errors;
}

test.describe('Default Dashboard & Modal Escape Regression (NG0950)', () => {
  test('should open default dashboard, interact with filter ribbon & modals, and escape without NG0950', async ({
    loggedInPage,
  }) => {
    const errors = monitorNg0950(loggedInPage);
    const footer = loggedInPage.getByTestId('app-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(/Built on .* UTC/i);
    await expect(footer).toContainText('Copyright © 2026 Samuel Marks');
    await expect(loggedInPage.getByTestId('footer-github-link')).toHaveAttribute(
      'href',
      'https://github.com/SamuelMarks/hospital-dashboard-platform',
    );
    const homeViewport = loggedInPage.viewportSize();
    const homeFooterBox = await footer.boundingBox();
    expect(homeFooterBox).not.toBeNull();
    if (homeFooterBox && homeViewport) {
      expect(homeFooterBox.height).toBeGreaterThan(15);
      expect(homeFooterBox.y + homeFooterBox.height).toBeLessThanOrEqual(homeViewport.height + 1);
    }

    // 1. Open Create New Dashboard Dialog and escape
    await loggedInPage.getByTestId('btn-create').click();
    const createDialog = loggedInPage.locator('mat-dialog-container');
    await expect(createDialog).toBeVisible();
    await loggedInPage.getByTestId('input-name').focus();
    await loggedInPage.keyboard.press('Escape');
    await expect(createDialog).toBeHidden();
    expect(errors).toEqual([]);

    // 2. Navigate to Default Dashboard ("Hospital Command Center") or restore it
    const defaultCard = loggedInPage
      .locator('.dash-card')
      .filter({ hasText: 'Hospital Command Center' })
      .first();
    if ((await defaultCard.count()) > 0) {
      await defaultCard.click();
    } else {
      await loggedInPage
        .getByRole('button', {
          name: /Recreate the standard Hospital Command Center dashboard|Restore Defaults/i,
        })
        .click();
    }

    await expect(loggedInPage).toHaveURL(/\/dashboard\/.+/, { timeout: 15000 });
    await expect(loggedInPage.locator('app-filter-ribbon')).toBeVisible();
    expect(errors).toEqual([]);

    // 3. Interact with FilterRibbonComponent (Department select + Date range picker) and escape
    const deptSelect = loggedInPage.locator('app-filter-ribbon mat-select');
    await deptSelect.click();
    await loggedInPage.keyboard.press('Escape');

    const dateToggle = loggedInPage.locator('app-filter-ribbon mat-datepicker-toggle button');
    await dateToggle.click();
    await loggedInPage.keyboard.press('Escape');
    expect(errors).toEqual([]);

    // 4. Click Focus Widget (Maximize) on default dashboard and press Escape
    const focusBtn = loggedInPage.getByTestId('focus-widget-btn').first();
    await expect(focusBtn).toBeVisible({ timeout: 10000 });
    const dashFooterBox = await footer.boundingBox();
    expect(dashFooterBox).not.toBeNull();
    if (dashFooterBox && homeViewport) {
      expect(dashFooterBox.height).toBeGreaterThan(15);
      expect(dashFooterBox.y + dashFooterBox.height).toBeLessThanOrEqual(homeViewport.height + 1);
    }
    await focusBtn.click();
    const focusedModal = loggedInPage.getByTestId('focused-widget-modal');
    await expect(focusedModal).toBeVisible();
    await loggedInPage.keyboard.press('Escape');
    await expect(focusedModal).toBeHidden();

    // 5. Open Share Dashboard Dialog and Theme Picker Dialog and press Escape
    await loggedInPage.getByTestId('btn-share-dashboard').click();
    const shareEmailInput = loggedInPage.getByTestId('input-share-email');
    await expect(shareEmailInput).toBeVisible();
    await shareEmailInput.focus();
    await loggedInPage.keyboard.press('Escape');
    await expect(shareEmailInput).toBeHidden();

    await loggedInPage.getByTestId('btn-theme-menu').click();
    await loggedInPage.getByTestId('btn-open-theme-dialog').click();
    const hexInput = loggedInPage.locator('app-theme-color-picker-dialog input[matInput]');
    await expect(hexInput).toBeVisible();
    await hexInput.focus();
    await loggedInPage.keyboard.press('Escape');
    await expect(hexInput).toBeHidden();

    // 5b. Open Ask AI Sidenav Drawer and press Escape to close
    await loggedInPage.getByTestId('btn-ask').click();
    const sidebar = loggedInPage.getByTestId('sidebar');
    await expect(sidebar).toHaveClass(/mat-drawer-opened/);
    await loggedInPage.keyboard.press('Escape');
    await expect(sidebar).not.toHaveClass(/mat-drawer-opened/);

    // 6. Enter Edit Mode, maximize widget, open nested Edit dialog, and escape layer-by-layer
    await loggedInPage.getByTestId('toggle-edit-mode').click();
    await focusBtn.click();
    await expect(focusedModal).toBeVisible();
    await focusedModal.getByTestId('btn-edit').click({ force: true });
    const editDialog = loggedInPage.locator('mat-dialog-container');
    await expect(editDialog).toBeVisible();

    await loggedInPage.keyboard.press('Escape');
    await expect(editDialog).toBeHidden();
    await expect(focusedModal).toBeVisible();

    await loggedInPage.keyboard.press('Escape');
    await expect(focusedModal).toBeHidden();

    const criticalSnackbar = loggedInPage.locator('.snackbar-critical', {
      hasText: /Application Error|NG0950/i,
    });
    await expect(criticalSnackbar).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
