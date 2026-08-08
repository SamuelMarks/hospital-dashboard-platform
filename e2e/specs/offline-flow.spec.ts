import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Offline & Reconnection Edge Cases", () => {
  const timestamp = Date.now();
  const userEmail = `e2e_offline_${timestamp}@test.com`;
  const userPassword = "password123";
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    const regRes = await request.post(`${BACKEND_URL}/auth/register`, {
      data: { email: userEmail, password: userPassword },
    });
    expect(regRes.ok()).toBeTruthy();

    const loginRes = await request.post(`${BACKEND_URL}/auth/login`, {
      form: { username: userEmail, password: userPassword },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginData = await loginRes.json();
    authToken = loginData.access_token;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.addInitScript((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);
  });

  test("Handles offline API requests and recovers upon reconnection", async ({
    context,
    page,
  }) => {
    // Go to dashboard to perform an action
    await page.goto("/");

    // Skip onboarding if present
    const skipBtn = page.locator('[data-testid="skip-button"]');
    try {
      await skipBtn.waitFor({ state: "visible", timeout: 2000 });
      await skipBtn.click();
    } catch (e) {
      // Ignored if skip button not found
    }

    const dashCard = page.locator("mat-card.dash-card").first();
    if (await dashCard.isVisible()) {
      await dashCard.click();
    }

    await page.waitForSelector("app-dashboard-layout", { timeout: 10000 });

    // Make sure we are fully loaded
    await page.waitForTimeout(1000);

    // Mock offline state by intercepting all API requests and aborting them
    await page.route("**/api/v1/**", (route) =>
      route.abort("internetdisconnected"),
    );

    // Attempt to navigate to Admin which triggers API requests
    // Or just click Refresh dashboard if available
    const refreshBtn = page.locator('button[data-testid="btn-refresh"]');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
    } else {
      await page.locator("a.nav-link", { hasText: "Admin" }).click();
    }

    // Wait for the snackbar to show the error
    const snackbar = page.locator(".mat-mdc-snack-bar-container");
    await expect(snackbar).toBeVisible({ timeout: 10000 });

    // Come back online by removing the route intercept
    await page.unroute("**/api/v1/**");

    // Close the snackbar to reset state
    const closeBtn = snackbar.locator("button");
    await closeBtn.click();
    await expect(snackbar).toBeHidden();

    // Now try again and succeed
    await page.reload();
    await page.waitForSelector("app-dashboard-layout", { timeout: 10000 });
    const content = page.locator("mat-sidenav-container").first();
    await expect(content).toBeVisible();
  });
});
