import { test, expect } from './fixtures'; 

test.describe('Simulation Engine', () => { 

  test.beforeEach(async ({ loggedInPage }) => { 
    // 1. Navigate
    await loggedInPage.goto('/simulation'); 
    
    // 2. Wait for Hydration
    // Ensure certain static text specifically from the Simulation component layout is visible
    // This confirms Router has loaded the chunk and hydration swapped the nodes
    await expect(loggedInPage.getByText('Workload Simulation')).toBeVisible({ timeout: 10000 }); 
  }); 

  test('should run simulation and update metrics dynamically', async ({ loggedInPage }) => { 
    // Increase test timeout to handle potential backend latency or connection retries
    test.setTimeout(60000);

    // 3. Verify "Start Simulation" button exists
    const toggleBtn = loggedInPage.getByRole('button', { name: 'Start Simulation' }); 
    await expect(toggleBtn).toBeVisible(); 
    await expect(toggleBtn).toBeEnabled(); 

    // 4. Click "Start" with robust waiting
    // FIX: Removed force:true. We must rely on Playwright's actionability checks to ensure 
    // the Angular component is hydrated and the click listener is active.
    await toggleBtn.click(); 

    // 5. Verify toggle state change
    // Button text changes to "Stop Simulation" 
    // Verify using getByRole to ensure UI updated semantics
    // FIX: Increase timeout significantly (30s) to account for async interval start or backend latency
    await expect(loggedInPage.getByRole('button', { name: 'Stop Simulation' })).toBeVisible({ timeout: 30000 }); 
    
    // Status Badge check
    await expect(loggedInPage.getByText('Running', { exact: true })).toBeVisible(); 

    // 6. Verify Real-time Chart Activity
    const chart = loggedInPage.locator('viz-chart'); 
    await expect(chart).toBeVisible(); 
    
    // Wait for data points to accumulate (bars) 
    await expect(async () => { 
      const bars = await chart.locator('.bar, .bar-segment').count(); 
      expect(bars).toBeGreaterThan(0); 
    }).toPass({ timeout: 20000 }); 

    // 7. Adjust 'Users' Slider
    const usersSlider = loggedInPage.locator('input[aria-label="Concurrent Users Slider"]'); 
    
    // MatSlider interaction
    await usersSlider.fill('500'); 
    await usersSlider.dispatchEvent('change'); 
    await loggedInPage.keyboard.press('Tab'); // Trigger blur if needed

    // Verify "Active Conn" metric card updates to match slider 
    const activeConnCard = loggedInPage.locator('.metric-item').filter({ hasText: 'Active Conn' }); 
    
    // Expectation: ~500
    await expect(activeConnCard.locator('.metric-val')).toHaveText('500', { timeout: 10000 }); 
  }); 

});