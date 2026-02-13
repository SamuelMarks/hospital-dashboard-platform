import { test, expect } from './fixtures';

test.describe('Authentication', () => {
  test('should login successfully with valid credentials', async ({ page, request }) => {
    // Manual setup: Ensure a test user exists via API
    // Using 127.0.0.1 directly to avoid resolution ambiguity in Node/browser fetch
    const uniqueId = Math.random().toString(36).substring(7);
    const email = `valid_${uniqueId}@test.com`;
    const password = 'password123';

    // Seed user (we perform this side-effect to ensure the login attempt can actually succeed)
    const response = await request.post('http://127.0.0.1:8000/api/v1/auth/register', {
      data: { email, password },
    });

    await page.goto('/login');

    // Fill valid credentials
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill(password);
    await page.getByTestId('submit-btn').click();

    // Verify redirection to dashboard/home
    await expect(page).not.toHaveURL(/login/);
    await expect(page).toHaveURL('/');

    // Check for landing page elements
    // Resolve potential strict mode violation by taking the first matching indicator
    await expect(
      page.getByRole('heading', { name: 'My Dashboards' }).or(page.locator('app-toolbar')).first(),
    ).toBeVisible();
  });

  test('should show error alert on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Use completely invalid credentials guaranteed to fail
    await page.getByTestId('input-email').fill('wrong@test.com');
    await page.getByTestId('input-email').blur(); // Trigger validation update

    await page.getByTestId('input-password').fill('invalidpass');
    await page.getByTestId('input-password').blur(); // Trigger validation update

    // Ensure the button is enabled before clicking.
    const btn = page.getByTestId('submit-btn');
    await expect(btn).toBeEnabled();
    await btn.click();

    // Verify error alert appears
    const alert = page.getByTestId('error-alert');
    await expect(alert).toBeVisible();

    // Match either the server-side text OR client-side fallback
    await expect(alert).toContainText(/(Incorrect|Invalid) email or password/i);

    // Verify we remain on login page
    await expect(page).toHaveURL(/login/);
  });

  test('should redirect authenticated users away from login page', async ({ loggedInPage }) => {
    // Uses 'loggedInPage' fixture which effectively pre-authenticates the session.
    await loggedInPage.goto('/login');

    // Should automatically bounce back to root
    await expect(loggedInPage).toHaveURL('http://localhost:4200/', { timeout: 10000 });
    await expect(loggedInPage).not.toHaveURL(/login/);
  });

  test('should redirect unauthenticated access to login', async ({ page }) => {
    const targetUrl = '/dashboard/123';

    // Attempt to access protected route
    await page.goto(targetUrl);

    // Verify redirection to login
    await expect(page).toHaveURL(/\/login/);

    // Verify returnUrl parameter is set
    expect(page.url()).toContain('returnUrl=%2Fdashboard%2F123');
  });
});
