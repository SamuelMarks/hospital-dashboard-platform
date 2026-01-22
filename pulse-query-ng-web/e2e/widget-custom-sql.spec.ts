import { test, expect } from './fixtures'; 

test.describe('Widget Wizard - Custom SQL Flow', () => { 

  // Setup: Create a fresh dashboard for this test to ensure a clean environment
  test.beforeEach(async ({ loggedInPage }) => { 
    await loggedInPage.goto('/'); 
    await loggedInPage.getByTestId('btn-create').click(); 
    
    // FIX: Use pressSequentially to simulate real user typing. 
    // This ensures Angular form validators fire reliably on every keystroke. 
    const input = loggedInPage.getByTestId('input-name'); 
    const dashName = `Auto Test ${Date.now()}`; 
    await input.pressSequentially(dashName, { delay: 50 }); 
    await input.blur(); 
    
    // Assert value is accepted before checking button
    await expect(input).toHaveValue(dashName); 

    // Explicitly wait for button enabling to avoid race condition
    const submitBtn = loggedInPage.getByTestId('btn-submit'); 
    await expect(submitBtn).toBeEnabled(); 
    await submitBtn.click(); 

    // Wait for navigation to complete
    await expect(loggedInPage).toHaveURL(/\/dashboard\//); 
    // Ensure toolbar loads to confirm layout readiness
    await expect(loggedInPage.locator('app-toolbar')).toBeVisible(); 
  }); 

  test('should create Custom SQL widget without getting stuck on configuration step', async ({ loggedInPage }) => { 
    // 1. Toggle "Edit Mode" 
    // Use the robust testid selector
    await loggedInPage.getByTestId('toggle-edit-mode').click(); 

    // 2. Click "Add Widget" 
    await loggedInPage.getByTestId('btn-add-widget').click(); 

    // 3. Switch to "Custom Query" Tab
    await loggedInPage.getByText('Custom Query').click(); 

    // 4. Select "SQL Database" Source Card
    const sqlOption = loggedInPage.locator('.source-option').filter({ hasText: 'SQL Database' }); 
    await expect(sqlOption).toBeVisible(); 
    await sqlOption.click(); 

    // 5. Click "Next: Configure" 
    const nextBtn = loggedInPage.getByRole('button', { name: 'Next: Configure' }); 
    await nextBtn.click(); 

    // 6. ASSERTION: Verify transition to Step 2
    // FIX: Scope the locator to the Widget Builder Dialog to distinguish it from the background Sidebar
    // The wizard is rendered inside 'app-widget-builder'. 
    const editor = loggedInPage.locator('app-widget-builder app-sql-builder'); 
    await expect(editor).toBeVisible({ timeout: 10000 }); 

    // 7. Config SQL
    // Interact with CodeMirror by filling the contenteditable area. 
    // FIX use .fill() to replace content. 
    // UPDATE: simplified query. Metric Card viz uses the FIRST column as the label. 
    // To ensure "Value" appears in the card and test passes, we make "Value" the only/first column.
    await editor.locator('.cm-content').fill('SELECT 100 as Value'); 

    // Run query to ensure data maps populate (required for visualization step usually) 
    await loggedInPage.getByRole('button', { name: 'Run Query' }).click(); 
    
    // Wait for the results table to ensure execution finished
    // FIX: Scope locator specifically to the SQL Builder result container to avoid ambiguity with hidden tables in other steps
    // FIX: Increased timeout to 15s to account for Cold Start latency in DuckDB/Backend
    await expect(loggedInPage.locator('app-sql-builder .result-container viz-table')).toBeVisible({ timeout: 15000 }); 

    // 8. Go to Visualization Step
    await loggedInPage.getByRole('button', { name: 'Next: Visualize' }).click(); 

    // 9. Select Visualization (Metric Card) 
    const metricCardOption = loggedInPage.locator('.viz-option').filter({ hasText: 'Metric Card' }); 
    await expect(metricCardOption).toBeVisible(); 
    await metricCardOption.click(); 

    // 10. Save Widget
    await loggedInPage.getByRole('button', { name: 'Save Widget' }).click(); 

    // 11. Final Verification
    await expect(loggedInPage.locator('app-widget-builder')).not.toBeVisible(); 
    
    const widget = loggedInPage.locator('app-widget'); 
    await expect(widget).toBeVisible(); 
    await expect(widget).toContainText('Value'); // Checks column header or label
  }); 

});