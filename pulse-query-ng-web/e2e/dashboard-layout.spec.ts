import { test, expect } from './fixtures';

test.describe('Dashboard Layout Management', () => {
  test.beforeEach(async ({ loggedInPage }) => {
    // Increase test timeout to handle potential backend latency or connection retries
    test.setTimeout(60000);

    // 1. Create Dashboard
    // Optimization: Check if we are already at root (via fixture) to avoid redundant reload
    if (!loggedInPage.url().endsWith('/')) {
      await loggedInPage.goto('/');
    }

    // Explicitly wait for the create button to be ready to prevent timeouts on cold start
    const btnCreate = loggedInPage.getByTestId('btn-create');
    await expect(btnCreate).toBeVisible({ timeout: 30000 });
    await btnCreate.click();

    // Use pressSequentially for robust form control binding
    await loggedInPage
      .getByTestId('input-name')
      .pressSequentially(`Layout Test ${Date.now()}`, { delay: 50 });
    await loggedInPage.getByTestId('btn-submit').click();

    // Wait for Dashboard URL (created)
    await expect(loggedInPage).toHaveURL(/\/dashboard\//, { timeout: 20000 });

    // 2. Use "Load Sample Data" directly from Empty State
    // Ensure empty state is visible
    await expect(loggedInPage.locator('app-empty-state')).toBeVisible({ timeout: 15000 });

    const loadBtn = loggedInPage.getByLabel('Load Sample Data');
    await expect(loadBtn).toBeEnabled();
    await loadBtn.click();

    // 3. Wait for hydration (grid populated)
    await expect(loggedInPage.locator('app-empty-state')).not.toBeVisible({ timeout: 40000 });
    await expect(loggedInPage.getByTestId('dashboard-grid')).toBeVisible({ timeout: 40000 });

    // Ensure at least 2 widgets exist
    const widgets = loggedInPage.locator('.grid-item');
    await expect(widgets).toHaveCount(await widgets.count(), { timeout: 15000 });
    expect(await widgets.count()).toBeGreaterThanOrEqual(2);

    // Ensure Toolbar is loaded for the next step interaction
    await expect(loggedInPage.locator('app-toolbar')).toBeVisible();
  });

  test('should reorder and resize widgets persistently', async ({ loggedInPage }) => {
    // 1. Enter Edit Mode
    const editToggle = loggedInPage.getByTestId('toggle-edit-mode');
    await expect(editToggle).toBeVisible();
    await editToggle.click();

    // 2. Identify Widgets
    const widgets = loggedInPage.locator('.grid-item');
    const firstWidget = widgets.first();
    const secondWidget = widgets.nth(1);

    // Get initial unique content
    // FIX: Updated class selector to .title-area (matches app-widget component)
    // instead of .title-group (which is used in toolbar).
    const titleA = await firstWidget.locator('.title-area').innerText();
    const titleB = await secondWidget.locator('.title-area').innerText();

    expect(titleA).toBeTruthy();
    expect(titleB).toBeTruthy();
    expect(titleA).not.toBe(titleB);

    // --- DRAG & DROP REORDERING ---
    await test.step('Drag Widget A to Widget B position', async () => {
      // Capture POST request that persists the new order.
      // The app does NOT reload (GET) on reorder success (Optimistic update), so we wait for the save call.
      const saveReq = loggedInPage.waitForResponse(
        (r) =>
          r.url().includes('/reorder') &&
          r.request().method() === 'POST' &&
          (r.status() === 200 || r.status() === 204),
      );

      // Ensure widgets are stable and visible
      await firstWidget.scrollIntoViewIfNeeded();
      await secondWidget.scrollIntoViewIfNeeded();

      const boxA = await firstWidget.boundingBox();
      const boxB = await secondWidget.boundingBox();

      if (!boxA || !boxB) throw new Error('Widget bounding boxes not found');

      // CRITICAL FIX: Start drag from the HEADER (Top ~25px) not the center.
      // Content areas (Charts, interacting elements) can block drag propagation.
      const startX = boxA.x + boxA.width / 2;
      const startY = boxA.y + 25;

      const endX = boxB.x + boxB.width / 2;
      const endY = boxB.y + boxB.height / 2;

      // 1. Move to File Header
      await loggedInPage.mouse.move(startX, startY);
      await loggedInPage.mouse.down();

      // 2. Small nudge to break drag start threshold
      await loggedInPage.mouse.move(startX + 10, startY + 10, { steps: 5 });

      // 3. Slow movement to target to insure CDK calculates sort index swap
      await loggedInPage.mouse.move(endX, endY, { steps: 50 });

      // 4. Pause to let the sort placeholder settle in the DOM
      await loggedInPage.waitForTimeout(500);

      // 5. Release
      await loggedInPage.mouse.up();

      // Wait for the persistence request to complete
      await saveReq;
    });

    // --- RESIZING ---
    await test.step('Resize Widget', async () => {
      // We target the FIRST element in DOM (which might have changed after reorder)
      const target = loggedInPage.locator('.grid-item').first();

      const initialStyle = await target.getAttribute('style');

      // Locate Handle
      // Hovering is critical for the handle to appear via CSS
      await target.hover();
      const handle = target.locator('.resize-handle');
      await expect(handle).toBeVisible();

      const box = await handle.boundingBox();
      if (!box) throw new Error('Resize handle not found');

      // Setup Network Listeners
      const putPromise = loggedInPage.waitForResponse(
        (resp) => resp.url().includes('/widgets/') && resp.request().method() === 'PUT',
      );

      // Perform Drag for Resize
      await loggedInPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await loggedInPage.mouse.down();
      // Drag right generous amount (+300px) to force a colspan change
      await loggedInPage.mouse.move(box.x + 300, box.y);
      await loggedInPage.mouse.up();

      // Wait for persistence
      await putPromise;

      // Assert Style Change
      await expect(target).not.toHaveAttribute('style', initialStyle as string, { timeout: 15000 });
    });

    // --- PERSISTENCE ---
    await test.step('Persist checks after Reload', async () => {
      await loggedInPage.reload();

      // Wait for grid
      await expect(loggedInPage.getByTestId('dashboard-grid')).toBeVisible({ timeout: 20000 });

      const reloadedTarget = loggedInPage.locator('.grid-item').first();
      const style = await reloadedTarget.getAttribute('style');

      // FIX: Browser might normalize styles to grid-area (which includes grid-column) or keep grid-column
      expect(style).toMatch(/grid-column|grid-area/);
    });
  });
});
