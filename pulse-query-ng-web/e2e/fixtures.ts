/**
 * @fileoverview Custom Playwright test fixtures providing pre-authenticated clinician browser sessions.
 */

import { test as base, Page, expect } from '@playwright/test';

/**
 * Extend the default Playwright constraints with our custom fixtures.
 */
interface PulseFixtures {
  /** Authenticated Playwright page instance. */
  loggedInPage: Page;
}

export const test = base.extend<PulseFixtures>({
  /**
   * Fixture that provides a Page instance that is already logged in.
   * It registers a new unique user via API, then logs in via UI.
   *
   * @param root0 - Playwright fixture context.
   * @param root0.page - Playwright Page instance.
   * @param root0.request - Playwright APIRequestContext instance.
   * @param use - Callback to provide the authenticated page to the test.
   */
  loggedInPage: async ({ page, request }, use) => {
    const uniqueId = Math.random().toString(36).substring(7);
    const email = `user_${uniqueId}@hospital.com`;
    const password = 'password123';

    // 1. Seed User via API to ensure valid session capability.
    // Using 127.0.0.1 avoids Node/IPv6/IPv4 resolution ambiguity.
    const regRes = await request.post('http://127.0.0.1:8000/api/v1/auth/register', {
      data: { email, password },
    });

    if (!regRes.ok()) {
      console.warn(
        `Seed registration failed (${regRes.status()}). Attempting login anyway in case user exists.`,
      );
    }

    // Prevent the 500ms onboarding overlay from blocking clicks unless a test explicitly resets it.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('pulse_onboarding_complete', 'true');
      } catch {
        // Ignore storage errors in restricted contexts
      }
    });

    // 2. Perform UI Login
    await page.goto('/login');

    // FIX: Use pressSequentially to ensure Angular form control states (dirty/valid)
    // update correctly before the button state is checked. .fill() can be too fast.
    await page.getByTestId('input-email').pressSequentially(email, { delay: 50 });
    await page.getByTestId('input-password').pressSequentially(password, { delay: 50 });

    // Ensure button is enabled before clicking
    await expect(page.getByTestId('submit-btn')).toBeEnabled();
    await page.getByTestId('submit-btn').click();

    // 3. Wait for Successful Redirect
    // Waiting for URL change is robust.
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });

    // 4. Verify Dashboard Loaded
    // We check for specific structural elements to confirm auth:
    // - App Toolbar (Present in Dashboard Layout & Global layout)
    // - OR Heading "My Dashboards" (Present in Home Component)
    // We use .first() here because on the Home Page, BOTH elements exist,
    // which causes a Strict Mode violation if we don't pick one.
    await expect(
      page
        .locator('app-toolbar')
        .or(page.getByRole('heading', { name: 'My Dashboards' }))
        .first(),
    ).toBeVisible({ timeout: 20000 });

    // 5. Pass the authenticated page context
    await use(page);
  },
});

export { expect } from '@playwright/test';
