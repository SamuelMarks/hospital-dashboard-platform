/**
 * @fileoverview E2E Test Suite for Template Wizard & Dynamic Parameter Form widget provisioning.
 */

import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Template Wizard & Dynamic Parameter Form Flow", () => {
  const timestamp = Date.now();
  const userEmail = `wizard_user_${timestamp}@test.com`;
  const userPassword = "password123";
  let authToken = "";
  let dashboardId = "";

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

    const dashRes = await request.post(`${BACKEND_URL}/dashboards/`, {
      data: { name: `Wizard Dashboard ${timestamp}` },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(dashRes.ok()).toBeTruthy();
    const dashData = await dashRes.json();
    dashboardId = dashData.id;
  });

  test("should open template wizard, fill dynamic parameters, and add widget to dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.evaluate((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);

    await page.goto(`/dashboard/${dashboardId}`);
    await expect(page).toHaveTitle(/Dashboard - Pulse Query/);

    // Open template wizard via empty state button or toolbar
    const wizardBtn = page
      .getByRole("button", {
        name: /Start with a Template|Open Wizard|Templates/i,
      })
      .first();
    await expect(wizardBtn).toBeVisible({ timeout: 10000 });
    await wizardBtn.click();

    // Assert dialog opened
    const dialogTitle = page.getByRole("heading", {
      name: /Add Widget from Marketplace|Template/i,
    });
    await expect(dialogTitle).toBeVisible({ timeout: 10000 });

    // Select first marketplace template card
    const templateCard = page
      .getByRole("button", { name: /Select template/i })
      .first();
    await expect(templateCard).toBeVisible({ timeout: 10000 });
    await templateCard.click({ force: true });

    // Step 1 -> Step 2: Advance to configure parameters
    const nextConfigureBtn = page.getByRole("button", {
      name: /Next: Configure/i,
    });
    await expect(nextConfigureBtn).toBeVisible({ timeout: 10000 });
    await nextConfigureBtn.click();

    // Step 2: Configure / Preview
    const previewBtn = page.getByRole("button", {
      name: /Run & Preview|Next: Visualize/i,
    });
    await expect(previewBtn).toBeVisible({ timeout: 10000 });
    await previewBtn.click();

    // Step 3: Save Widget to dashboard
    const saveWidgetBtn = page.getByRole("button", { name: /Save Widget/i });
    await expect(saveWidgetBtn).toBeVisible({ timeout: 10000 });
    await saveWidgetBtn.click();

    // Assert widget card appears on dashboard
    const widgetCard = page
      .locator(".widget-container, .grid-stack-item, app-widget")
      .first();
    await expect(widgetCard).toBeVisible({ timeout: 15000 });
  });
});
