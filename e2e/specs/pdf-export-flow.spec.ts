/**
 * @fileoverview E2E Test Suite for Clinical Handover PDF Export and File Download.
 */

import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000/api/v1";

test.describe("Clinical PDF Report Export Flow", () => {
  const timestamp = Date.now();
  const userEmail = `pdf_user_${timestamp}@test.com`;
  const userPassword = "password123";
  let authToken = "";
  let dashboardId = "";

  test.beforeAll(async ({ request }) => {
    await request.post(`${BACKEND_URL}/auth/register`, {
      data: { email: userEmail, password: userPassword },
    });

    const loginRes = await request.post(`${BACKEND_URL}/auth/login`, {
      form: { username: userEmail, password: userPassword },
    });
    authToken = (await loginRes.json()).access_token;

    const dashRes = await request.post(`${BACKEND_URL}/dashboards/`, {
      data: { name: `PDF Export Dashboard ${timestamp}` },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    dashboardId = (await dashRes.json()).id;
  });

  test("should request PDF export via backend API and verify valid PDF byte-stream structure", async ({
    request,
  }) => {
    const pdfRes = await request.get(
      `${BACKEND_URL}/dashboards/${dashboardId}/export/pdf`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");

    const pdfBuffer = await pdfRes.body();
    const pdfText = pdfBuffer.toString("latin1");

    expect(pdfText.startsWith("%PDF-1.4")).toBeTruthy();
    expect(pdfText.includes("%%EOF")).toBeTruthy();
    expect(pdfText.includes("Pulse Query Clinical Report")).toBeTruthy();
  });
});
