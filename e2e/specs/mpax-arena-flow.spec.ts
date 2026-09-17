/**
 * @fileoverview E2E Test Suite for MPAX Arena LLM Benchmarking & Clinical Text-to-SQL Voting.
 */

import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("MPAX Arena Benchmarking & Voting Flow", () => {
  const timestamp = Date.now();
  const userEmail = `mpax_user_${timestamp}@test.com`;
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

  test("should render arena prompt input and execute model competition", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.evaluate((token) => {
      localStorage.setItem("pulse_auth_token", token);
    }, authToken);

    await page.goto("/mpax-arena");
    await expect(page).toHaveTitle(/MPAX Arena - Pulse Query/);

    // Assert arena input area is present
    const promptInput = page.locator("textarea, input[type='text']").first();
    await expect(promptInput).toBeVisible();

    await promptInput.fill("Calculate midnight census by ward for last week");

    const submitBtn = page.getByRole("button", { name: /Run Arena/i });
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();

    // Assert candidates grid, candidate cards, or results appear deterministically
    const candidatesArea = page
      .locator(".results-grid, .candidate-panel, .arena-candidates")
      .first();
    await expect(candidatesArea).toBeVisible({ timeout: 20000 });
  });
});
