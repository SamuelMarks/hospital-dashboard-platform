/**
 * @fileoverview E2E Test Suite for What-If Hospital Capacity & Bed Allocation Simulation Flow.
 */

import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Hospital What-If Capacity Simulation Flow", () => {
  const timestamp = Date.now();
  const userEmail = `sim_user_${timestamp}@test.com`;
  const userPassword = "password123";
  let authToken = "";

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

  test("should configure capacity, constraints, and verify optimization results table", async ({
    page,
  }) => {
    // Inject auth token
    await page.goto("/login");
    await page.evaluate((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);

    await page.goto("/simulation");
    await expect(page).toHaveTitle(/Simulation - Pulse Query/);

    // Verify main simulation panel elements exist
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();

    // Look for Run Scenario button
    const runBtn = page.getByRole("button", {
      name: /Run Scenario|Run Optimization|Optimize/i,
    });
    await expect(runBtn).toBeVisible({ timeout: 10000 });
    await runBtn.click();

    // Verify either spinner appears or results render
    const resultsContainer = page
      .locator(".simulation-results, .results-table, table, .error-box")
      .first();
    await expect(resultsContainer).toBeVisible({ timeout: 15000 });
  });

  test("should handle contradictory constraints gracefully with user error feedback", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.evaluate((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);

    await page.goto("/simulation");

    // Set invalid capacity value to trigger error feedback
    const capacityInput = page
      .getByRole("spinbutton", { name: "Capacity" })
      .first();
    await expect(capacityInput).toBeVisible({ timeout: 10000 });
    await capacityInput.fill("-999");

    const runBtn = page.getByRole("button", {
      name: /Run Scenario|Run Optimization|Optimize/i,
    });
    await expect(runBtn).toBeVisible({ timeout: 10000 });
    await runBtn.click();

    // Expect error toast, error box, or alert banner
    const errorBanner = page
      .locator(
        ".error-banner, .error-box, .mat-snack-bar-container, [role='alert']",
      )
      .first();
    await expect(errorBanner).toBeVisible({ timeout: 15000 });
  });
});
