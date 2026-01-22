import { test, expect } from './fixtures'; 

test.describe('Dashboard Lifecycle', () => { 
  // Generate a unique name to avoid collisions with existing data/other tests
  const dashboardName = `E2E Auto Dash ${Date.now()}`; 

  test('should complete full lifecycle: create, list, and delete', async ({ loggedInPage }) => { 
    // Critical: Increase timeout for multi-step scenario to account for backend latency and animations.
    test.setTimeout(60000); 
    
    // --- 1. CREATE --- 
    await test.step('Create Dashboard', async () => { 
      // Start at Home. Optimization: Check url to avoid redundant reload if fixture already placed us there.
      if (!loggedInPage.url().endsWith('/')) {
        await loggedInPage.goto('/'); 
      }
      
      // Explicitly wait for the create button to be actionable. 
      // This prevents "Test timeout" errors if the app takes a few seconds to hydrate.
      const createBtn = loggedInPage.getByTestId('btn-create');
      await expect(createBtn).toBeVisible({ timeout: 30000 });
      
      // Open Create Dialog
      await createBtn.click(); 
      
      // Dialog should be visible
      const dialogHeader = loggedInPage.getByRole('heading', { name: 'Create New Dashboard' }); 
      await expect(dialogHeader).toBeVisible(); 

      // Fill Form
      // Use pressSequentially ensures proper Angular form validation state updates
      await loggedInPage.getByTestId('input-name').pressSequentially(dashboardName, { delay: 50 }); 
      
      // Submit
      const submitBtn = loggedInPage.getByTestId('btn-submit');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click(); 

      // Verify success by checking URL redirection to /dashboard/{uuid} 
      await expect(loggedInPage).toHaveURL(/\/dashboard\//, { timeout: 15000 }); 
      
      // Verify toolbar displays the new name (confirming navigation to detailed view) 
      await expect(loggedInPage.locator('app-toolbar').getByText(dashboardName)).toBeVisible({ timeout: 15000 }); 
    }); 

    // --- 2. LIST --- 
    await test.step('List Dashboards', async () => { 
      // Navigate back to Home
      await loggedInPage.goto('/'); 
      
      // Verify Grid Container exists and spinner is gone
      const grid = loggedInPage.getByTestId('dashboard-grid'); 
      await expect(grid).toBeVisible({ timeout: 30000 }); 

      // Find the specific card
      const card = loggedInPage.locator('mat-card').filter({ hasText: dashboardName }); 
      
      // Assert it exists in the list
      await expect(card).toBeVisible(); 
    }); 

    // --- 3. DELETE --- 
    await test.step('Delete Dashboard', async () => { 
      // Identify the card again
      const card = loggedInPage.locator('mat-card').filter({ hasText: dashboardName }); 

      // Prepare to handle the native window.confirm() dialog
      // This must be set up BEFORE the action that triggers the dialog
      loggedInPage.once('dialog', dialog => { 
        expect(dialog.message()).toContain(`delete "${dashboardName}"`); 
        dialog.accept(); 
      }); 

      // Click the Menu Trigger on the card
      await card.getByTestId('btn-card-menu').click(); 

      // Click Delete option. 
      // Note: Angular Material Menus render in a global overlay container.
      const deleteItem = loggedInPage.getByRole('menuitem', { name: 'Delete' });
      await expect(deleteItem).toBeVisible();
      await deleteItem.click(); 

      // Verify the card is removed from DOM/view
      await expect(card).not.toBeVisible({ timeout: 15000 }); 
    }); 
  }); 
});