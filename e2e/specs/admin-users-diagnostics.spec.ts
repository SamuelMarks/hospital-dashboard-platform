/**
 * @fileoverview E2E Test Suite for System Diagnostics Dialog (`SystemDiagnosticsDialogComponent`)
 * and Administrative Configuration / User Management flows.
 */

import { test, expect } from "@playwright/test";

/** Backend API base URL for seeding test users. */
const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("System Diagnostics, Health Banner & Admin Flows", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_diag_${timestamp}@hospital.org`;
  const userPassword = "Password123!";
  let authToken = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: {
        email: userEmail,
        password: userPassword,
        full_name: "Dr. Diagnostics Tester",
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

  test("System Health Banner opens System Diagnostics Dialog and closes cleanly on Escape", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    // Mock degraded status on /api/v1/system/health so the System Notice banner appears
    await page.route("**/api/v1/system/health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          overall_status: "degraded",
          timestamp: new Date().toISOString(),
          postgres: {
            status: "connected",
            details: "SQLite OK",
            latency_ms: 1.2,
            error: null,
          },
          duckdb: {
            status: "ready",
            path: "e2e_test.duckdb",
            tables: { hospital_data: 100 },
            total_tables: 1,
            error: null,
          },
          data: {
            has_default_data: false,
            fallback_generated: true,
            missing_files: [],
            row_counts: { hospital_data: 100 },
          },
          templates: {
            templates_loaded: 5,
            has_templates: true,
            missing_file: false,
          },
          llm: {
            providers_count: 1,
            mock_mode: true,
            models: ["mock-sql"],
          },
          warnings: [
            {
              code: "SYNTHETIC_FALLBACK",
              message: "Using synthetic data",
              severity: "warning",
              remediation: "Ingest real CSV",
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto("/");
    await page.waitForSelector("app-toolbar", { timeout: 15000 });

    const detailsBtn = page
      .locator("app-system-health-banner")
      .getByRole("button", {
        name: /Details/i,
      });
    await expect(detailsBtn).toBeVisible({ timeout: 10000 });
    await detailsBtn.click();

    const diagHeading = page.getByRole("heading", {
      name: /System Health & Diagnostics/i,
    });
    await expect(diagHeading).toBeVisible();

    // Verify PostgreSQL and DuckDB status cards render
    await expect(page.getByText("PostgreSQL", { exact: true })).toBeVisible();
    await expect(page.getByText("DuckDB OLAP", { exact: true })).toBeVisible();

    // Close via Escape
    await page.keyboard.press("Escape");
    await expect(diagHeading).toBeHidden();
  });
});
