import { test, expect } from '@playwright/test';

test.describe('End-to-End Workflow', () => {
  test('Complete user journey from login to creating a dashboard and adding a widget', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'adminpass');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('mat-toolbar')).toBeVisible();

    // Create a new dashboard
    await page.click('button:has-text("Create")');
    await page.fill('input[placeholder="Dashboard Name"]', 'E2E Workflow Dashboard');
    await page.click('button:has-text("Save")');

    // Add a widget using template
    await page.click('button[aria-label="Add widget"]');
    await page.click('text="Template"');
    await page.click('text="Hospital Bed Occupancy"');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Create Widget")');

    // Verify widget exists
    await expect(page.locator('app-widget')).toHaveCount(1);
    await expect(page.locator('app-widget mat-card-title')).toContainText('Hospital Bed Occupancy');

    // Navigate to Simulation and run one
    await page.goto('/simulation');
    await expect(page.locator('h1')).toContainText('Simulation');
    await page.click('button:has-text("New Scenario")');
    await page.fill('input[placeholder="Scenario Name"]', 'E2E Stress Test');
    await page.click('button:has-text("Run")');

    // Verify simulation completed
    await expect(page.locator('text="Status: Completed"')).toBeVisible({ timeout: 10000 });
  });
});
