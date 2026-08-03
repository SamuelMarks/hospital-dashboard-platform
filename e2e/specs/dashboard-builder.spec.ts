import { test, expect } from "@playwright/test";

/**
 * Backend API URL for seeding or interacting directly with the API.
 */
const BACKEND_URL = "http://localhost:8000/api/v1";

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
  test("should create a dashboard and add a text widget via UI", async ({ page }) => {
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
      await skipBtn.waitFor({ state: 'visible', timeout: 2000 });
      await skipBtn.click();
    } catch (e) {
      // Ignored if skip button not found
    }

    // --- Step 2: Create Dashboard ---
    const btnCreate = page.locator('[data-testid="btn-create"]');
    await btnCreate.click();

    const nameInput = page.locator('[data-testid="input-name"]');
    await nameInput.fill(`UI Dashboard ${timestamp}`);
    
    const btnSubmit = page.locator('[data-testid="btn-submit"]');
    await btnSubmit.click();

    // Verify: Redirected to Dashboard Page
    await expect(page).toHaveURL(/\/dashboard\/.+/);
    await expect(page.locator("span.title-main")).toContainText(`UI Dashboard ${timestamp}`);

    // --- Step 3: Enable Edit Mode ---
    await page.locator('[data-testid="toggle-edit-mode"]').click();

    // --- Step 4: Open Widget Builder ---
    const btnAddWidget = page.locator('[data-testid="btn-add-widget"]');
    await btnAddWidget.click();

    // --- Step 5: Select Custom Query -> Static Markdown ---
    await page.getByRole('tab', { name: 'Custom Query' }).click();
    
    // Select TEXT option (Static Markdown)
    await page.locator('.source-option').filter({ hasText: 'Static Markdown' }).click();

    // Click Next: Configure
    await page.getByRole('button', { name: 'Next: Configure' }).click();

    // Fill in Markdown Content
    const textArea = page.getByRole('textbox', { name: 'Markdown Content' });
    await expect(textArea).toBeVisible();
    await textArea.fill("# End to End Test\n\nThis is a static markdown widget.");

    // Click "Save Content" inside the text editor first
    await page.getByRole('button', { name: 'Save Content' }).click();

    // Click Save & Finish (Specific to TEXT widgets)
    await page.getByRole('button', { name: 'Save & Finish' }).click();

    // Wait for the dialog to disappear by ensuring the stepper is gone
    await expect(page.locator('mat-stepper')).not.toBeVisible();

    // --- Step 6: Verify Widget on Dashboard ---
    // Look for the rendered markdown content in the widget
    const markdownTitle = page.locator('.md-content', { hasText: 'End to End Test' });
    await expect(markdownTitle).toBeVisible();
    
    const markdownText = page.locator('.md-content', { hasText: 'This is a static markdown widget.' });
    await expect(markdownText).toBeVisible();
  });
});
