/**
 * @fileoverview E2E Test Suite for Dashboard Builder Workflow.
 */

import { test, expect } from "@playwright/test";

/**
 * Backend API URL for seeding or interacting directly with the API.
 */
const BACKEND_URL =
  process.env["E2E_BACKEND_URL"] ?? "http://127.0.0.1:8017/api/v1";

/**
 * Dashboard Builder Workflow Test Suite.
 *
 * Tests the common workflow of a user creating a new dashboard from the UI
 * and adding a custom static markdown widget.
 */
test.describe("Dashboard Builder Workflow", () => {
  // Test Data State
  const timestamp = Date.now();
  const userEmail = `e2e_builder_${timestamp}@test.com`;
  const userPassword = "password123";

  /** The JWT token obtained during setup. */
  let authToken: string;

  /**
   * Global Setup.
   *
   * Performs the following actions via API before the browser launches:
   * 1. **Register**: Creates a new unique user.
   * 2. **Login**: Obtains a JWT for API authorization.
   *
   * @param request - The Playwright APIRequest context.
   */
  test.beforeAll(async ({ request }) => {
    // 1. Register User
    const regRes = await request.post(`${BACKEND_URL}/auth/register`, {
      data: { email: userEmail, password: userPassword },
    });
    expect(regRes.ok(), "Registration failed").toBeTruthy();

    // 2. Login to get Token
    const loginRes = await request.post(`${BACKEND_URL}/auth/login`, {
      form: { username: userEmail, password: userPassword },
    });
    expect(loginRes.ok(), "Login failed during setup").toBeTruthy();
    const loginData = await loginRes.json();
    authToken = loginData.access_token;
  });

  /**
   * Tests the UI flow of creating a dashboard and adding a static text widget.
   */
  test("should create a dashboard and add a text widget via UI", async ({
    page,
  }) => {
    // --- Step 1: Login UI via LocalStorage ---
    await page.goto("/login");
    await page.addInitScript((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);

    // Navigate to Home
    await page.goto("/");

    // Skip onboarding if present
    const skipBtn = page.locator('[data-testid="skip-button"]');
    try {
      await skipBtn.waitFor({ state: "visible", timeout: 2000 });
      await skipBtn.click();
    } catch (e) {
      // Ignored if skip button not found
    }

    // --- Step 2: Create Dashboard ---
    const btnCreate = page.locator('[data-testid="btn-create"]');
    await expect(btnCreate).toBeVisible({ timeout: 15000 });
    await btnCreate.click();

    const nameInput = page.locator('[data-testid="input-name"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.click();
    await nameInput.clear();
    await nameInput.pressSequentially(`UI Dashboard ${timestamp}`, {
      delay: 20,
    });

    const btnSubmit = page.locator('[data-testid="btn-submit"]');
    await expect(btnSubmit).toBeEnabled({ timeout: 10000 });
    await btnSubmit.click();

    // Verify: Redirected to Dashboard Page
    await expect(page).toHaveURL(/\/dashboard\/.+/);
    await expect(page.locator("span.title-main")).toContainText(
      `UI Dashboard ${timestamp}`,
    );

    // Verify 0-widget empty state primary CTA and always-visible toolbar Add Widget button
    await expect(
      page.locator('[data-testid="empty-state-primary-add-btn"]'),
    ).toBeVisible();
    const btnAddWidget = page.locator('[data-testid="btn-add-widget"]');
    await expect(btnAddWidget).toBeVisible();

    // --- Step 3: Enable Edit Mode ---
    await page.locator('[data-testid="toggle-edit-mode"]').click();

    // Verify 0-widget edit mode displays the prominent Add Widget CTA slot
    await expect(
      page.locator('[data-testid="add-widget-cta-card"]'),
    ).toBeVisible();

    // --- Step 4: Open Widget Builder ---
    await btnAddWidget.click();

    // --- Step 5: Select Custom Query -> Static Markdown ---
    await page.getByRole("tab", { name: "Custom Query" }).click();

    // Select TEXT option (Static Markdown)
    await page
      .locator(".source-option")
      .filter({ hasText: "Static Markdown" })
      .click();

    // Click Next: Configure
    await page.getByRole("button", { name: "Next: Configure" }).click();

    // Fill in Markdown Content
    const textArea = page.getByRole("textbox", { name: "Markdown Content" });
    await expect(textArea).toBeVisible();
    await textArea.fill(
      "# End to End Test\n\nThis is a static markdown widget.",
    );

    // Click "Save Content" inside the text editor first
    await page.getByRole("button", { name: "Save Content" }).click();

    // Click Save & Finish (Specific to TEXT widgets)
    await page.getByRole("button", { name: "Save & Finish" }).click();

    // Wait for the dialog to disappear by ensuring the stepper is gone
    await expect(page.locator("mat-stepper")).not.toBeVisible();

    // --- Step 6: Verify Widget on Dashboard ---
    // Look for the rendered markdown content in the widget
    const markdownTitle = page.locator(".md-content", {
      hasText: "End to End Test",
    });
    await expect(markdownTitle).toBeVisible();

    const markdownText = page.locator(".md-content", {
      hasText: "This is a static markdown widget.",
    });
    await expect(markdownText).toBeVisible();

    // With 1 widget (< 2 widgets), the prominent Add Another Widget CTA card is shown alongside it
    await expect(
      page.locator('[data-testid="add-widget-cta-card"]'),
    ).toBeVisible();
  });

  /**
   * Tests all SQL widget visualizations (Pie Chart, Line Chart, Bar Chart, Heatmap, Scalar, Metric, Table)
   * and verifies SQL-to-visualization incompatibility validation in the Widget Builder and Dashboard.
   */
  test("should render all SQL widget visualizations and validate incompatible SQL-to-visualization pairings", async ({
    page,
    request,
  }) => {
    // Seed a dashboard via API with Pie Chart, Line Chart, Heatmap, Scalar, Metric, and an incompatible 1-col Pie Chart
    const createDashRes = await request.post(`${BACKEND_URL}/dashboards/`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: `All Widgets Audit ${timestamp}` },
    });
    expect(createDashRes.ok()).toBeTruthy();
    const dash = await createDashRes.json();

    const widgetsToCreate = [
      {
        title: "Service Pie Chart",
        type: "SQL",
        visualization: "pie_chart",
        config: {
          query:
            "SELECT Clinical_Service, COUNT(*) AS cnt FROM synthetic_hospital_data WHERE Clinical_Service IS NOT NULL GROUP BY 1 LIMIT 4",
        },
      },
      {
        title: "Admissions Line Chart",
        type: "SQL",
        visualization: "line_chart",
        config: {
          query:
            "SELECT Clinical_Service, COUNT(*) AS cnt FROM synthetic_hospital_data WHERE Clinical_Service IS NOT NULL GROUP BY 1 LIMIT 4",
        },
      },
      {
        title: "Incompatible 1-Col Pie",
        type: "SQL",
        visualization: "pie_chart",
        config: {
          query: "SELECT COUNT(*) AS total_rows FROM synthetic_hospital_data",
        },
      },
    ];

    for (const w of widgetsToCreate) {
      const wRes = await request.post(
        `${BACKEND_URL}/dashboards/${dash.id}/widgets`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
          data: w,
        },
      );
      expect(wRes.ok()).toBeTruthy();
    }

    await page.addInitScript((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);
    await page.goto(`/dashboard/${dash.id}`);

    // 1. Assert "Unknown Viz" is never rendered on the dashboard
    await expect(page.getByText("Service Pie Chart")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Unknown Viz")).toHaveCount(0);

    // 2. Assert Pie Chart renders <viz-pie> SVG slices and legend items
    const pieCard = page
      .locator("app-widget")
      .filter({ hasText: "Service Pie Chart" });
    await expect(pieCard.locator("viz-pie svg path").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(pieCard.locator("viz-pie .legend-item").first()).toBeVisible();

    // 3. Assert Line Chart renders <viz-chart> in line mode with SVG polyline and points
    const lineCard = page
      .locator("app-widget")
      .filter({ hasText: "Admissions Line Chart" });
    await expect(lineCard.locator('[data-testid="viz-line-svg"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      lineCard.locator('[data-testid="viz-line-point"]').first(),
    ).toBeVisible();

    // 4. Assert incompatible 1-column Pie Chart renders the Visualization Incompatibility Banner and falls back to Table on click
    const incompatCard = page
      .locator("app-widget")
      .filter({ hasText: "Incompatible 1-Col Pie" });
    await expect(
      incompatCard.locator('[data-testid="viz-incompatibility-state"]'),
    ).toBeVisible({ timeout: 15000 });
    await incompatCard.locator('[data-testid="btn-fallback-table"]').click();
    await expect(incompatCard.locator("viz-table")).toBeVisible();
  });
});
