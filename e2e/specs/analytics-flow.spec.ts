import { test, expect } from "@playwright/test";

/**
 * Constants for the backend API URL.
 * Needed for seeding data directly via API before the frontend test runs.
 */
const BACKEND_URL = "http://localhost:8000/api/v1";

/**
 * Hospital Analytics Global Flow Test Suite.
 *
 * Verifies the integration of the "Create -> Ask AI -> Save -> Bulk Refresh" critical path.
 *
 * Architecture Note:
 * This test suite operates in a hybrid mode:
 * 1. **API Seeding**: Uses direct HTTP calls to the Backend to setup the environment (User, Dashboard).
 * 2. **UI Interaction**: Uses Playwright to drive the Angular Frontend for user-facing features.
 */
test.describe("Hospital Analytics Platform", () => {
  // Test Data State
  const timestamp = Date.now();
  const userEmail = `e2e_user_${timestamp}@test.com`;
  const userPassword = "password123";

  /** The UUID of the dashboard created during setup. */
  let dashboardId: string;
  /** The JWT token obtained during setup. */
  let authToken: string;

  /**
   * Global Setup.
   *
   * Performs the following actions via API before the browser launches:
   * 1. **Register**: Creates a new unique user.
   * 2. **Login**: Obtains a JWT for API authorization.
   * 3. **Seed Dashboard**: Creates an empty dashboard to test against.
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

    // 3. Create Empty Dashboard
    const dashRes = await request.post(`${BACKEND_URL}/dashboards/`, {
      data: { name: `E2E Dashboard ${timestamp}` },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(dashRes.ok()).toBeTruthy();
    const dashData = await dashRes.json();
    dashboardId = dashData.id;
  });

  /**
   * Critical Path Logic.
   *
   * Steps:
   * 1. **Authentication**: Navigates to the app and simulates a logged-in state (or logs in).
   * 2. **Routing**: Navigates to the specific Dashboard Detail view.
   * 3. **Widget Creation**: Adds a widget to the grid.
   * 4. **AI Assistant**: Uses the "Ask Data" sidebar to generate SQL.
   * 5. **Execution**: Runs the query and verifies data visualization.
   *
   * @param page - The Playwright Page fixture.
   */
  test("should support Create -> Ask AI -> Refresh flow", async ({
    page,
    request,
  }) => {
    // --- Step 1: Login UI ---
    await page.goto("/login");

    // Mechanism: LocalStorage Injection
    // Instead of typing into the login form (which is covered by unit tests),
    // we inject the valid token directly into the browser storage to simulate an active session.
    await page.addInitScript((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);

    // --- Step 2: Navigate to Dashboard ---
    // Fix: Use standard Path Parameter syntax '/dashboard/:id'
    // The previous Matrix syntax (;id=) causes the Router to stay on the Home view.
    await page.goto(`/dashboard/${dashboardId}`);

    // Verify: Check that the dashboard title matches our seeded data
    await expect(page.locator("span.title-main")).toContainText(
      `E2E Dashboard ${timestamp}`,
    );

    // --- Step 3: Add Widget ---
    await request.post(`${BACKEND_URL}/dashboards/${dashboardId}/widgets`, {
      data: {
        title: "New Widget",
        type: "SQL",
        visualization: "table",
        config: { query: "SELECT 1 as test;" },
      },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    await page.reload();
    await page.locator('[data-testid="toggle-edit-mode"]').click();

    // Verify Widget Appears
    const widgetCard = page.locator("app-widget").first();
    await expect(widgetCard).toBeVisible({ timeout: 10000 });

    // --- Step 4: Use "Ask AI" Sidebar ---
    const btnAsk = page.locator('[data-testid="btn-ask"]');
    await btnAsk.click();

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Wait for context initialization (The spinner inside AskDataComponent)
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible(
      { timeout: 10000 },
    );

    // Interact with Chat Input
    const chatInput = page.locator(
      'textarea[placeholder="Ask about hospital data..."], input[placeholder="Ask a data question..."]',
    );
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const btnSend = page.getByRole("button", { name: /Send/i });

    await chatInput.fill("Show me patients per department");
    await btnSend.click();

    // Wait for AI Response (Visual bubble or candidate card)
    const aiMsg = page
      .locator(".message-bubble, .candidate-item, .message-row.assistant")
      .last();
    await expect(aiMsg).toBeVisible({ timeout: 15000 });

    // Action: Apply the suggested SQL or select candidate
    const selectBtn = page
      .getByRole("button", { name: /Select Model|Use this SQL|Run/i })
      .first();
    if (await selectBtn.isVisible()) {
      await selectBtn.click();
    }

    // Switch to Code Editor tab if needed to verify SQL
    const codeEditorTab = page.getByRole("tab", { name: /Code Editor/i });
    if (await codeEditorTab.isVisible()) {
      await codeEditorTab.click();
    }

    // Verify: Tab Switch to Code Editor
    const textArea = page.locator(".cm-content, textarea").first();
    await expect(textArea).toBeVisible({ timeout: 10000 });

    // --- Step 5: Run Query (Scratchpad Execution) ---
    const btnRun = page.getByRole("button", { name: "Run Query" });
    await btnRun.click();

    // Verify: Result Table appears in sidebar preview
    const tableHeader = page.locator("viz-table th").first();
    await expect(tableHeader).toBeVisible();

    // --- Step 6: Close Sidebar & Bulk Refresh Dashboard ---
    const btnClose = page.locator('[data-testid="close-btn"]');
    await btnClose.click();
    await expect(sidebar).not.toBeVisible();

    // Trigger Main Dashboard Refresh to ensure the main grid works
    const btnRefresh = page.locator('[data-testid="btn-refresh"]');
    await btnRefresh.click();

    // Verify Main Dashboard Widget has loaded data
    // We look for a table row in the main widget area
    const widgetContainer = page.locator('[data-testid^="widget-wrapper-"]');
    const dataRow = widgetContainer.locator("viz-table tbody tr").first();

    await expect(dataRow).toBeVisible();
    await expect(dataRow).not.toContainText("No data available");
  });

  /**
   * Global Teardown.
   *
   * Cleans up the test environment by deleting the created dashboard explicitly via API.
   * Note: We do not delete the user typically in simple setups, but in a real CI environment,
   * the database container would be wiped.
   *
   * @param request - The Playwright APIRequest context.
   */
  test.afterAll(async ({ request }) => {
    if (dashboardId && authToken) {
      await request.delete(`${BACKEND_URL}/dashboards/${dashboardId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  });
});
