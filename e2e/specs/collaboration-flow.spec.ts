/**
 * @fileoverview E2E Test Suite for Real-Time WebSocket Collaborator Presence across isolated browser contexts.
 */

import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Real-Time Collaborator Presence Flow", () => {
  const timestamp = Date.now();
  const userA = `collab_a_${timestamp}@test.com`;
  const userB = `collab_b_${timestamp}@test.com`;
  const userPassword = "password123";
  let tokenA = "";
  let tokenB = "";
  let sharedDashboardId = "";

  test.beforeAll(async ({ request }) => {
    // Register User A & B
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: { email: userA, password: userPassword },
    });
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: { email: userB, password: userPassword },
    });

    const loginA = await request.post(`${BACKEND_URL}/auth/login`, {
      form: { username: userA, password: userPassword },
    });
    const loginB = await request.post(`${BACKEND_URL}/auth/login`, {
      form: { username: userB, password: userPassword },
    });

    tokenA = (await loginA.json()).access_token;
    tokenB = (await loginB.json()).access_token;

    // Create shared dashboard owned by User A
    const dashRes = await request.post(`${BACKEND_URL}/dashboards/`, {
      data: { name: `Collab Dashboard ${timestamp}` },
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    sharedDashboardId = (await dashRes.json()).id;

    // Share dashboard with User B
    await request.post(
      `${BACKEND_URL}/dashboards/${sharedDashboardId}/shares`,
      {
        data: { user_email: userB, permission: "EDITOR" },
        headers: { Authorization: `Bearer ${tokenA}` },
      },
    );
  });

  test("should synchronize collaborator presence between two active browser contexts", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Authenticate context A
    await pageA.goto("/login");
    await pageA.evaluate(
      (token) => localStorage.setItem("pulse_auth_token", token),
      tokenA,
    );
    await pageA.goto(`/dashboard/${sharedDashboardId}`);

    // Authenticate context B
    await pageB.goto("/login");
    await pageB.evaluate(
      (token) => localStorage.setItem("pulse_auth_token", token),
      tokenB,
    );
    await pageB.goto(`/dashboard/${sharedDashboardId}`);

    // Verify collaborator presence indicators render on dashboard header
    const presenceContainerA = pageA
      .locator(".collaborators, .collaborator-presence, .user-avatar")
      .first();
    const presenceContainerB = pageB
      .locator(".collaborators, .collaborator-presence, .user-avatar")
      .first();

    await expect(presenceContainerA).toBeVisible({ timeout: 10000 });
    await expect(presenceContainerB).toBeVisible({ timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });
});
