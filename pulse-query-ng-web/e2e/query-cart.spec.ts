import { test, expect } from './fixtures';

test.describe('Query Cart', () => {
  test('should save an ad-hoc query to cart and add it to the dashboard', async ({ loggedInPage }) => {
    test.setTimeout(90000);

    // Create a fresh dashboard
    await loggedInPage.goto('/');
    await loggedInPage.getByTestId('btn-create').click();
    const dashName = `Cart Test ${Date.now()}`;
    await loggedInPage.getByTestId('input-name').pressSequentially(dashName, { delay: 50 });
    await loggedInPage.getByTestId('btn-submit').click();
    await expect(loggedInPage).toHaveURL(/\/dashboard\//, { timeout: 20000 });
    await expect(loggedInPage.locator('app-toolbar')).toBeVisible();

    // Open Ask Data
    await loggedInPage.locator('app-toolbar').getByRole('button', { name: /Ask AI/i }).click();
    const drawer = loggedInPage.locator('.search-drawer');
    await expect(drawer).toBeVisible({ timeout: 15000 });

    // Switch to Code Editor tab
    await drawer.getByRole('tab', { name: 'Code Editor' }).click();

    // Enter SQL and run
    const editor = drawer.locator('.cm-content');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await editor.fill('SELECT 1 as Value');

    await drawer.getByRole('button', { name: 'Run Query' }).click();
    await expect(drawer.locator('viz-table')).toBeVisible({ timeout: 20000 });

    // Save to cart
    const saveBtn = drawer.getByRole('button', { name: /Save to Cart/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Close Ask Data
    await drawer.getByTestId('close-btn').click();
    await expect(drawer).not.toBeVisible({ timeout: 15000 });

    // Open edit mode to reveal cart sidebar
    await loggedInPage.getByTestId('toggle-edit-mode').click();

    const cartList = loggedInPage.getByTestId('query-cart-list');
    await expect(cartList).toBeVisible({ timeout: 15000 });

    const cartItem = cartList.locator('[data-testid^=\"cart-item-\"]').first();
    await expect(cartItem).toBeVisible({ timeout: 15000 });

    // Add to dashboard
    const addButton = cartItem.getByTestId('add-to-dashboard');
    await expect(addButton).toBeEnabled();
    await addButton.click();

    // Verify widget appears in grid
    const widget = loggedInPage.locator('app-dashboard-layout app-widget');
    await expect(widget).toContainText('Value', { timeout: 20000 });
  });
});
