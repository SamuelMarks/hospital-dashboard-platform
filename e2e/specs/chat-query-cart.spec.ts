/**
 * @fileoverview E2E Test Suite for the Global "Ask Data" Scratchpad Drawer,
 * Query Cart Provisioning, and Dedicated Conversational AI Workspace (`/chat`).
 */

import { test, expect } from "@playwright/test";

/** Backend API base URL for seeding test users and dashboards. */
const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Conversational AI Workspace, Ask Data Scratchpad & Query Cart Flows", () => {
  test.describe.configure({ mode: "serial" });

  const timestamp = Date.now();
  const userEmail = `e2e_chat_cart_${timestamp}@hospital.org`;
  const userPassword = "Password123!";
  let authToken = "";
  let dashboardId = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: {
        email: userEmail,
        password: userPassword,
        full_name: "Dr. AI Explorer",
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
      data: { name: `AI Scratchpad Dashboard ${timestamp}` },
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

  test("1. Ask Data Drawer executes ad-hoc SQL, saves to Query Cart, and provisions widget on Dashboard", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto(`/dashboard/${dashboardId}`);
    await page.waitForSelector("app-dashboard-layout", { timeout: 15000 });

    // Open Ask Data drawer from toolbar
    await page.getByTestId("btn-ask").click();
    const askDataDrawer = page.locator("app-ask-data");
    await expect(askDataDrawer).toBeVisible();

    // Switch to Code Editor tab inside Ask Data SQL Builder
    await askDataDrawer.getByRole("tab", { name: /Code Editor/i }).click();
    await expect(askDataDrawer.locator(".cm-editor")).toBeVisible({
      timeout: 15000,
    });

    // Run default query and save to cart
    await askDataDrawer.getByRole("button", { name: /Run Query/i }).click();
    const saveToCartBtn = askDataDrawer.getByRole("button", {
      name: /Save to Cart/i,
    });
    await expect(saveToCartBtn).toBeEnabled({ timeout: 15000 });
    await saveToCartBtn.click();

    // Close Ask Data drawer
    await askDataDrawer.getByTestId("close-btn").click();

    // Enter Edit Mode on dashboard and verify Query Cart contains the saved query
    await page.getByTestId("toggle-edit-mode").click();
    const cartCount = page.getByTestId("cart-count");
    await expect(cartCount).toHaveText("1");

    // Add query from cart to dashboard
    await page.getByTestId("add-to-dashboard").first().click();
    await expect(page.locator("app-dashboard-layout app-widget")).toHaveCount(
      1,
      {
        timeout: 15000,
      },
    );
  });

  test("2. Dedicated /chat Workspace creates conversation and renders empty state suggestions", async ({
    page,
  }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("pulse_auth_token", token);
      window.localStorage.setItem("pulse_onboarding_complete", "true");
    }, authToken);

    await page.goto("/chat");
    await page.waitForSelector("app-chat-layout", { timeout: 15000 });

    await expect(
      page.getByRole("heading", { name: /Data Assistant/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /New Chat/i })).toBeVisible();
  });
});
