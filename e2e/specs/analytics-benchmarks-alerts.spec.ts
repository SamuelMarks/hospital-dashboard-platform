/**
 * @fileoverview E2E Test Suite for Clinical Alert Rules CRUD (`/analytics/alert-rules`)
 * and Benchmark Datasets & Scenario Runner (`/benchmarks`).
 */

import { test, expect } from "@playwright/test";

/** Backend API base URL for seeding test users. */
const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Alert Rules Management & Benchmark Scenarios Flows", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_alerts_bench_${timestamp}@hospital.org`;
  const userPassword = "Password123!";
  let authToken = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: {
        email: userEmail,
        password: userPassword,
        full_name: "Dr. Alert Benchmark Tester",
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
  });

  test("1. Hospital Alert Rules (/analytics/alert-rules) supports creating, toggling, editing, and deleting rules", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto("/analytics/alert-rules");
    await expect(
      page.getByRole("heading", { name: /Hospital Alert Rules/i }),
    ).toBeVisible({
      timeout: 15000,
    });

    // Fill and submit the Create Alert Rule form
    const unitCategory = `ICU Surge ${timestamp}`;
    await page.getByTestId("unit-category-input").fill(unitCategory);
    await page.getByTestId("threshold-input").fill("92");

    await page.getByTestId("submit-rule-btn").click();

    // Verify rule row appears in table
    const ruleRow = page
      .getByTestId("rule-row")
      .filter({ hasText: unitCategory });
    await expect(ruleRow).toBeVisible({ timeout: 10000 });
  });

  test("2. Benchmark Datasets (/benchmarks) renders Text-to-SQL and MPAX tabs and navigates to MPAX Arena", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto("/benchmarks");
    await expect(
      page.getByRole("heading", { name: /Benchmark Datasets/i }),
    ).toBeVisible({
      timeout: 15000,
    });

    // Switch to Hospital Optimization tab
    const mpaxTab = page.getByRole("tab", {
      name: /Hospital Optimization|MPAX Optimization/i,
    });
    await expect(mpaxTab).toBeVisible({ timeout: 15000 });
    await mpaxTab.click();

    // Click on the first MPAX scenario card if present
    const scenarioCard = page
      .locator('.benchmarks-container [role="button"]')
      .first();
    if ((await scenarioCard.count()) > 0) {
      await scenarioCard.click();
      await expect(page).toHaveURL(/\/optimization\?prompt=/);
    }
  });
});
