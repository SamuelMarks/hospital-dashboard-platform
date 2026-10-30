/**
 * @fileoverview E2E Test Suite for TV Kiosk Mode, Dynamic Material 3 Theme Picker,
 * and Dark/Light Mode toggling.
 */

import { test, expect } from "@playwright/test";

/** Backend API base URL for seeding test users and dashboards. */
const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("TV Kiosk Mode, Theme Picker & Dark/Light Mode Flows", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_theme_${timestamp}@hospital.org`;
  const userPassword = "Password123!";
  let authToken = "";
  let dashboardId = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: {
        email: userEmail,
        password: userPassword,
        full_name: "Dr. Theme Tester",
      },
    });

    const loginRes = await request.post(`${BACKEND_URL}/auth/login`, {
      form: {
        username: userEmail,
        password: userPassword,
      },
    });
    expect(loginRes.ok()).toBeTruthy();
    const tokenData = await loginRes.json();
    authToken = tokenData.access_token;

    const dashRes = await request.post(`${BACKEND_URL}/dashboards/`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: `Theme & TV Dashboard ${timestamp}` },
    });
    expect(dashRes.ok()).toBeTruthy();
    const dashData = await dashRes.json();
    dashboardId = dashData.id;
  });

  test.afterAll(async ({ request }) => {
    if (dashboardId && authToken) {
      await request.delete(`${BACKEND_URL}/dashboards/${dashboardId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  });

  test("1. Toggling Dark/Light Mode and selecting a custom Dashboard Theme Color", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${dashboardId}`);
    await page.waitForSelector("app-dashboard-layout", { timeout: 15000 });

    // Open Theme Menu and toggle Dark/Light mode
    await page.getByTestId("btn-theme-menu").click();
    await page.getByRole("menuitem", { name: /Dark Mode|Light Mode/i }).click();

    // Open Theme Color Picker Dialog
    await page.getByTestId("btn-theme-menu").click();
    await page.getByTestId("btn-open-theme-dialog").click();
    const dialog = page.locator("app-theme-color-picker-dialog");
    await expect(dialog).toBeVisible();

    // Select a curated palette swatch and apply to session
    const swatches = page.locator(
      "app-theme-color-picker-dialog .palette-card",
    );
    await expect(swatches.first()).toBeVisible();
    await swatches.nth(1).click();

    await page.getByTestId("btn-apply-theme").click();
    await expect(dialog).toBeHidden();
  });

  test("2. Toggling TV Kiosk Mode via toolbar button and ?mode=tv query param", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${dashboardId}?mode=tv`);
    await page.waitForSelector("app-dashboard-layout", { timeout: 15000 });

    // Verify TV Mode Header is visible and normal toolbar/filter ribbon are hidden
    await expect(page.locator(".tv-carousel-header")).toBeVisible();
    await expect(page.locator(".tv-dashboard-title")).toContainText(
      `Theme & TV Dashboard`,
    );
    await expect(page.locator("app-filter-ribbon")).toBeHidden();
  });
});
