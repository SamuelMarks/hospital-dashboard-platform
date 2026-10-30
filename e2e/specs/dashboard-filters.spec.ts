/**
 * @fileoverview E2E Test Suite for Dashboard Filter Ribbon (`FilterRibbonComponent`)
 * and global URL query parameter synchronization (`dept`, `start_date`, `end_date`).
 */

import { test, expect } from "@playwright/test";

/** Backend API base URL for seeding test users and dashboards. */
const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Dashboard Filter Ribbon & Global Parameters Flow", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_filters_${timestamp}@hospital.org`;
  const userPassword = "Password123!";
  let authToken = "";
  let dashboardId = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: {
        email: userEmail,
        password: userPassword,
        full_name: "Dr. Filter Tester",
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
      data: { name: `Filter Test Dashboard ${timestamp}` },
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

  test("Selecting Department, Date Range, and Clearing Filters updates URL query params and state", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${dashboardId}`);
    await page.waitForSelector("app-filter-ribbon", { timeout: 15000 });

    // 1. Select Department "Cardiology"
    const deptSelect = page.locator("app-filter-ribbon mat-select");
    await deptSelect.click();
    await page.getByRole("option", { name: "Cardiology" }).click();

    await expect(page).toHaveURL(/dept=Cardiology/);

    // 2. Verify Clear button appears when filter is active
    const clearBtn = page.getByRole("button", { name: /Clear all filters/i });
    await expect(clearBtn).toBeVisible();

    // 3. Reload with query parameters in URL and verify state restoration
    await page.goto(
      `/dashboard/${dashboardId}?dept=Neurology&start_date=2025-01-01&end_date=2025-01-31`,
    );
    await page.waitForSelector("app-filter-ribbon", { timeout: 15000 });
    await expect(deptSelect).toContainText("Neurology");
    await expect(clearBtn).toBeVisible();

    // 4. Click Clear button and verify query parameters are removed
    await clearBtn.click();
    await expect(page).not.toHaveURL(/dept=/);
    await expect(page).not.toHaveURL(/start_date=/);
    await expect(clearBtn).toBeHidden();
  });
});
