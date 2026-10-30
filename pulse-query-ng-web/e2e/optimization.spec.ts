/**
 * @fileoverview Angular E2E test suite for the Hospital Operations Optimization Workspace (`/optimization`).
 */

import { test, expect } from '@playwright/test';

test.describe('Hospital Operations Optimization Workspace (/optimization)', () => {
  test('renders What I Can Do, Quick Actions, and Use Case tabs', async ({ page }) => {
    await page.goto('/optimization');
    await expect(page.getByTestId('what-i-can-do-panel')).toBeVisible();
    await expect(page.getByTestId('quick-actions-toolbar')).toBeVisible();
    await expect(page.getByTestId('tab-use-case-service-unit')).toBeVisible();
    await expect(page.getByTestId('tab-use-case-surgical-scheduling')).toBeVisible();
    await expect(page.getByTestId('tab-use-case-staffing-optimization')).toBeVisible();
  });
});
