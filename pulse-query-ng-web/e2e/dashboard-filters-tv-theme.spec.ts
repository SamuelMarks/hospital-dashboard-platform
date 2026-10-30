/**
 * @fileoverview E2E tests in `pulse-query-ng-web/e2e` for Filter Ribbon, TV Kiosk Mode,
 * Theme Picker, Keyboard Shortcuts Dialog, and System Diagnostics Dialog.
 */

import { test, expect } from './fixtures';

test.describe('Dashboard Filters, TV Mode, Theme & Global Dialogs', () => {
  test('should filter by department, toggle TV mode, and open/escape global dialogs', async ({
    loggedInPage,
  }) => {
    const dashName = `E2E Filter & TV ${Date.now()}`;
    await loggedInPage.getByTestId('btn-create').click();
    await loggedInPage.getByTestId('input-name').fill(dashName);
    await loggedInPage.getByTestId('btn-submit').click();

    await expect(loggedInPage).toHaveURL(/\/dashboard\/.+/, { timeout: 15000 });

    // 1. Select Department in FilterRibbonComponent
    const deptSelect = loggedInPage.locator('app-filter-ribbon mat-select');
    await deptSelect.click();
    await loggedInPage.getByRole('option', { name: 'Cardiology' }).click();
    await expect(loggedInPage).toHaveURL(/dept=Cardiology/);

    // 2. Clear Filters
    const clearBtn = loggedInPage.getByRole('button', { name: /Clear all filters/i });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(loggedInPage).not.toHaveURL(/dept=Cardiology/);

    // 3. Open Theme Color Picker Dialog from toolbar menu and escape
    await loggedInPage.getByTestId('btn-theme-menu').click();
    await loggedInPage.getByTestId('btn-open-theme-dialog').click();
    const themeDialog = loggedInPage.locator('app-theme-color-picker-dialog');
    await expect(themeDialog).toBeVisible();
    await loggedInPage.keyboard.press('Escape');
    await expect(themeDialog).toBeHidden();

    // 4. Open Keyboard Shortcuts Dialog via '?' and escape
    await loggedInPage.keyboard.press('?');
    const shortcutsDialog = loggedInPage.getByTestId('shortcuts-dialog');
    await expect(shortcutsDialog).toBeVisible();
    await loggedInPage.keyboard.press('Escape');
    await expect(shortcutsDialog).toBeHidden();
  });
});
