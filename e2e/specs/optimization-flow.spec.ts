/**
 * @fileoverview E2E Test Suite for the Self-Service Hospital Operations Optimization
 * Copilot & Workspace (`/optimization`).
 *
 * Verifies:
 * 1. "What I Can Do" capabilities overview and "Quick Actions" census reports
 *    (`Patient Days by Unit`, `Patient Days by Service`, `Combined Analysis`, `Summary Statistics`).
 * 2. Iterative natural-language LLM + JAX + MPAX optimization across:
 *    - Use Case 1: Service-Unit Assignments & Bed-Use Optimization
 *    - Use Case 2: Surgical Scheduling (BEDS & POINTS Post-Op Smoothing)
 *    - Use Case 3: Physician & Nurse Scheduling Optimization
 * 3. Quantitative JAX Discrete Event Simulation (DES) Expert Baseline comparison cards
 *    and Qualitative User Experience Survey submission.
 */

import { test, expect } from "@playwright/test";

/** Backend API base URL for seeding test users. */
const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Hospital Operations Optimization Copilot & Workspace (/optimization)", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_optimization_${timestamp}@hospital.org`;
  const userPassword = "Password123!";
  let authToken = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: {
        email: userEmail,
        password: userPassword,
        full_name: "Dr. Optimization Leader",
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

  test("1. Renders What I Can Do, Quick Actions, and DES Expert Baseline on /optimization", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto("/optimization");
    await expect(
      page.getByRole("heading", { name: /What I Can Do/i }),
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("group", { name: /Quick Actions/i }),
    ).toBeVisible();
    await expect(page.getByTestId("des-baseline-section")).toBeVisible({
      timeout: 15000,
    });

    // Execute Patient Days by Unit Quick Action
    await page.getByTestId("quick-action-patient_days_by_unit").click();
    await expect(page.getByTestId("quick-action-result-card")).toBeVisible({
      timeout: 15000,
    });
  });

  test("2. Supports iterative natural-language optimization across Use Cases 1, 2, and 3 and UX survey submission", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto("/optimization");
    await expect(page.getByTestId("input-optimization-prompt")).toBeVisible({
      timeout: 15000,
    });

    // Submit prompt for Use Case 1 (Service-Unit Assignments)
    await page
      .getByTestId("input-optimization-prompt")
      .fill(
        "Place all General Pediatrics patients on PCU 350 and open PCU 360 with 10 additional beds.",
      );
    await page.getByTestId("btn-submit-optimization").click();
    await expect(page.getByTestId("copilot-explanation-card")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByTestId("table-service-unit-assignments"),
    ).toBeVisible({
      timeout: 15000,
    });

    // Switch to Use Case 2 (Surgical Scheduling BEDS & POINTS)
    await page.getByTestId("tab-use-case-surgical").click();
    await expect(page.getByTestId("table-surgical-schedule")).toBeVisible({
      timeout: 15000,
    });

    // Switch to Use Case 3 (Physician & Nurse Staffing)
    await page.getByTestId("tab-use-case-staffing").click();
    await expect(page.getByTestId("table-staffing-assignments")).toBeVisible({
      timeout: 15000,
    });

    // Open and submit the Qualitative UX Evaluation Survey
    await page.getByTestId("btn-toggle-survey").click();
    await expect(page.getByTestId("survey-panel")).toBeVisible();
    await page.getByTestId("btn-submit-survey").click();
    await expect(page.getByTestId("survey-success-msg")).toBeVisible({
      timeout: 15000,
    });
  });
});
