import { test, expect } from './fixtures';

test.describe('Registration', () => {
  test('should register via UI and allow logout', async ({ page }) => {
    test.setTimeout(60000);

    const uniqueId = Math.random().toString(36).slice(2);
    const email = `new_${uniqueId}@test.com`;
    const password = 'password123';

    await page.goto('/register');

    await page.getByTestId('input-email').pressSequentially(email, { delay: 50 });
    await page.getByTestId('input-password').pressSequentially(password, { delay: 50 });
    await page.getByTestId('input-confirm-password').pressSequentially(password, { delay: 50 });

    const submit = page.getByTestId('submit-btn');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).not.toHaveURL(/register/);
    await expect(
      page
        .locator('app-toolbar')
        .or(page.getByRole('heading', { name: 'My Dashboards' }))
        .first(),
    ).toBeVisible({ timeout: 20000 });

    await page.getByTestId('btn-user-menu').click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();

    await expect(page).toHaveURL(/login/);
  });
});
