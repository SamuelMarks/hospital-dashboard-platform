import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Dashboard Management & Layout", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_dash_mgmt_${timestamp}@test.com`;
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
    // Inject token for all tests
    await page.goto("/login");
    await page.addInitScript((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);
  });

  test("Empty State and Restore Defaults", async ({ page }) => {
    await page.goto("/");

    // Skip onboarding if present
    const skipBtn = page.locator('[data-testid="skip-button"]');
    try {
      await skipBtn.waitFor({ state: 'visible', timeout: 2000 });
      await skipBtn.click();
    } catch (e) {
      // Ignored if skip button not found
    }

    // 1. Delete all dashboards
    // Wait for dashboards to load
    await page.waitForSelector('[data-testid="dashboard-grid"]');

    let menuButtons = await page.locator('[data-testid="btn-card-menu"]').all();
    while (menuButtons.length > 0) {
      await menuButtons[0].click();
      await page.locator('button:has-text("Delete")').click();
      
      // Confirm dialog
      await page.locator('mat-dialog-container button:has-text("Confirm")').click();
      
      // Wait for it to disappear from DOM
      await page.waitForTimeout(500); // brief wait for animation/api
      menuButtons = await page.locator('[data-testid="btn-card-menu"]').all();
    }

    // Verify empty state is visible
    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("You haven't created any analytics dashboards yet");

    // 2. Restore Defaults
    const restoreBtn = page.locator('button', { hasText: 'Create Default Dashboard' });
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    // Verify redirection to the new default dashboard
    await expect(page).toHaveURL(/\/dashboard\/.+/);
    
    const dashTitle = page.locator('span.title-main');
    await expect(dashTitle).toContainText("Hospital Command Center");
  });

  test("Widget Deletion", async ({ page }) => {
    // Go home and select the newly created default dashboard
    await page.goto("/");

    // Skip onboarding if present
    const skipBtn = page.locator('[data-testid="skip-button"]');
    try {
      await skipBtn.waitFor({ state: 'visible', timeout: 2000 });
      await skipBtn.click();
    } catch (e) {
      // Ignored if skip button not found
    }

    const dashCard = page.locator('mat-card.dash-card').first();
    await dashCard.click();
    await expect(page).toHaveURL(/\/dashboard\/.+/);

    // Toggle edit mode
    await page.locator('[data-testid="toggle-edit-mode"]').click();

    // Count widgets before
    const widgetsBefore = await page.locator('app-widget').count();
    expect(widgetsBefore).toBeGreaterThan(0);

    // Focus first widget
    const firstWidget = page.locator('app-widget').first();
    await firstWidget.click();

    // Click delete
    const deleteBtn = firstWidget.locator('[data-testid="btn-delete"]');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Confirm dialog
    const confirmDeleteBtn = page.locator('mat-dialog-container button:has-text("Delete")');
    await expect(confirmDeleteBtn).toBeVisible();
    await confirmDeleteBtn.click();

    // Verify widget count decreased
    await expect(page.locator('app-widget')).toHaveCount(widgetsBefore - 1);
  });

  test.skip("Drag & Drop Reordering", async ({ page }) => {
    await page.goto("/");

    // Skip onboarding if present
    const skipBtn = page.locator('[data-testid="skip-button"]');
    try {
      await skipBtn.waitFor({ state: 'visible', timeout: 2000 });
      await skipBtn.click();
    } catch (e) {
      // Ignored if skip button not found
    }

    const dashCard = page.locator('mat-card.dash-card').first();
    await dashCard.click();
    await expect(page).toHaveURL(/\/dashboard\/.+/);

    await page.locator('[data-testid="toggle-edit-mode"]').click();

    const widgets = page.locator('app-widget');
    await expect(widgets.nth(1)).toBeVisible(); // Ensure at least 2 widgets exist

    // Save their title text to compare later
    const firstWidgetTitle = await widgets.nth(0).locator('.title-text').innerText();
    const secondWidgetTitle = await widgets.nth(1).locator('.title-text').innerText();

    // Perform Drag and Drop using Playwright's built-in dragTo
    const firstHandle = page.locator('.grid-item').nth(0);
    const secondHandle = page.locator('.grid-item').nth(1);

    await firstHandle.dragTo(secondHandle);
    
    await page.waitForTimeout(1000); // Wait for order to update
    
    // Save changes 
    await page.locator('[data-testid="toggle-edit-mode"]').click();

    // Refresh page to ensure backend persisted it
    await page.reload();

    // Verify the new order
    const newWidgets = page.locator('app-widget');
    const newFirstTitle = await newWidgets.nth(0).locator('.title-text').innerText();
    expect(newFirstTitle).not.toEqual(firstWidgetTitle);
  });
});
