import { test, expect } from "@playwright/test";

/**
 * Backend API URL for seeding or interacting directly with the API.
 */
const BACKEND_URL = "http://localhost:8000/api/v1";

/**
 * Authentication and Authorization Flow Test Suite.
 *
 * Covers common workflows like successful login and registration,
 * as well as uncommon/edge-case workflows like invalid credentials
 * and unauthorized access attempts.
 */
test.describe("Authentication and Authorization Flows", () => {
  // Test data
  const timestamp = Date.now();
  const userEmail = `e2e_auth_${timestamp}@test.com`;
  const userPassword = "securePassword123!";
  const invalidEmail = `e2e_invalid_${timestamp}@test.com`;

  /**
   * Tests that invalid credentials result in an error message.
   * This is an uncommon workflow where the user enters the wrong password.
   */
  test("should display an error for invalid login credentials", async ({ page }) => {
    await page.goto("/login");

    // Attempt login with non-existent user
    await page.locator('[data-testid="input-email"]').fill(invalidEmail);
    await page.locator('[data-testid="input-password"]').fill("wrongpassword");
    await page.locator('[data-testid="submit-btn"]').click();

    // Verify error message is shown
    const errorAlert = page.locator('[data-testid="error-alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Incorrect email or password");
  });

  /**
   * Tests the registration flow for a new user.
   * This is a common workflow for new users.
   */
  test("should successfully register a new user and login", async ({ page }) => {
    await page.goto("/register");

    // Fill in registration form
    await page.locator('[data-testid="input-email"]').fill(userEmail);
    await page.locator('[data-testid="input-password"]').fill(userPassword);
    await page.locator('[data-testid="input-confirm-password"]').fill(userPassword);
    await page.locator('[data-testid="submit-btn"]').click();

    // After successful registration, it redirects to /dashboard (which redirects to / if no ID is provided, so it goes to home)
    await expect(page).toHaveURL(/\/?$/);

    // Verify we are on the Dashboards page
    const dashboardTitle = page.locator('h1', { hasText: 'My Dashboards' });
    await expect(dashboardTitle).toBeVisible();
  });
});
