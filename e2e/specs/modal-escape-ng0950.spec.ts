/**
 * @fileoverview E2E Regression Test Suite for `Application Error: NG0950` and Modal Escape Flows.
 *
 * Exercises every modal, overlay, focus trap, and interactive control on the Default Dashboard
 * ("Hospital Command Center") and Home screen, verifying that pressing `Escape` or clicking
 * backdrops never triggers `Application Error: NG0950` or unhandled runtime exceptions.
 */

import { test, expect, Page } from "@playwright/test";

/** Backend API base URL for seeding test users and default dashboards. */
const BACKEND_URL = "http://localhost:8000/api/v1";

/**
 * Attaches console error and snackbar watchers to ensure `NG0950` never occurs on `page`.
 *
 * @param page - Playwright Page instance to monitor.
 * @returns Array accumulating any `NG0950` or `Application Error` messages detected.
 */
function attachNg0950Monitor(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (text.includes("NG0950") || text.includes("Application Error:")) {
        errors.push(text);
      }
    }
  });
  page.on("pageerror", (err) => {
    if (
      err.message.includes("NG0950") ||
      err.message.includes("Application Error:")
    ) {
      errors.push(err.message);
    }
  });
  return errors;
}

/**
 * Asserts that no `Application Error` snackbar is visible and no `NG0950` errors were logged.
 *
 * @param page - Playwright Page instance to check.
 * @param recordedErrors - Array of recorded console/page errors from `attachNg0950Monitor`.
 */
async function assertNoNg0950Error(
  page: Page,
  recordedErrors: string[],
): Promise<void> {
  const errorSnackbar = page.locator(
    ".snackbar-critical, mat-snack-bar-container",
    {
      hasText: /Application Error|NG0950/i,
    },
  );
  await expect(errorSnackbar).toHaveCount(0);
  expect(recordedErrors).toEqual([]);
}

