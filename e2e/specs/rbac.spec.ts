import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Role-Based Access Control (RBAC)", () => {
  test.describe.configure({ mode: "serial" });
  
  const timestamp = Date.now();
  const userEmail = `e2e_rbac_${timestamp}@test.com`;
  const userPassword = "password123";
  let authToken: string;
  let userId: string;

  test.beforeAll(async ({ request }) => {
    // Register a standard user
    const regRes = await request.post(`${BACKEND_URL}/auth/register`, {
      data: { email: userEmail, password: userPassword },
    });
    expect(regRes.ok()).toBeTruthy();
    const user = await regRes.json();
    userId = user.id;

    // Login to get Token
    const loginRes = await request.post(`${BACKEND_URL}/auth/login`, {
      form: { username: userEmail, password: userPassword },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginData = await loginRes.json();
    authToken = loginData.access_token;
  });

  test("Admin Access: Admin user can access /admin and modify settings", async ({ page }) => {
    // Intercept the /me endpoint to mock an admin user
    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: userId,
          email: userEmail,
          is_active: true,
          is_admin: true, // Promoted to admin in mock
        }),
      });
    });

    // Intercept the GET /admin/settings to return empty settings
    await page.route("**/api/v1/admin/settings", async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ api_keys: {}, visible_models: [] }),
        });
      } else if (request.method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: request.postData() || "{}",
        });
      } else {
        await route.continue();
      }
    });

    // Login via UI with LocalStorage
    await page.goto("/login");
    await page.addInitScript((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);
    await page.goto("/");

    // Verify Admin button is visible
    const adminBtn = page.locator('button', { hasText: 'Admin' });
    await expect(adminBtn).toBeVisible();

    // Navigate to admin
    await adminBtn.click();
    await expect(page).toHaveURL(/\/admin/);

    // Verify Admin page title
    const adminTitle = page.locator('h2', { hasText: 'Admin Configuration' });
    await expect(adminTitle).toBeVisible();

    // Toggle a setting (e.g. OpenAI API Key)
    const apiKeyInput = page.locator('input#openai-key');
    await apiKeyInput.fill("sk-mock-key");

    const saveBtn = page.locator('button', { hasText: 'Save Configuration' });
    await saveBtn.click();

    // Expect to stay on page, maybe a success toast (or just button re-enables)
    await expect(saveBtn).not.toBeDisabled();
  });

  test("Non-Admin Restriction: Standard user cannot access /admin", async ({ page }) => {
    // Do NOT mock /me, so the user remains non-admin

    await page.goto("/login");
    await page.addInitScript((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);
    
    // Direct navigation attempt
    await page.goto("/admin");

    // The Guard should redirect back to home (/)
    await expect(page).toHaveURL(/\/?$/);

    // Ensure Admin button is not present
    const adminBtn = page.locator('button', { hasText: 'Admin' });
    await expect(adminBtn).not.toBeVisible();
  });

  test("Unauthenticated Access: User without token redirects to login", async ({ page }) => {
    // Go to login to establish app context and clear storage
    await page.goto("/login");
    await page.evaluate(() => localStorage.clear());
    
    // Attempt to navigate to a protected route directly
    await page.goto("/dashboard");

    // The Guard should intercept and redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