test.describe("Default Dashboard & Modal Escape Regression Suite (NG0950)", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_ng0950_${timestamp}@hospital.org`;
  const userPassword = "Password123!";
  let authToken = "";
  let defaultDashboardId = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: {
        email: userEmail,
        password: userPassword,
        full_name: "Dr. Escape Tester",
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

    // Provision default dashboard via restore-defaults endpoint
    const restoreRes = await request.post(
      `${BACKEND_URL}/dashboards/restore-defaults`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(restoreRes.ok()).toBeTruthy();
    const dashData = await restoreRes.json();
    defaultDashboardId = dashData.id;
  });

  test.afterAll(async ({ request }) => {
    if (defaultDashboardId && authToken) {
      await request.delete(`${BACKEND_URL}/dashboards/${defaultDashboardId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  });

  test("1. Onboarding Wizard opens on first visit and escapes cleanly without NG0950", async ({
    page,
  }) => {
    const errors = attachNg0950Monitor(page);

    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.removeItem("pulse_onboarding_complete");
    }, authToken);

    await page.goto("/");
    const wizard = page.getByTestId("onboarding-wizard");
    await expect(wizard).toBeVisible({ timeout: 10000 });

    // Advance one step then press Escape
    await page.getByTestId("next-button").click();
    await page.keyboard.press("Escape");

    await expect(wizard).toBeHidden();
    await assertNoNg0950Error(page, errors);
  });

  test("2. Default Dashboard Filter Ribbon interactions and Escape key do not throw NG0950", async ({
    page,
  }) => {
    const errors = attachNg0950Monitor(page);

    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${defaultDashboardId}`);
    await page.waitForSelector("app-dashboard-layout", { timeout: 15000 });
    const dashFooter = page.getByTestId("app-footer");
    await expect(dashFooter).toBeVisible();
    await expect(dashFooter).toContainText(/Built on .* UTC/i);
    await expect(dashFooter).toContainText("Copyright © 2026 Samuel Marks");
    await expect(page.getByTestId("footer-github-link")).toHaveAttribute(
      "href",
      "https://github.com/SamuelMarks/hospital-dashboard-platform",
    );
    const dashViewport = page.viewportSize();
    const dashFooterBox = await dashFooter.boundingBox();
    expect(dashFooterBox).not.toBeNull();
    if (dashFooterBox && dashViewport) {
      expect(dashFooterBox.height).toBeGreaterThan(15);
      expect(dashFooterBox.y + dashFooterBox.height).toBeLessThanOrEqual(
        dashViewport.height + 1,
      );
    }
    await assertNoNg0950Error(page, errors);

    // Open Department select and press Escape
    const deptSelect = page.locator("app-filter-ribbon mat-select");
    await deptSelect.click();
    await page.keyboard.press("Escape");
    await assertNoNg0950Error(page, errors);

    // Focus Start Date and End Date inputs and press Escape
    const startInput = page.locator("app-filter-ribbon input[matStartDate]");
    await startInput.focus();
    await page.keyboard.press("Escape");
    await assertNoNg0950Error(page, errors);

    // Open Datepicker popup and press Escape
    const toggleBtn = page.locator(
      "app-filter-ribbon mat-datepicker-toggle button",
    );
    await toggleBtn.click();
    await page.keyboard.press("Escape");
    await assertNoNg0950Error(page, errors);
  });

  test("3. Clicking Focus Widget (Maximize) on Default Dashboard and pressing Escape closes cleanly", async ({
    page,
  }) => {
    const errors = attachNg0950Monitor(page);

    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${defaultDashboardId}`);
    await page.waitForSelector("app-widget", { timeout: 15000 });

    const focusBtn = page.getByTestId("focus-widget-btn").first();
    await expect(focusBtn).toBeVisible({ timeout: 10000 });
    await focusBtn.click();

    const focusModal = page.getByTestId("focused-widget-modal");
    await expect(focusModal).toBeVisible();

    // Press Escape to close focused widget modal
    await page.keyboard.press("Escape");
    await expect(focusModal).toBeHidden();
    await assertNoNg0950Error(page, errors);

    // Open again and click backdrop
    await focusBtn.click();
    await expect(focusModal).toBeVisible();
    await focusModal.click({ position: { x: 5, y: 5 } });
    await expect(focusModal).toBeHidden();
    await assertNoNg0950Error(page, errors);
  });

  test("4. Escaping WidgetEditorDialog, WidgetBuilderComponent, and ConfirmDialog in Edit Mode does not throw NG0950", async ({
    page,
  }) => {
    const errors = attachNg0950Monitor(page);

    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${defaultDashboardId}`);
    await page.waitForSelector("app-widget", { timeout: 15000 });

    // Enter Edit Mode
    await page.getByTestId("toggle-edit-mode").click();

    // 4a. Open Edit Widget Dialog via btn-edit and press Escape
    const editBtn = page.getByTestId("btn-edit").first();
    await editBtn.click({ force: true });

    const editDialog = page.locator("mat-dialog-container");
    await expect(editDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();
    await assertNoNg0950Error(page, errors);

    // 4b. Open Delete Widget Confirmation Dialog via btn-delete and press Escape
    const deleteBtn = page.getByTestId("btn-delete").first();
    await deleteBtn.click({ force: true });
    await expect(editDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();
    await assertNoNg0950Error(page, errors);

    // 4c. Open Add Widget Builder Dialog, focus inputs, and press Escape
    await page.getByTestId("btn-add-widget").click();
    await expect(page.locator("app-widget-builder")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("app-widget-builder")).toBeHidden();
    await assertNoNg0950Error(page, errors);
  });

  test("5. Escaping ShareDashboardDialog, ThemeColorPickerDialog, PromptDialog, and KeyboardShortcutsDialog does not throw NG0950", async ({
    page,
  }) => {
    const errors = attachNg0950Monitor(page);

    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${defaultDashboardId}`);
    await page.waitForSelector("app-dashboard-layout", { timeout: 15000 });

    // 5a. Share Dashboard Dialog -> focus email input -> press Escape
    await page.getByTestId("btn-share-dashboard").click();
    const shareInput = page.getByTestId("input-share-email");
    await expect(shareInput).toBeVisible();
    await shareInput.focus();
    await page.keyboard.press("Escape");
    await expect(shareInput).toBeHidden();
    await assertNoNg0950Error(page, errors);

    // 5b. Theme Color Picker Dialog -> focus hex input -> press Escape
    await page.getByTestId("btn-theme-menu").click();
    await page.getByTestId("btn-open-theme-dialog").click();
    const hexInput = page.locator(
      "app-theme-color-picker-dialog input[matInput]",
    );
    await expect(hexInput).toBeVisible();
    await hexInput.focus();
    await page.keyboard.press("Escape");
    await expect(hexInput).toBeHidden();
    await assertNoNg0950Error(page, errors);

    // 5c. Keyboard Shortcuts Dialog (via '?' key) -> press Escape
    await page.keyboard.press("?");
    const shortcutsDialog = page.getByTestId("shortcuts-dialog");
    await expect(shortcutsDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shortcutsDialog).toBeHidden();
    await assertNoNg0950Error(page, errors);

    // 5d. Ask AI Sidenav Drawer (btn-ask) -> press Escape closes drawer without focus trap deadlock
    await page.getByTestId("btn-ask").click();
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toHaveClass(/mat-drawer-opened/);
    await page.keyboard.press("Escape");
    await expect(sidebar).not.toHaveClass(/mat-drawer-opened/);
    await assertNoNg0950Error(page, errors);

    // 5e. Home Page Create Dashboard Dialog & Rename Prompt Dialog -> press Escape
    await page.goto("/");
    const homeFooter = page.getByTestId("app-footer");
    await expect(homeFooter).toBeVisible();
    await expect(homeFooter).toContainText(/Built on .* UTC/i);
    await expect(homeFooter).toContainText("Copyright © 2026 Samuel Marks");
    const homeViewport = page.viewportSize();
    const homeFooterBox = await homeFooter.boundingBox();
    expect(homeFooterBox).not.toBeNull();
    if (homeFooterBox && homeViewport) {
      expect(homeFooterBox.height).toBeGreaterThan(15);
      expect(homeFooterBox.y + homeFooterBox.height).toBeLessThanOrEqual(
        homeViewport.height + 1,
      );
    }
    await page.getByTestId("btn-create").click();
    const nameInput = page.getByTestId("input-name");
    await expect(nameInput).toBeVisible();
    await nameInput.focus();
    await page.keyboard.press("Escape");
    await expect(nameInput).toBeHidden();
    await assertNoNg0950Error(page, errors);
  });

  test("6. Nested MatDialog over maximized focused-widget-modal escapes layer-by-layer without NG0950", async ({
    page,
  }) => {
    const errors = attachNg0950Monitor(page);

    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${defaultDashboardId}`);
    await page.waitForSelector("app-widget", { timeout: 15000 });

    // Enter Edit Mode and maximize the first widget
    await page.getByTestId("toggle-edit-mode").click();
    await page.getByTestId("focus-widget-btn").first().click();

    const focusModal = page.getByTestId("focused-widget-modal");
    await expect(focusModal).toBeVisible();

    // Open Edit Widget Dialog from inside the maximized focused-widget-modal
    await focusModal.getByTestId("btn-edit").click({ force: true });
    const editDialog = page.locator("mat-dialog-container");
    await expect(editDialog).toBeVisible();

    // First Escape closes only the top MatDialog (WidgetEditorDialog), keeping focused-widget-modal open
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();
    await expect(focusModal).toBeVisible();
    await assertNoNg0950Error(page, errors);

    // Second Escape closes the underlying focused-widget-modal
    await page.keyboard.press("Escape");
    await expect(focusModal).toBeHidden();
    await assertNoNg0950Error(page, errors);
  });
});
